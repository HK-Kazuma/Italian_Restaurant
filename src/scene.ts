import * as THREE from 'three';
import type { GameConfig } from './config';
import { INGREDIENTS } from './ingredients';
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

function buildItemMesh(item: Item): THREE.Group {
  const g = new THREE.Group();
  switch (item.kind) {
    case 'rawNoodle':
      for (let i = -1; i <= 1; i++) g.add(cyl(0.03, 0.03, 0.3, 0xf3e9c0, i * 0.065, 0, 0));
      break;
    case 'ingredient': {
      const color = INGREDIENTS[item.id].color;
      if (item.id === 'noodle') g.add(cyl(0.14, 0.14, 0.07, color, 0, 0.035, 0));
      else g.add(box(0.14, 0.05, 0.18, color, 0, 0.025, 0));
      break;
    }
    case 'plate': {
      g.add(cyl(0.23, 0.18, 0.03, 0xf5f5f5, 0, 0.015, 0));
      let y = 0.03;
      item.contents.forEach((id, i) => {
        if (id === 'noodle' || id === 'penne') {
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

export function createKitchen(cfg: GameConfig): Kitchen {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2724);
  const interactables: THREE.Object3D[] = [];

  // ライト
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a4a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 5, 3);
  scene.add(sun);

  // 部屋
  scene.add(box(8, 0.1, 8, 0xb9a98f, 0, -0.05, 0)); // 床
  scene.add(box(8, 3.2, 0.1, 0xe9e2d2, 0, 1.6, -4.1)); // 奥
  scene.add(box(8, 3.2, 0.1, 0xe9e2d2, 0, 1.6, 4.1)); // 手前
  scene.add(box(0.1, 3.2, 8, 0xe2dac6, -3.6, 1.6, 0)); // 左
  scene.add(box(0.1, 3.2, 8, 0xe2dac6, 3.6, 1.6, 0)); // 右
  scene.add(box(8, 0.1, 8, 0x5c5149, 0, 3.25, 0)); // 天井

  const decor = (text: string, x: number, y: number, z: number, width = 1.4) => {
    const l = makeLabel(text, width);
    l.sprite.position.set(x, y, z);
    scene.add(l.sprite);
  };

  // --- 正面：IHコンロ（未実装のプレースホルダー）---
  scene.add(box(3, 0.8, 1, 0x8c8f94, 0, 0.4, -1.8));
  for (let i = 0; i < 4; i++) scene.add(cyl(0.2, 0.2, 0.02, 0x1c1c1f, (i - 1.5) * 0.7, 0.81, -1.8));
  decor('IHコンロ（未実装）', 0, 0.55, -1.28, 1.0);
  decor('鍋収納・洗浄機（未実装）', 0, 0.25, -1.28, 1.0);

  // --- 奥：茹で麺器（IHの奥で一段高い）---
  scene.add(box(3, 1.15, 1.1, 0x9aa3ab, 0, 0.575, -3.2));
  const boilerViews: BoilerView[] = [];
  for (let i = 0; i < cfg.boilerCount; i++) {
    const x = (i - (cfg.boilerCount - 1) / 2) * 0.7;
    scene.add(box(0.55, 0.02, 0.62, 0x3b82c4, x, 1.16, -3.2)); // お湯

    const basket = new THREE.Group();
    basket.add(box(0.4, 0.03, 0.4, 0xb4bac0, 0, 0, 0));
    basket.add(box(0.4, 0.2, 0.02, 0xb4bac0, 0, 0.1, 0.2));
    basket.add(box(0.4, 0.2, 0.02, 0xb4bac0, 0, 0.1, -0.2));
    basket.add(box(0.02, 0.2, 0.4, 0xb4bac0, 0.2, 0.1, 0));
    basket.add(box(0.02, 0.2, 0.4, 0xb4bac0, -0.2, 0.1, 0));
    basket.add(box(0.05, 0.05, 0.3, 0x55595e, 0, 0.2, 0.33)); // 持ち手
    const noodle = cyl(0.15, 0.15, 0.1, NOODLE_COLORS.set, 0, 0.08, 0);
    basket.add(noodle);
    basket.position.set(x, BASKET_UP, -3.2);
    setTarget(basket, { kind: 'boilerBasket', index: i });
    scene.add(basket);
    interactables.push(basket);

    const button = cyl(0.07, 0.07, 0.05, 0xc0392b, x, 1.175, -2.7);
    setTarget(button, { kind: 'boilerButton', index: i });
    scene.add(button);
    interactables.push(button);

    const label = makeLabel('空', 0.66);
    label.sprite.position.set(x, 1.95, -3.2);
    scene.add(label.sprite);

    boilerViews.push({ basket, noodle, button, label });
  }

  // 上：生麺の棚
  const rack = new THREE.Group();
  rack.add(box(2, 0.06, 0.5, 0x8a6a4b));
  for (let i = 0; i < 5; i++) rack.add(cyl(0.05, 0.05, 0.36, 0xf3e9c0, (i - 2) * 0.35, 0.12, 0).rotateX(Math.PI / 2));
  rack.position.set(0, 2.15, -3.5);
  setTarget(rack, { kind: 'noodleRack' });
  scene.add(rack);
  interactables.push(rack);
  decor('生麺', 0, 2.55, -3.5, 0.7);

  // --- 左：皿とトッピングの台、提供台 ---
  const LX = -2.4;
  scene.add(box(1, 0.9, 4.4, 0xb89f7a, LX, 0.45, 0.2));

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

  const toppingIds: IngredientId[] = ['tarakoSauce', 'nori'];
  toppingIds.forEach((id, i) => {
    const z = 1.0 + i * 0.55;
    const t = new THREE.Group();
    t.add(box(0.4, 0.12, 0.4, 0xdad3c2, 0, 0.06, 0));
    t.add(box(0.3, 0.04, 0.3, INGREDIENTS[id].color, 0, 0.14, 0));
    t.position.set(LX, 0.9, z);
    setTarget(t, { kind: 'topping', id });
    scene.add(t);
    interactables.push(t);
    decor(INGREDIENTS[id].name, LX, 1.3, z, 0.6);
  });

  const pass = new THREE.Group();
  pass.add(box(0.7, 0.04, 0.7, 0x58b368, 0, 0.02, 0));
  pass.position.set(LX, 0.9, 2.1);
  setTarget(pass, { kind: 'servePass' });
  scene.add(pass);
  interactables.push(pass);
  decor('提供台', LX, 1.3, 2.1, 0.5);

  // --- 右：サラダ台と冷蔵庫（未実装のプレースホルダー）---
  scene.add(box(1, 0.9, 2.6, 0xa9b4a0, 2.4, 0.45, -0.7));
  decor('サラダ台（未実装）', 2.4, 1.3, -0.7, 1.4);
  scene.add(box(1, 1.9, 1.2, 0xc9d3d9, 2.4, 0.95, 1.5));
  decor('冷蔵庫（未実装）', 2.4, 2.2, 1.5, 1.4);

  // --- 手持ちの表示（カメラの右下）---
  const handAnchor = new THREE.Group();
  handAnchor.position.set(0.32, -0.3, -0.65);
  handAnchor.rotation.set(0.35, -0.3, 0);
  const handView = new ItemView(handAnchor, 0.6);

  // --- 毎フレームの同期 ---
  const sync = (state: GameState, dt: number) => {
    const follow = Math.min(1, dt * 8);

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

    handView.show(state.hand);
  };

  return { scene, interactables, handAnchor, sync };
}
