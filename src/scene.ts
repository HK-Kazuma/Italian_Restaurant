import * as THREE from 'three';
import type { GameConfig } from './config';
import { INGREDIENTS } from './ingredients';
import { LAYOUT, type Layout } from './layout';
import type { Boiler, GameState, IngredientId, Item, Target } from './types';

// 厨房の3Dシーン。見た目はすべてプリミティブ（箱・円柱）で作るローポリのプレースホルダー。
// ゲームの状態は読むだけ（sync）で、ここからは state を書き換えない。

type Label = { sprite: THREE.Sprite; setText: (text: string, color?: string) => void };

export type Kitchen = {
  scene: THREE.Scene;
  interactables: THREE.Object3D[]; // userData.target に Target を持つルート
  handAnchor: THREE.Group; // カメラの子にする。手持ちの物の表示位置
  sync: (state: GameState, dt: number) => void;
};

export const TARGET_KEY = 'target';

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 16), mat(color));
  m.position.set(x, y, z);
  return m;
}

function makeLabel(text: string, width = 1.2): Label {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(width, width / 4, 1);

  let current = '';
  const setText = (t: string, color = '#ffffff') => {
    const key = t + color;
    if (key === current) return;
    current = key;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(20, 20, 24, 0.72)';
    ctx.beginPath();
    ctx.roundRect(8, 16, 496, 96, 24);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 52px "Yu Gothic", "Meiryo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, 256, 66);
    texture.needsUpdate = true;
  };
  setText(text);
  return { sprite, setText };
}

function setTarget(obj: THREE.Object3D, target: Target): void {
  obj.userData[TARGET_KEY] = target;
}

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

// --- 手持ち・皿の見た目 ---

// お玉ですくう具材（手に持つとお玉で表示する）
const LADLED: ReadonlySet<IngredientId> = new Set(['meatSauce', 'shrimp']);
// トングでつかむ具材（手に持つとトングで表示する）
const TONGED: ReadonlySet<IngredientId> = new Set(['pancetta', 'chicken']);
// ボトル・容器から出す物（ドレッシングをかける、パプリカパウダーを振る）
const BOTTLED: ReadonlySet<IngredientId> = new Set(['dressing', 'paprika']);

function buildItemMesh(item: Item): THREE.Group {
  const g = new THREE.Group();
  switch (item.kind) {
    case 'rawNoodle':
      for (let i = -1; i <= 1; i++) g.add(cyl(0.03, 0.03, 0.3, 0xf3e9c0, i * 0.065, 0, 0));
      break;
    case 'ingredient': {
      const color = INGREDIENTS[item.id].color;
      if (item.id === 'noodle') {
        g.add(cyl(0.14, 0.14, 0.07, color, 0, 0.035, 0));
      } else if (LADLED.has(item.id)) {
        g.add(cyl(0.012, 0.012, 0.3, 0x8a8f94, 0, 0.17, 0)); // 柄
        g.add(cyl(0.06, 0.04, 0.05, 0xc9ced3, 0, 0.025, 0)); // お玉の器
        g.add(cyl(0.05, 0.05, 0.01, color, 0, 0.05, 0)); // すくったソース
      } else if (BOTTLED.has(item.id)) {
        g.add(cyl(0.035, 0.035, 0.16, color, 0, 0.08, 0)); // ボトル
        g.add(cyl(0.018, 0.022, 0.05, 0xf5f5f5, 0, 0.185, 0)); // 口
      } else if (TONGED.has(item.id)) {
        g.add(box(0.015, 0.3, 0.015, 0x8a8f94, -0.03, 0.17, 0).rotateZ(-0.1)); // トング
        g.add(box(0.015, 0.3, 0.015, 0x8a8f94, 0.03, 0.17, 0).rotateZ(0.1));
        g.add(box(0.08, 0.04, 0.05, color, 0, 0.02, 0)); // つかんだ具材
      } else {
        g.add(box(0.14, 0.05, 0.18, color, 0, 0.025, 0)); // パック
      }
      break;
    }
    case 'pack':
      g.add(box(0.15, 0.04, 0.2, item.pack.warm ? 0xf5c26b : 0xdfe8ee, 0, 0.02, 0)); // 袋（温まると色が変わる）
      g.add(box(0.1, 0.042, 0.08, INGREDIENTS[item.pack.id].color, 0, 0.021, 0)); // ラベル
      break;
    case 'pot': {
      const top = item.pot.contents.at(-1);
      g.add(cyl(0.15, 0.15, 0.14, item.pot.dirty ? 0x8d7b68 : 0xc9ced3, 0, 0.07, 0)); // 胴
      g.add(cyl(0.125, 0.125, 0.02, top ? INGREDIENTS[top].color : 0x2a2d31, 0, 0.145, 0)); // 内側（中身の色）
      g.add(box(0.04, 0.025, 0.14, 0x55595e, 0, 0.1, 0.22)); // 取っ手（手前向き）
      break;
    }
    case 'plate': {
      g.add(cyl(0.23, 0.18, 0.03, 0xf5f5f5, 0, 0.015, 0));
      let y = 0.03;
      item.contents.forEach((id, i) => {
        if (id === 'saladBase') {
          g.add(cyl(0.17, 0.13, 0.08, INGREDIENTS[id].color, 0, y + 0.04, 0)); // 器に盛ったサラダ
          y += 0.08;
        } else if (id === 'noodle' || id === 'penne') {
          g.add(cyl(0.15, 0.17, 0.06, INGREDIENTS[id].color, 0, y + 0.03, 0));
          y += 0.06;
        } else {
          const r = Math.max(0.05, 0.13 - i * 0.012);
          g.add(cyl(r, r, 0.014, INGREDIENTS[id].color, 0, y + 0.007, 0));
          y += 0.014;
        }
      });
      break;
    }
  }
  return g;
}

function itemSignature(item: Item | null): string {
  if (!item) return '';
  switch (item.kind) {
    case 'rawNoodle':
      return 'raw';
    case 'ingredient':
      return `ing:${item.id}`;
    case 'plate':
      return `plate:${item.contents.join(',')}`;
    case 'pack':
      return `pack:${item.pack.id}:${item.pack.warm}`;
    case 'pot':
      return `pot:${item.pot.dirty}:${item.pot.contents.join(',')}`;
  }
}

// 差分があるときだけ作り直す、1つのアイテム表示スロット
class ItemView {
  private sig = '';
  private mesh: THREE.Group | null = null;

  constructor(readonly parent: THREE.Object3D, private scale = 1) {}

  show(item: Item | null): void {
    const sig = itemSignature(item);
    if (sig === this.sig) return;
    this.sig = sig;
    if (this.mesh) {
      this.parent.remove(this.mesh);
      disposeTree(this.mesh);
      this.mesh = null;
    }
    if (item) {
      this.mesh = buildItemMesh(item);
      this.mesh.scale.setScalar(this.scale);
      this.parent.add(this.mesh);
    }
  }
}

// --- 茹で麺器 ---

// 茹で麺器はIHコンロ（z: -2.3〜-1.3）の奥に隙間なく接する（奥行き1.1）
const BOILER_Z = -2.85;
const BASKET_UP = 1.53;
const BASKET_DOWN = 1.22;

const NOODLE_COLORS = {
  set: 0xf3e9c0, // 生
  boiling: 0xf0d98a,
  lifted: 0xf2c94c, // 茹で上がり
  overdue: 0xb59b62, // のびかけ
} as const;

type BoilerView = {
  basket: THREE.Group;
  noodle: THREE.Mesh;
  button: THREE.Mesh;
  label: Label;
};

const BURNER_COLORS = {
  cold: 0x1c1c1f,
  heating: 0xe0501f,
  ready: 0x2e8b57, // 加熱完了
} as const;

type HotWaterView = {
  pack: ItemView;
  label: Label;
};

type BurnerView = {
  disc: THREE.Mesh;
  button: THREE.Mesh;
  label: Label;
  pot: ItemView;
};

function boilerLabel(b: Boiler): { text: string; color: string } {
  switch (b.state) {
    case 'empty':
      return { text: '空', color: '#9aa0a6' };
    case 'set':
      return { text: 'ボタンを押す', color: '#ffe08a' };
    case 'boiling':
      return { text: `茹で中 ${Math.ceil(b.timer)}`, color: '#ffffff' };
    case 'lifted':
      return { text: `上がり！ ${Math.ceil(b.timer)}`, color: '#8be28b' };
    case 'overdue':
      return { text: 'のびかけ！', color: '#ff8a80' };
    case 'shortBoil':
      return { text: `ショート ${Math.ceil(b.timer)}`, color: '#ffe08a' };
  }
}

export function createKitchen(cfg: GameConfig, layout: Layout = LAYOUT): Kitchen {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2724);
  const interactables: THREE.Object3D[] = [];

  // ライト
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a4a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 5, 3);
  scene.add(sun);

  // 部屋。冷蔵庫・サラダ台（layout.ts）がはみ出さないよう、右と奥の壁は必要なら広げる
  const roomMinX = -3.6;
  const roomMaxX = Math.max(3.6, layout.fridge.x + 0.8 + 0.1, layout.saladTable.x + 0.55 + 0.1);
  const roomMinZ = Math.min(-4.1, layout.saladTable.z - 1.35 - 0.1);
  const roomMaxZ = 4.1;
  const roomW = roomMaxX - roomMinX + 0.8; // 床・天井・奥/手前の壁の幅（壁の外へ少しはみ出す）
  const roomD = roomMaxZ - roomMinZ + 0.8;
  const roomCx = (roomMaxX + roomMinX) / 2;
  const roomCz = (roomMaxZ + roomMinZ) / 2;
  scene.add(box(roomW, 0.1, roomD, 0xb9a98f, roomCx, -0.05, roomCz)); // 床
  scene.add(box(roomW, 3.2, 0.1, 0xe9e2d2, roomCx, 1.6, roomMinZ)); // 奥
  scene.add(box(roomW, 3.2, 0.1, 0xe9e2d2, roomCx, 1.6, roomMaxZ)); // 手前
  scene.add(box(0.1, 3.2, roomD, 0xe2dac6, roomMinX, 1.6, roomCz)); // 左
  scene.add(box(0.1, 3.2, roomD, 0xe2dac6, roomMaxX, 1.6, roomCz)); // 右
  scene.add(box(roomW, 0.1, roomD, 0x5c5149, roomCx, 3.25, roomCz)); // 天井

  const decor = (text: string, x: number, y: number, z: number, width = 1.4) => {
    const l = makeLabel(text, width);
    l.sprite.position.set(x, y, z);
    scene.add(l.sprite);
    return l;
  };

  // --- 正面：IHコンロ（上面は未実装のプレースホルダー）と、その下の鍋洗浄機・鍋置き場 ---
  const CAB = 0x8c8f94;
  scene.add(box(3, 0.08, 1, CAB, 0, 0.76, -1.8)); // 天板
  scene.add(box(3, 0.72, 0.04, CAB, 0, 0.36, -2.28)); // 背板
  scene.add(box(0.04, 0.72, 1, CAB, -1.48, 0.36, -1.8)); // 左側板
  scene.add(box(0.04, 0.72, 1, CAB, 1.48, 0.36, -1.8)); // 右側板
  scene.add(box(3, 0.06, 1, 0x5d6065, 0, 0.03, -1.8)); // 底

  // IHの各口：鍋を置く場所と加熱ボタン
  const burnerViews: BurnerView[] = [];
  for (let i = 0; i < cfg.ihBurnerCount; i++) {
    const x = (i - (cfg.ihBurnerCount - 1) / 2) * 0.7;
    const burner = new THREE.Group();
    const disc = cyl(0.2, 0.2, 0.02, BURNER_COLORS.cold, 0, -0.01, 0);
    burner.add(disc);
    burner.position.set(x, 0.82, -1.8);
    setTarget(burner, { kind: 'ihBurner', index: i });
    scene.add(burner);
    interactables.push(burner);

    const button = cyl(0.06, 0.06, 0.03, 0xc0392b, x, 0.815, -1.42);
    setTarget(button, { kind: 'ihButton', index: i });
    scene.add(button);
    interactables.push(button);

    const label = makeLabel('', 0.6);
    label.sprite.position.set(x, 1.08, -1.8);
    label.sprite.visible = false;
    scene.add(label.sprite);

    burnerViews.push({ disc, button, label, pot: new ItemView(burner) });
  }

  // 鍋洗浄機（左）：ステンレスの箱に洗い槽。洗い槽が鍋を入れる場所
  const washer = new THREE.Group();
  washer.add(box(1, 0.3, 0.4, 0xc9ced3, 0, 0.21, 0));
  washer.add(box(0.6, 0.02, 0.3, 0x2f3a44, 0, 0.37, 0)); // 洗い槽
  washer.position.set(-0.93, 0, -1.5);
  setTarget(washer, { kind: 'washer' });
  scene.add(washer);
  interactables.push(washer);
  const washerPotAnchor = new THREE.Group();
  washerPotAnchor.position.set(0, 0.38, 0);
  washer.add(washerPotAnchor);
  const washerView = new ItemView(washerPotAnchor);
  scene.add(cyl(0.025, 0.025, 0.3, 0xaab0b6, -0.93, 0.5, -1.68)); // 蛇口の柱
  scene.add(box(0.05, 0.05, 0.18, 0xaab0b6, -0.93, 0.63, -1.6)); // 蛇口の先
  const washerLabel = makeLabel('鍋洗浄機', 0.6);
  washerLabel.sprite.position.set(-0.93, 0.76, -1.27);
  scene.add(washerLabel.sprite);

  // 鍋置き場（右）：棚に鍋を横一列に並べる。取っ手は手前向き
  const POT_X = 0.53;
  const POT_PITCH = 0.34;
  scene.add(box(1.9, 0.03, 0.55, 0xb89f7a, POT_X, 0.285, -1.58)); // 棚板
  const potViews: ItemView[] = [];
  for (let i = 0; i < cfg.potCount; i++) {
    const slot = new THREE.Group();
    slot.add(cyl(0.17, 0.17, 0.01, 0xa08760, 0, 0.005, 0)); // 置き場の印
    slot.position.set(POT_X + (i - (cfg.potCount - 1) / 2) * POT_PITCH, 0.3, -1.55);
    setTarget(slot, { kind: 'potSlot', index: i });
    scene.add(slot);
    interactables.push(slot);
    potViews.push(new ItemView(slot));
  }
  decor('鍋置き場', POT_X, 0.76, -1.27, 0.6);

  // --- 奥：茹で麺器（IHの奥で一段高い）---
  scene.add(box(3, 1.15, 1.1, 0x9aa3ab, 0, 0.575, BOILER_Z));
  const boilerViews: BoilerView[] = [];
  for (let i = 0; i < cfg.boilerCount; i++) {
    const x = (i - (cfg.boilerCount - 1) / 2) * 0.7;
    scene.add(box(0.55, 0.02, 0.62, 0x3b82c4, x, 1.16, BOILER_Z)); // お湯

    const basket = new THREE.Group();
    basket.add(box(0.4, 0.03, 0.4, 0xb4bac0, 0, 0, 0));
    basket.add(box(0.4, 0.2, 0.02, 0xb4bac0, 0, 0.1, 0.2));
    basket.add(box(0.4, 0.2, 0.02, 0xb4bac0, 0, 0.1, -0.2));
    basket.add(box(0.02, 0.2, 0.4, 0xb4bac0, 0.2, 0.1, 0));
    basket.add(box(0.02, 0.2, 0.4, 0xb4bac0, -0.2, 0.1, 0));
    basket.add(box(0.05, 0.05, 0.3, 0x55595e, 0, 0.2, 0.33)); // 持ち手
    const noodle = cyl(0.15, 0.15, 0.1, NOODLE_COLORS.set, 0, 0.08, 0);
    basket.add(noodle);
    basket.position.set(x, BASKET_UP, BOILER_Z);
    setTarget(basket, { kind: 'boilerBasket', index: i });
    scene.add(basket);
    interactables.push(basket);

    const button = cyl(0.07, 0.07, 0.05, 0xc0392b, x, 1.175, BOILER_Z + 0.5);
    setTarget(button, { kind: 'boilerButton', index: i });
    scene.add(button);
    interactables.push(button);

    const label = makeLabel('空', 0.66);
    label.sprite.position.set(x, 1.95, BOILER_Z);
    scene.add(label.sprite);

    boilerViews.push({ basket, noodle, button, label });
  }

  // 上：生麺の棚
  const rack = new THREE.Group();
  rack.add(box(2, 0.06, 0.5, 0x8a6a4b));
  for (let i = 0; i < 5; i++) rack.add(cyl(0.05, 0.05, 0.36, 0xf3e9c0, (i - 2) * 0.35, 0.12, 0).rotateX(Math.PI / 2));
  rack.position.set(0, 2.15, BOILER_Z - 0.3);
  setTarget(rack, { kind: 'noodleRack' });
  scene.add(rack);
  interactables.push(rack);
  decor('生麺', 0, 2.55, BOILER_Z - 0.3, 0.7);

  // --- 左：皿とトッピングの台、提供台 ---
  // 手前の列（LX）：皿・盛り付け場所・提供台、奥の列（TX）：トッピング
  const LX = -2.4;
  const TX = -3.0;
  scene.add(box(1.4, 0.9, 3.6, 0xb89f7a, -2.6, 0.45, -0.2));

  const stack = new THREE.Group();
  for (let i = 0; i < 6; i++) stack.add(cyl(0.23, 0.2, 0.03, 0xf5f5f5, 0, 0.015 + i * 0.032, 0));
  stack.position.set(LX, 0.9, -1.5);
  setTarget(stack, { kind: 'plateStack' });
  scene.add(stack);
  interactables.push(stack);
  decor('皿', LX, 1.3, -1.5, 0.6);

  const slotViews: ItemView[] = [];
  for (let i = 0; i < cfg.plateSlotCount; i++) {
    const slot = new THREE.Group();
    slot.add(cyl(0.3, 0.3, 0.012, 0xcfc4ae, 0, 0.006, 0));
    slot.position.set(LX, 0.9, -0.9 + i * 0.6);
    setTarget(slot, { kind: 'plateSlot', index: i });
    scene.add(slot);
    interactables.push(slot);
    slotViews.push(new ItemView(slot));
  }

  const toppingIds: IngredientId[] = ['tarakoSauce', 'nori', 'cheese', 'parsley', 'blackPepper'];
  toppingIds.forEach((id, i) => {
    const z = -0.75 + i * 0.5;
    const t = new THREE.Group();
    t.add(box(0.4, 0.12, 0.4, 0xdad3c2, 0, 0.06, 0));
    t.add(box(0.3, 0.04, 0.3, INGREDIENTS[id].color, 0, 0.14, 0));
    t.position.set(TX, 0.9, z);
    setTarget(t, { kind: 'stock', id });
    scene.add(t);
    interactables.push(t);
    decor(INGREDIENTS[id].name, TX, 1.3, z, 0.6);
  });

  const pass = new THREE.Group();
  pass.add(box(0.7, 0.04, 0.7, 0x58b368, 0, 0.02, 0));
  pass.position.set(LX, 0.9, 1.0);
  setTarget(pass, { kind: 'servePass' });
  scene.add(pass);
  interactables.push(pass);
  decor('提供台', LX, 1.3, 1.0, 0.5);

  // 位置は layout.ts で決める。以下の座標は、それぞれの基準点からの相対位置。
  const decorIn = (parent: THREE.Object3D, text: string, x: number, y: number, z: number, width = 1.4) => {
    const l = makeLabel(text, width);
    l.sprite.position.set(x, y, z);
    parent.add(l.sprite);
    return l;
  };

  // --- 冷蔵庫（右クリックで扉を開閉。最初は閉まっている）---
  // 基準点＝前面（扉側）の中央。+x が奥行き、z が幅。棚は下段・中段・上段。
  // 上段：サラダベース、中段：ミートソース缶とトマトソースの容器、下段：カルボナーラのパック
  const fridgeSpot = new THREE.Group();
  fridgeSpot.position.set(layout.fridge.x, 0, layout.fridge.z);
  scene.add(fridgeSpot);

  const STEEL = 0xd5dde2;
  const fridge = new THREE.Group(); // 本体と扉。視点が合っている間、右クリックで開閉する
  setTarget(fridge, { kind: 'fridgeDoor' });
  fridgeSpot.add(fridge);
  interactables.push(fridge);
  fridge.add(box(0.04, 1.9, 1, 0xbfc9cf, 0.78, 0.95, 0)); // 背板
  fridge.add(box(0.8, 1.9, 0.04, STEEL, 0.4, 0.95, -0.48)); // 側板
  fridge.add(box(0.8, 1.9, 0.04, STEEL, 0.4, 0.95, 0.48));
  fridge.add(box(0.8, 0.04, 1, STEEL, 0.4, 1.88, 0)); // 天板
  fridge.add(box(0.8, 0.06, 1, 0x9aa3ab, 0.4, 0.03, 0)); // 底
  const LOWER_SHELF_Y = 0.5;
  const MIDDLE_SHELF_Y = 0.95;
  const UPPER_SHELF_Y = 1.4;
  for (const y of [LOWER_SHELF_Y, MIDDLE_SHELF_Y, UPPER_SHELF_Y]) fridge.add(box(0.76, 0.03, 0.92, 0xf1f5f7, 0.4, y, 0));

  const door = new THREE.Group(); // 奥側（z=+0.5）を蝶番にして、プレイヤー側へ90度開く
  door.add(box(0.05, 1.9, 1, 0xe9eef1, 0, 0.95, -0.5));
  door.add(box(0.04, 0.5, 0.05, 0x8a9096, -0.04, 1.0, -0.9)); // 取っ手
  door.position.set(0, 0, 0.5);
  fridge.add(door); // 回転は sync で state.fridgeOpen に合わせる

  // 冷蔵庫の中の取り出し元。扉が閉まっている間は取れない（game.ts 側で判定）
  const addFridgeStock = (obj: THREE.Object3D, id: IngredientId) => {
    setTarget(obj, { kind: 'stock', id, inFridge: true });
    fridgeSpot.add(obj);
    interactables.push(obj);
  };

  // サラダベース（上段）：お皿にサラダが入ったもの
  const saladBases = new THREE.Group();
  for (const z of [-0.17, 0.17]) {
    saladBases.add(cyl(0.17, 0.13, 0.05, 0xf5f5f5, 0, 0.025, z)); // 器
    saladBases.add(cyl(0.15, 0.16, 0.07, INGREDIENTS.saladBase.color, 0, 0.085, z)); // サラダ
  }
  saladBases.position.set(0.37, UPPER_SHELF_Y + 0.015, 0);
  addFridgeStock(saladBases, 'saladBase');

  // ミートソース缶（中段）。クリックでお玉1杯すくう
  const can = new THREE.Group();
  can.add(cyl(0.1, 0.1, 0.18, INGREDIENTS.meatSauce.color, 0, 0.09, 0)); // 缶
  can.add(cyl(0.101, 0.101, 0.012, 0xcfd3d6, 0, 0.186, 0)); // ふた
  can.add(cyl(0.012, 0.012, 0.26, 0x8a8f94, 0.04, 0.3, 0).rotateZ(-0.35)); // お玉の柄
  can.add(cyl(0.045, 0.03, 0.04, 0xc9ced3, 0.09, 0.42, 0)); // お玉の器
  can.position.set(0.37, MIDDLE_SHELF_Y + 0.015, 0.25);
  addFridgeStock(can, 'meatSauce');

  // トマトソースのパックが入った食材収納容器（缶の隣）。クリックでパック1つ
  const tomato = new THREE.Group();
  tomato.add(box(0.3, 0.1, 0.34, 0xcfe8f5, 0, 0.05, 0));
  for (let i = -1; i <= 1; i++) tomato.add(box(0.12, 0.14, 0.03, INGREDIENTS.tomatoSauce.color, 0, 0.12, i * 0.09));
  tomato.position.set(0.37, MIDDLE_SHELF_Y + 0.015, -0.2);
  addFridgeStock(tomato, 'tomatoSauce');

  // カルボナーラのパック（下段）。熱湯で温めてから鍋に入れる
  const carbonara = new THREE.Group();
  for (let i = 0; i < 3; i++) carbonara.add(box(0.16, 0.04, 0.22, 0xf3e3a1, i * 0.01, 0.02 + i * 0.042, 0));
  carbonara.position.set(0.37, LOWER_SHELF_Y + 0.015, 0);
  addFridgeStock(carbonara, 'carbonaraSauce');

  const fridgeLabels = [
    decorIn(fridgeSpot, 'サラダベース', 0.02, 1.62, 0, 0.5),
    decorIn(fridgeSpot, 'ミートソース缶', 0.02, 1.32, 0.25, 0.42),
    decorIn(fridgeSpot, 'トマトソース', 0.02, 1.32, -0.2, 0.42),
    decorIn(fridgeSpot, 'カルボナーラ', 0.02, 0.78, 0, 0.5),
  ];
  decorIn(fridgeSpot, '冷蔵庫', 0.02, 2.05, 0, 0.5);

  // --- サラダ台 ---
  // 基準点＝天板の中心。手前の列（x=-0.2）でサラダを作り、奥の列（x=+0.3）に具材（具材コーナー）を並べる。
  // z は +0.85 側（プレイヤー寄り）から並べる。
  const saladSpot = new THREE.Group();
  saladSpot.position.set(layout.saladTable.x, 0, layout.saladTable.z);
  scene.add(saladSpot);
  const SX_WORK = -0.2;
  const SX_STOCK = 0.3;
  saladSpot.add(box(1.1, 0.9, 2.7, 0xa9b4a0, 0, 0.45, 0));

  // サラダを作る場所：皿の置き場の続き（state.plateSlots の plateSlotCount 番目以降）
  for (let j = 0; j < cfg.saladSlotCount; j++) {
    const slot = new THREE.Group();
    slot.add(cyl(0.3, 0.3, 0.012, 0xcfc4ae, 0, 0.006, 0));
    slot.position.set(SX_WORK, 0.9, 0.75 - j * 0.7);
    setTarget(slot, { kind: 'plateSlot', index: cfg.plateSlotCount + j });
    saladSpot.add(slot);
    interactables.push(slot);
    slotViews.push(new ItemView(slot));
  }
  decorIn(saladSpot, 'サラダを作る台', SX_WORK, 1.25, 0.4, 0.7);

  // 具材コーナー：小エビ（お玉）、チキン・パンチェッタ（トング）、ドレッシング・パプリカパウダー（ボトル）
  const saladStocks: { id: IngredientId; bottle?: boolean }[] = [
    { id: 'shrimp' },
    { id: 'chicken' },
    { id: 'pancetta' },
    { id: 'dressing', bottle: true },
    { id: 'paprika', bottle: true },
  ];
  saladStocks.forEach(({ id, bottle }, i) => {
    const z = 0.85 - i * 0.45; // 手前の冷蔵庫の角が、プレイヤーからの視線を遮らない位置から並べる
    const t = new THREE.Group();
    if (bottle) {
      t.add(cyl(0.06, 0.06, 0.22, INGREDIENTS[id].color, 0, 0.11, 0));
      t.add(cyl(0.03, 0.04, 0.06, 0xf5f5f5, 0, 0.25, 0));
    } else {
      t.add(box(0.4, 0.1, 0.4, 0xdad3c2, 0, 0.05, 0));
      t.add(box(0.3, 0.04, 0.3, INGREDIENTS[id].color, 0, 0.12, 0));
    }
    t.position.set(SX_STOCK, 0.9, z);
    setTarget(t, { kind: 'stock', id });
    saladSpot.add(t);
    interactables.push(t);
    decorIn(saladSpot, INGREDIENTS[id].name, SX_STOCK, 1.3, z, 0.45);
  });

  // --- 熱湯 ---
  // 基準点＝中心。パックを浸けて余温めする
  const hotWaterSpot = new THREE.Group();
  hotWaterSpot.position.set(layout.hotWater.x, 0, layout.hotWater.z);
  scene.add(hotWaterSpot);
  hotWaterSpot.add(box(0.9, 0.8, 1, 0x9aa3ab, 0, 0.4, 0));
  hotWaterSpot.add(box(0.8, 0.02, 0.9, 0x5fb7e8, 0, 0.81, 0)); // 熱湯
  const hotWaterViews: HotWaterView[] = [];
  for (let i = 0; i < cfg.hotWaterSlotCount; i++) {
    const x = (i - (cfg.hotWaterSlotCount - 1) / 2) * 0.27;
    const slot = new THREE.Group();
    slot.add(box(0.22, 0.01, 0.34, 0x3a86c0, 0, 0.005, 0)); // 浸ける場所の印
    slot.position.set(x, 0.82, 0);
    setTarget(slot, { kind: 'hotWaterSlot', index: i });
    hotWaterSpot.add(slot);
    interactables.push(slot);

    const label = makeLabel('', 0.4);
    label.sprite.position.set(x, 1.02, 0);
    label.sprite.visible = false;
    hotWaterSpot.add(label.sprite);
    hotWaterViews.push({ pack: new ItemView(slot), label });
  }
  decorIn(hotWaterSpot, '熱湯', 0, 0.55, 0.53, 0.5);

  // --- 手持ちの表示（カメラの右下）---
  const handAnchor = new THREE.Group();
  handAnchor.position.set(0.32, -0.3, -0.65);
  handAnchor.rotation.set(0.35, -0.3, 0);
  const handView = new ItemView(handAnchor, 0.6);

  // --- 毎フレームの同期 ---
  const sync = (state: GameState, dt: number) => {
    const follow = Math.min(1, dt * 8);

    door.rotation.y += ((state.fridgeOpen ? Math.PI / 2 : 0) - door.rotation.y) * follow;
    for (const l of fridgeLabels) l.sprite.visible = state.fridgeOpen;

    boilerViews.forEach((v, i) => {
      const b = state.boilers[i];
      const lowered = b.state === 'boiling' || b.state === 'shortBoil';
      const targetY = lowered ? BASKET_DOWN : BASKET_UP;
      v.basket.position.y += (targetY - v.basket.position.y) * follow;

      v.noodle.visible = b.state !== 'empty';
      if (b.state !== 'empty') {
        const key = b.state === 'shortBoil' ? 'boiling' : b.state;
        (v.noodle.material as THREE.MeshLambertMaterial).color.setHex(NOODLE_COLORS[key]);
      }
      (v.button.material as THREE.MeshLambertMaterial).color.setHex(b.state === 'set' ? 0x2ecc71 : 0xc0392b);

      const { text, color } = boilerLabel(b);
      v.label.setText(text, color);
    });

    slotViews.forEach((v, i) => {
      const contents = state.plateSlots[i];
      v.show(contents ? { kind: 'plate', contents } : null);
    });

    hotWaterViews.forEach((v, i) => {
      const pack = state.hotWater[i];
      v.pack.show(pack ? { kind: 'pack', pack } : null);
      v.label.sprite.visible = !!pack;
      if (pack) {
        if (pack.warm) v.label.setText('温まった！', '#8be28b');
        else v.label.setText(`温め中 ${Math.floor(pack.soak)}`, '#ffffff');
      }
    });

    potViews.forEach((v, i) => {
      const pot = state.potSlots[i];
      v.show(pot ? { kind: 'pot', pot } : null);
    });
    burnerViews.forEach((v, i) => {
      const pot = state.ihBurners[i];
      v.pot.show(pot ? { kind: 'pot', pot } : null);

      const heat = pot?.heat ?? 'cold';
      (v.disc.material as THREE.MeshLambertMaterial).color.setHex(BURNER_COLORS[heat]);

      const hasContents = !!pot && pot.contents.length > 0;
      v.label.sprite.visible = hasContents;
      if (pot && hasContents) {
        if (heat === 'cold') v.label.setText('ボタンで加熱', '#ffe08a');
        else if (heat === 'heating') v.label.setText(`加熱中 ${Math.ceil(pot.heatTimer)}`, '#ffffff');
        else v.label.setText('完成！', '#8be28b');
      }
      (v.button.material as THREE.MeshLambertMaterial).color.setHex(hasContents && heat === 'cold' ? 0x2ecc71 : 0xc0392b);
    });

    const w = state.washer;
    washerView.show(w.pot ? { kind: 'pot', pot: w.pot } : null);
    if (!w.pot) washerLabel.setText('鍋洗浄機');
    else if (w.pot.dirty) washerLabel.setText(`洗浄中 ${Math.ceil(w.timer)}`, '#ffe08a');
    else washerLabel.setText('洗い終わり！', '#8be28b');

    handView.show(state.hand);
  };

  return { scene, interactables, handAnchor, sync };
}
