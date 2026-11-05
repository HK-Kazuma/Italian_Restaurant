import * as THREE from 'three';
import type { GameConfig } from './config';
import { INGREDIENTS } from './ingredients';
import { BOTTLE_IDS } from './bottle';
import { LAYOUT, LEFT_COUNTER, SURFACES, type Layout } from './layout';
import { SAUCE_FILL_PER_UNIT, isMixed, isNoodle, needsMix } from './pot';
import { isSaucePartial } from './recipe';
import { Steam, type SteamOptions } from './steam';
import { type Rect, type World, rectAt } from './world';
import { FRIDGE_ITEM_IDS, FRIDGE_ITEM_NAME, FRIDGE_ITEM_SIZE, FRIDGE_SHELF_Y } from './fridge';
import type { Boiler, BottleId, FridgeItemId, FridgePreview, FridgeShelf, NoodleKind, TrayId, BottlePreview, GameState, IngredientId, Item, Pot, SurfaceId, Target } from './types';

// 厨房の3Dシーン。見た目はすべてプリミティブ（箱・円柱）で作るローポリのプレースホルダー。
// ゲームの状態は読むだけ（sync）で、ここからは state を書き換えない。

type Label = { sprite: THREE.Sprite; setText: (text: string, color?: string) => void };

export type Kitchen = {
  scene: THREE.Scene;
  interactables: THREE.Object3D[]; // userData.target に Target を持つルート
  world: World; // 歩ける範囲（壁の内側と、設備の当たり判定）
  handAnchor: THREE.Group; // カメラの子にする。手持ちの物の表示位置
  // トレー・ケースを手に持っているとき、サラダ台の置き場の位置と名前（HUD の矢印で使う）。持っていなければ null
  trayGuide: (state: GameState) => { world: THREE.Vector3; label: string } | null;
  // preview: 手に持ったボトルを置こうとしている場所（置く前の見せ方）。なければ null
  // fridgePreview: 冷蔵庫の中で持ち上げている物を、置こうとしている場所
  sync: (state: GameState, dt: number, preview?: BottlePreview | null, fridgePreview?: FridgePreview | null) => void;
};

export const TARGET_KEY = 'target';
// 視点が当たった点しだいで対象が変わる物（サラダ台の天板）は、userData にこの関数を持つ
export const RESOLVE_KEY = 'resolveTarget';

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
  sprite.renderOrder = 5; // 湯気（0）より後に描く

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
    const fontOf = (px: number) => `bold ${px}px "Yu Gothic", "Meiryo", sans-serif`;
    ctx.font = fontOf(52);
    const textWidth = ctx.measureText(t).width;
    if (textWidth > 464) ctx.font = fontOf(Math.floor((52 * 464) / textWidth)); // 枠（幅496）に収める
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

// --- 鍋の見た目：何がどれだけ入っているか、見て分かるようにする ---

// 決まった乱数（同じ鍋の中身なら毎回同じ配置にする。作り直しても具材が動かない）
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// パンチェッタ：細切れの細いベーコンが、バラバラに散らばった見た目（赤身と脂身の2色）。
// 入れた順序に関係なく、いちばん上の面（yAt）に載せるので、あとからソースを入れても埋もれない。
// heap > 0 なら、中央が盛り上がった山にする（鍋の底に少量だけあっても見えるように）
function addPancettaStrips(
  g: THREE.Group,
  count: number,
  seed: number,
  radius: number,
  yAt: (r: number) => number,
  heap = 0,
): void {
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const color = i % 3 === 0 ? 0xf6d5cf : INGREDIENTS.pancetta.color; // 3本に1本は脂身
    const strip = box(0.07, 0.006, 0.012, color, Math.cos(a) * r, yAt(r) + 0.003 + (i % 4) * 0.0015 + heap * (1 - r / radius), Math.sin(a) * r);
    strip.rotation.y = rnd() * Math.PI;
    g.add(strip);
  }
}

// 粒状の具材（ひき肉のかたまりなど）を散らす
function addChunks(
  g: THREE.Group,
  color: number,
  count: number,
  seed: number,
  radius: number,
  y: number,
  size: number,
): void {
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const chunk = box(size, size * 0.6, size, color, Math.cos(a) * r, y + size * 0.3, Math.sin(a) * r);
    chunk.rotation.y = rnd() * Math.PI;
    g.add(chunk);
  }
}

const POT_H = 0.14;
const POT_FLOOR = 0.012; // 鍋の底の厚み
const POT_MAX_DEPTH = 0.105; // ソースが満杯のときの深さ
const PANCETTA_STRIPS_PER_UNIT = 12; // パンチェッタ1掴みの本数

// 鍋の内側の半径（底は少しすぼまっている）
const potInnerRadius = (y: number) => 0.12 + 0.02 * (y / POT_H);

function buildPotMesh(pot: Pot): THREE.Group {
  const g = new THREE.Group();
  const bodyColor = pot.dirty ? 0x8d7b68 : 0xc9ced3;

  // 本体：上が開いた筒（内側も見える）と、底
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.13, POT_H, 20, 1, true),
    new THREE.MeshLambertMaterial({ color: bodyColor, side: THREE.DoubleSide }),
  );
  wall.position.y = POT_H / 2;
  g.add(wall);
  g.add(cyl(0.13, 0.13, POT_FLOOR, 0x2a2d31, 0, POT_FLOOR / 2, 0));
  g.add(box(0.04, 0.025, 0.14, 0x55595e, 0, 0.1, 0.22)); // 取っ手（手前向き）

  const units = (id: IngredientId) => pot.contents.filter((c) => c === id).length;

  // ソース：量に応じた高さの液面。ミートソースはお玉1杯で半分、2杯で満杯。
  // 複数のソースは、量で重みづけした色に混ざる
  let fill = 0;
  let r = 0;
  let gr = 0;
  let b = 0;
  for (const [id, per] of Object.entries(SAUCE_FILL_PER_UNIT) as [IngredientId, number][]) {
    const w = units(id) * per;
    if (w === 0) continue;
    const c = new THREE.Color(INGREDIENTS[id].color);
    fill += w;
    r += c.r * w;
    gr += c.g * w;
    b += c.b * w;
  }
  let surfaceY = POT_FLOOR;
  let sauceColor: number | null = null;
  if (fill > 0) {
    sauceColor = new THREE.Color(r / fill, gr / fill, b / fill).getHex();
    const h = Math.min(1, fill) * POT_MAX_DEPTH;
    surfaceY = POT_FLOOR + h;
    g.add(cyl(potInnerRadius(surfaceY) - 0.002, potInnerRadius(POT_FLOOR), h, sauceColor, 0, POT_FLOOR + h / 2, 0));
  }

  // ミートソースは、ひき肉のかたまりで見分けがつくようにする（トマトソースはなめらか）
  const meat = units('meatSauce');
  if (meat > 0) addChunks(g, 0x4a140c, 9 * meat, hashId('meatSauce'), 0.1, surfaceY, 0.02);

  // 麺：中央に山。まわりにソースが見える
  const noodles = pot.contents.filter(isNoodle);
  const hasNoodle = noodles.length > 0;
  // 混ぜる（Aパターンだけ）：クリックのたびに、山が低く広がり、ソースの色が絡んでいく。混ぜ終わると全体に広がる
  const mix = pot.mixNeed > 0 ? Math.min(1, pot.mixCount / pot.mixNeed) : 0;
  const moundR = 0.075 + (0.11 - 0.075) * mix;
  const moundH = 0.05 - 0.022 * mix;
  const moundTop = surfaceY + (hasNoodle ? moundH : 0.05);
  if (hasNoodle) {
    const base = new THREE.Color(INGREDIENTS[noodles[0]].color);
    if (sauceColor !== null) base.lerp(new THREE.Color(sauceColor), 0.6 * mix);
    g.add(cyl(moundR, moundR + 0.015, moundH, base.getHex(), 0, surfaceY + moundH / 2, 0));
  }

  // パンチェッタ：細切れのベーコンがバラバラ。入れた順序に関係なく、いちばん上に見える
  const pancetta = units('pancetta');
  if (pancetta > 0) {
    addPancettaStrips(g, PANCETTA_STRIPS_PER_UNIT * pancetta, hashId('pancetta'), 0.085, (rad) =>
      hasNoodle && rad < moundR ? moundTop : surfaceY,
      surfaceY === POT_FLOOR && !hasNoodle ? 0.085 : 0.03, // ソースも麺もなく底に少量だけのときは、高めの山にして見えるようにする
    );
  }

  // それ以外の具材（ほうれん草など）：その具材の色のかけらを散らす
  const others = new Set(pot.contents);
  for (const id of others) {
    if (id === 'pancetta' || id === 'meatSauce' || isNoodle(id) || SAUCE_FILL_PER_UNIT[id] !== undefined) continue;
    addChunks(g, INGREDIENTS[id].color, 8 * units(id), hashId(id), 0.1, hasNoodle ? moundTop : surfaceY, 0.03);
  }
  return g;
}

// ボトル（ドレッシング・パプリカパウダー）。高さ約0.2m
function buildBottle(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.035, 0.16, color, 0, 0.08, 0)); // 本体
  g.add(cyl(0.018, 0.022, 0.05, 0xf5f5f5, 0, 0.185, 0)); // 口
  return g;
}

// ほうれん草のトレー：平たい容器に、ほうれん草がこんもり
function buildSpinachTray(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.3, 0.04, 0.36, 0xdfe5e8, 0, 0.02, 0));
  g.add(box(0.26, 0.012, 0.32, 0x2a6b2e, 0, 0.046, 0));
  addChunks(g, INGREDIENTS.spinach.color, 22, hashId('spinachTray'), 0.12, 0.05, 0.05);
  return g;
}

// 塩オイルソースのパックが入ったケース：浅い箱に、パックが立てて並んでいる
function buildSaltOilCase(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.3, 0.07, 0.3, 0xdfe5e8, 0, 0.035, 0));
  for (let i = -2; i <= 2; i++) g.add(box(0.04, 0.13, 0.22, INGREDIENTS.saltOilSauce.color, i * 0.05, 0.1, 0));
  return g;
}

function buildTray(id: TrayId): THREE.Group {
  return id === 'spinach' ? buildSpinachTray() : buildSaltOilCase();
}

// お玉ですくう具材（手に持つとお玉で表示する）
// --- iPad：壁にかかっている物と、手に持った物で、同じ見た目を使う ---
const IPAD_SCREEN = { w: 0.5, h: 0.375 }; // 画面の大きさ（4:3）
const IPAD_BODY = { w: 0.56, h: 0.435, d: 0.018 }; // ふちを含めた本体

// 画面に映すホーム画面（遠くから見ても iPad と分かる絵）。一度だけ作って使い回す
let ipadScreenTexture: THREE.CanvasTexture | null = null;
function getIpadScreenTexture(): THREE.CanvasTexture {
  if (ipadScreenTexture) return ipadScreenTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 512, 384);
  bg.addColorStop(0, '#2b5876');
  bg.addColorStop(1, '#4e4376');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 384);
  const apps: [string, string, string][] = [
    ['#34c759', '▶', 'ゲーム開始'],
    ['#ff9f0a', '☰', 'レシピ'],
    ['#0a84ff', '？', '操作説明'],
  ];
  ctx.textAlign = 'center';
  apps.forEach(([color, glyph, name], i) => {
    const x = 56 + i * 150;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, 110, 112, 112, 28);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 60px "Yu Gothic", "Meiryo", sans-serif';
    ctx.fillText(glyph, x + 56, 168);
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 22px "Yu Gothic", "Meiryo", sans-serif';
    ctx.fillText(name, x + 56, 256);
  });
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.roundRect(196, 356, 120, 8, 4);
  ctx.fill();
  ipadScreenTexture = new THREE.CanvasTexture(canvas);
  ipadScreenTexture.colorSpace = THREE.SRGBColorSpace;
  return ipadScreenTexture;
}

// iPad の本体。画面は +z 側を向く（壁にかける物は、向きを回して部屋の側へ向ける）
function buildIpad(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(IPAD_BODY.w, IPAD_BODY.h, IPAD_BODY.d, 0x1b1b1f));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(IPAD_SCREEN.w, IPAD_SCREEN.h),
    new THREE.MeshLambertMaterial({ map: getIpadScreenTexture() }),
  );
  screen.position.z = IPAD_BODY.d / 2 + 0.001;
  g.add(screen);
  return g;
}

const LADLED: ReadonlySet<IngredientId> = new Set(['meatSauce', 'shrimp', 'garlic', 'chili', 'saltOilSauce']);
// トングでつかむ具材（手に持つとトングで表示する）
const TONGED: ReadonlySet<IngredientId> = new Set(['pancetta', 'chicken', 'spinach']);

function buildItemMesh(item: Item): THREE.Group {
  const root = new THREE.Group();
  const g = root; // plate 以外の見た目は root に直接積む（plate の中だけ、皿の本体 body を g として使う）
  switch (item.kind) {
    case 'rawNoodle':
      if (item.id === 'penne') {
        // ペンネ：短くて太い筒
        for (let i = -1; i <= 1; i++) g.add(cyl(0.035, 0.035, 0.16, 0xe8c872, i * 0.075, 0, 0));
      } else {
        for (let i = -1; i <= 1; i++) g.add(cyl(0.03, 0.03, 0.3, 0xf3e9c0, i * 0.065, 0, 0));
      }
      break;
    case 'ingredient': {
      const color = INGREDIENTS[item.id].color;
      if (isNoodle(item.id)) {
        g.add(cyl(0.14, 0.14, 0.07, color, 0, 0.035, 0));
      } else if (LADLED.has(item.id)) {
        g.add(cyl(0.012, 0.012, 0.3, 0x8a8f94, 0, 0.17, 0)); // 柄
        g.add(cyl(0.06, 0.04, 0.05, 0xc9ced3, 0, 0.025, 0)); // お玉の器
        g.add(cyl(0.05, 0.05, 0.01, color, 0, 0.05, 0)); // すくったソース
      } else if (TONGED.has(item.id)) {
        g.add(box(0.015, 0.3, 0.015, 0x8a8f94, -0.03, 0.17, 0).rotateZ(-0.1)); // トング
        g.add(box(0.015, 0.3, 0.015, 0x8a8f94, 0.03, 0.17, 0).rotateZ(0.1));
        g.add(box(0.08, 0.04, 0.05, color, 0, 0.02, 0)); // つかんだ具材
      } else {
        g.add(box(0.14, 0.05, 0.18, color, 0, 0.025, 0)); // パック
      }
      break;
    }
    case 'bottle':
      g.add(buildBottle(INGREDIENTS[item.id].color));
      break;
    case 'pack':
      // パックを重ねて持つ。1つずつ、温まったかどうかで袋の色が変わる
      item.packs.forEach((p, i) => {
        g.add(box(0.15, 0.04, 0.2, p.warm ? 0xf5c26b : 0xdfe8ee, 0, 0.02 + i * 0.043, 0)); // 袋
        g.add(box(0.1, 0.042, 0.08, INGREDIENTS[p.id].color, 0, 0.021 + i * 0.043, 0)); // ラベル
      });
      break;
    case 'tray':
      g.add(buildTray(item.id));
      break;
    case 'pot':
      g.add(buildPotMesh(item.pot));
      break;
    case 'ipad': {
      // 画面を自分（カメラ）に向けて、立てて持つ
      const pad = buildIpad();
      pad.position.y = 0.22;
      g.add(pad);
      break;
    }
    case 'plate': {
      // 皿の種類：普通の皿 / 小皿（ほうれん草のソテー）/ スープ皿（コーンスープ）
      const style = item.style ?? 'plate';
      const body = new THREE.Group();
      let y = 0.03;
      if (style === 'bowl') {
        body.add(cyl(0.21, 0.11, 0.09, 0xf5f5f5, 0, 0.045, 0)); // 深い器
        y = 0.075;
      } else {
        body.add(cyl(0.23, 0.18, 0.03, 0xf5f5f5, 0, 0.015, 0));
      }
      const g = body; // 中身は body に積む
      item.contents.forEach((id, i) => {
        if (id === 'saladBase') {
          g.add(cyl(0.17, 0.13, 0.08, INGREDIENTS[id].color, 0, y + 0.04, 0)); // 器に盛ったサラダ
          y += 0.08;
        } else if (id === 'noodle' || id === 'penne') {
          g.add(cyl(0.15, 0.17, 0.06, INGREDIENTS[id].color, 0, y + 0.03, 0));
          y += 0.06;
        } else if (id === 'pancetta') {
          addPancettaStrips(g, PANCETTA_STRIPS_PER_UNIT, hashId(id) + i, 0.12, () => y);
          y += 0.012;
        } else {
          const r = id === 'cornSoup' ? 0.17 : Math.max(0.05, 0.13 - i * 0.012);
          g.add(cyl(r, r, 0.014, INGREDIENTS[id].color, 0, y + 0.007, 0));
          y += 0.014;
        }
      });
      if (style === 'small') body.scale.setScalar(0.68);
      root.add(body);
      break;
    }
  }
  return root;
}

function itemSignature(item: Item | null): string {
  if (!item) return '';
  switch (item.kind) {
    case 'rawNoodle':
      return `raw:${item.id}`;
    case 'tray':
      return `tray:${item.id}`;
    case 'ingredient':
      return `ing:${item.id}`;
    case 'plate':
      return `plate:${item.style ?? 'plate'}:${item.contents.join(',')}`;
    case 'bottle':
      return `bottle:${item.id}`;
    case 'pack':
      return `pack:${item.packs.map((p) => `${p.id}${p.warm ? 1 : 0}`).join(',')}`;
    case 'pot':
      return `pot:${item.pot.dirty}:${item.pot.contents.join(',')}`;
    case 'ipad':
      return 'ipad';
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
// 茹で麺器はIHコンロ（z: -2.3〜-1.3）の奥に隙間なく接する（奥行き1.1）。天板の高さはIHコンロと同じ
const BOILER_Z = -2.85;
const BOILER_TOP = 0.8; // IHコンロの天板の高さ
const BASKET_UP = BOILER_TOP + 0.38; // かごが上がっている高さ
const BASKET_DOWN = BOILER_TOP + 0.07; // かごがお湯に浸かっている高さ

const NOODLE_COLORS = {
  set: 0xf3e9c0, // 生
  boiling: 0xf0d98a,
  lifted: 0xf2c94c, // 茹で上がり
  overdue: 0xb59b62, // のびかけ
} as const;

// ペンネ（黄みが強い）
const PENNE_COLORS = {
  set: 0xe8c872,
  boiling: 0xe3b85a,
  lifted: 0xe0a93d,
  overdue: 0xa88a4a,
} as const;

type BoilerView = {
  steam: Steam;
  basket: THREE.Group;
  noodles: Record<NoodleKind, THREE.Group>;
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
  label: Label;
  steam: Steam;
  pot: ItemView;
};

// 入っている麺の名前（ラベルの頭に付けて、何を茹でているか分かるようにする）
const NOODLE_NAMES = { noodle: '麺', penne: 'ペンネ' } as const;

function boilerLabel(b: Boiler): { text: string; color: string } {
  const name = NOODLE_NAMES[b.noodle];
  switch (b.state) {
    case 'empty':
      return { text: '空', color: '#9aa0a6' };
    case 'set':
      return { text: `${name} ボタンを押す`, color: '#ffe08a' };
    case 'boiling':
      return { text: `${name} 茹で中 ${Math.ceil(b.timer)}`, color: '#ffffff' };
    case 'lifted':
      return { text: `${name} 上がり！ ${Math.ceil(b.timer)}`, color: '#8be28b' };
    case 'overdue':
      return { text: `${name} のびかけ！`, color: '#ff8a80' };
    case 'shortBoil':
      return { text: `${name} ショート ${Math.ceil(b.timer)}`, color: '#ffe08a' };
  }
}

// かごの中の麺の見た目：スパゲッティは細くて長い麺の束、ペンネは短くて太い筒がたくさん
function buildBasketNoodles(): Record<NoodleKind, THREE.Group> {
  const strands = new THREE.Group();
  for (let i = 0; i < 15; i++) {
    // 3段に積み、いちばん上はかごの縁（高さ0.2）より少し出るようにして、横からでも見える
    const strand = cyl(0.012, 0.012, 0.34, NOODLE_COLORS.set, 0, 0.1 + Math.floor(i / 5) * 0.05, ((i % 5) - 2) * 0.065);
    strand.rotation.set(0, (i % 3 - 1) * 0.12, Math.PI / 2); // 横に寝かせ、少しずつ向きをずらして束ねる
    strands.add(strand);
  }
  const penne = new THREE.Group();
  const rnd = seeded(hashId('penneBasket'));
  for (let i = 0; i < 24; i++) {
    const tube = cyl(0.03, 0.03, 0.09, PENNE_COLORS.set, (rnd() - 0.5) * 0.28, 0.08 + (i % 4) * 0.04, (rnd() - 0.5) * 0.28);
    tube.rotation.set(0, rnd() * Math.PI, Math.PI / 2);
    penne.add(tube);
  }
  return { noodle: strands, penne };
}

function setGroupColor(g: THREE.Object3D, hex: number): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) (o.material as THREE.MeshLambertMaterial).color.setHex(hex);
  });
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

  // 後ろの壁（プレイヤーが最初に立つ場所の真後ろ）にかかっている iPad。練習キッチンのあいだだけある
  // 最初の位置（壁から 4m）からでも見つけやすいよう、手に持つ物より大きくしてある
  const IPAD_WALL_Y = 1.5;
  const IPAD_WALL_SCALE = 1.7;
  const ipadWall = new THREE.Group();
  const ipadOnWallView = buildIpad().rotateY(Math.PI); // 画面を部屋の側（-z）へ
  ipadWall.add(ipadOnWallView);
  // 手に持っている間は、iPad の代わりに「戻す場所」（空の台）を出す。これに左クリックで壁に戻せる
  const ipadDock = box(IPAD_BODY.w, IPAD_BODY.h, IPAD_BODY.d, 0x4a4a52);
  ipadDock.visible = false;
  ipadWall.add(ipadDock);
  ipadWall.scale.setScalar(IPAD_WALL_SCALE);
  ipadWall.position.set(0, IPAD_WALL_Y, roomMaxZ - 0.05 - (IPAD_BODY.d / 2) * IPAD_WALL_SCALE);
  setTarget(ipadWall, { kind: 'ipadWall' });
  scene.add(ipadWall);
  interactables.push(ipadWall);
  const ipadLabel = makeLabel('iPad（左クリックで取る）', 1.1);
  ipadLabel.sprite.position.set(0, IPAD_WALL_Y + 0.55, roomMaxZ - 0.15);
  scene.add(ipadLabel.sprite);

  // 湯気の発生源。parent の中の (x, y, z) から立ちのぼる
  const addSteam = (parent: THREE.Object3D, x: number, y: number, z: number, opts?: SteamOptions): Steam => {
    const steam = new Steam(opts);
    steam.group.position.set(x, y, z);
    parent.add(steam.group);
    return steam;
  };

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

  // IHの各口：鍋を置く場所（既定のソースを入れると自動で加熱が始まる。ボタンはない）
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

    const label = makeLabel('', 0.6);
    label.sprite.position.set(x, 1.08, -1.8);
    label.sprite.visible = false;
    scene.add(label.sprite);

    // 鍋の口の上から。加熱が進むほど、完成が近いほど多くなる
    const steam = addSteam(scene, x, 0.82 + POT_H, -1.8, { count: 16, rise: 0.55, spread: 0.07, size: 0.28 });
    burnerViews.push({ disc, label, pot: new ItemView(burner), steam });
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

  // --- 奥：茹で麺器（IHコンロと同じ高さ）---
  scene.add(box(3, BOILER_TOP, 1.1, 0x9aa3ab, 0, BOILER_TOP / 2, BOILER_Z));
  const boilerViews: BoilerView[] = [];
  for (let i = 0; i < cfg.boilerCount; i++) {
    const x = (i - (cfg.boilerCount - 1) / 2) * 0.7;
    scene.add(box(0.55, 0.02, 0.62, 0x3b82c4, x, BOILER_TOP + 0.01, BOILER_Z)); // お湯

    const basket = new THREE.Group();
    basket.add(box(0.4, 0.03, 0.4, 0xb4bac0, 0, 0, 0));
    basket.add(box(0.4, 0.2, 0.02, 0xb4bac0, 0, 0.1, 0.2));
    basket.add(box(0.4, 0.2, 0.02, 0xb4bac0, 0, 0.1, -0.2));
    basket.add(box(0.02, 0.2, 0.4, 0xb4bac0, 0.2, 0.1, 0));
    basket.add(box(0.02, 0.2, 0.4, 0xb4bac0, -0.2, 0.1, 0));
    basket.add(box(0.05, 0.05, 0.3, 0x55595e, 0, 0.2, 0.33)); // 持ち手
    const noodles = buildBasketNoodles();
    basket.add(noodles.noodle, noodles.penne);
    basket.position.set(x, BASKET_UP, BOILER_Z);
    setTarget(basket, { kind: 'boilerBasket', index: i });
    scene.add(basket);
    interactables.push(basket);

    const button = cyl(0.07, 0.07, 0.05, 0xc0392b, x, BOILER_TOP + 0.025, BOILER_Z + 0.5);
    setTarget(button, { kind: 'boilerButton', index: i });
    scene.add(button);
    interactables.push(button);

    const label = makeLabel('空', 0.66);
    label.sprite.position.set(x, BOILER_TOP + 0.8, BOILER_Z);
    scene.add(label.sprite);

    // お湯はいつも温かい（弱い湯気）。茹でている間は多い
    const steam = addSteam(scene, x, BOILER_TOP + 0.03, BOILER_Z, { count: 12, rise: 0.5, spread: 0.18, size: 0.3 });
    boilerViews.push({ basket, noodles, button, label, steam });
  }

  // 上：生麺の棚。上から見て茹で麺器の真上（高さは 2.15m のまま）
  const RACK_Z = BOILER_Z;
  const NOODLE_RACK_Y = 2.15; // 生麺の棚の高さ（スープ皿の棚は、これより少し低くする）
  const rack = new THREE.Group();
  rack.add(box(2, 0.06, 0.5, 0x8a6a4b));
  for (let i = 0; i < 5; i++) rack.add(cyl(0.05, 0.05, 0.36, 0xf3e9c0, (i - 2) * 0.35, 0.12, 0).rotateX(Math.PI / 2));
  rack.position.set(0, NOODLE_RACK_Y, RACK_Z);
  setTarget(rack, { kind: 'noodleRack' });
  scene.add(rack);
  interactables.push(rack);
  decor('生麺', 0, 2.55, RACK_Z, 0.7);

  // --- 左：皿とトッピングの台、提供台 ---
  // 手前の列（LX）：皿・盛り付け場所・提供台、奥の列（TX）：トッピング
  const LX = -2.4;
  const TX = -3.0;

  // 台の天板：ボトルを置く場所を選ぶために、視点が合っている点を調べられるようにする（上の面だけ）。
  // x, z は台の中心からの相対位置
  const tableTopResolver = (surface: SurfaceId, spot: THREE.Object3D) => (hit: THREE.Intersection): Target | null => {
    if (!hit.face || hit.face.normal.y < 0.5) return null;
    const local = spot.worldToLocal(hit.point.clone());
    return { kind: 'tableTop', surface, x: local.x, z: local.z };
  };

  // IHの左の台（皿・トッピング・提供台）。パセリのボトルも置ける
  const leftSpot = new THREE.Group();
  leftSpot.position.set(LEFT_COUNTER.x, 0, LEFT_COUNTER.z);
  scene.add(leftSpot);
  const leftBody = box(SURFACES.left.width, 0.9, SURFACES.left.depth, 0xb89f7a, 0, 0.45, 0);
  setTarget(leftBody, { kind: 'tableTop', surface: 'left', x: 0, z: 0 });
  leftBody.userData[RESOLVE_KEY] = tableTopResolver('left', leftSpot);
  leftSpot.add(leftBody);
  interactables.push(leftBody);

  const stack = new THREE.Group();
  for (let i = 0; i < 6; i++) stack.add(cyl(0.23, 0.2, 0.03, 0xf5f5f5, 0, 0.015 + i * 0.032, 0));
  stack.position.set(LX, 0.9, -1.5);
  setTarget(stack, { kind: 'plateStack' });
  scene.add(stack);
  interactables.push(stack);
  decor('皿', LX, 1.3, -1.5, 0.6);

  // 小皿の山（ほうれん草のソテー用）。パスタ皿の置き場の奥の列
  const smallStack = new THREE.Group();
  for (let i = 0; i < 6; i++) smallStack.add(cyl(0.15, 0.13, 0.025, 0xf5f5f5, 0, 0.0125 + i * 0.027, 0));
  smallStack.position.set(TX, 0.9, -1.4);
  setTarget(smallStack, { kind: 'plateStack', style: 'small' });
  scene.add(smallStack);
  interactables.push(smallStack);
  decor('小皿', TX, 1.2, -1.4, 0.5);

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

  const toppings: [IngredientId, number][] = [
    ['tarakoSauce', -0.75],
    ['nori', -0.25],
    ['cheese', 0.25],
  ];
  toppings.forEach(([id, z]) => {
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
  // 基準点＝前面（扉側）の中央。+x が奥行き、z が幅（2.0m）。棚は最下段・下段・中段・上段の4段。
  // 上段：サラダベース、中段：ミートソース缶とトマトソースの容器、下段：カルボナーラのパックなど、最下段：空き
  const fridgeSpot = new THREE.Group();
  fridgeSpot.position.set(layout.fridge.x, 0, layout.fridge.z);
  scene.add(fridgeSpot);

  const STEEL = 0xd5dde2;
  const fridge = new THREE.Group(); // 本体と扉。視点が合っている間、右クリックで開閉する
  setTarget(fridge, { kind: 'fridgeDoor' });
  fridgeSpot.add(fridge);
  interactables.push(fridge);
  fridge.add(box(0.04, 1.9, 2, 0xbfc9cf, 0.78, 0.95, 0)); // 背板
  fridge.add(box(0.8, 1.9, 0.04, STEEL, 0.4, 0.95, -0.98)); // 側板
  fridge.add(box(0.8, 1.9, 0.04, STEEL, 0.4, 0.95, 0.98));
  fridge.add(box(0.8, 0.04, 2, STEEL, 0.4, 1.88, 0)); // 天板
  fridge.add(box(0.8, 0.06, 2, 0x9aa3ab, 0.4, 0.03, 0)); // 底
  // 棚板（最下段・下段・中段・上段）：持ち上げた物を置く場所を選ぶために、視点が合った点を調べられるようにする（上の面だけ）
  FRIDGE_SHELF_Y.forEach((y, shelf) => {
    const board = box(0.76, 0.03, 1.92, 0xf1f5f7, 0.4, y, 0);
    const shelfId = shelf as FridgeShelf;
    setTarget(board, { kind: 'fridgeShelf', shelf: shelfId, x: 0, z: 0 });
    board.userData[RESOLVE_KEY] = (hit: THREE.Intersection): Target | null => {
      if (!hit.face || hit.face.normal.y < 0.5) return null;
      const local = fridgeSpot.worldToLocal(hit.point.clone());
      return { kind: 'fridgeShelf', shelf: shelfId, x: local.x, z: local.z };
    };
    fridgeSpot.add(board);
    interactables.push(board);
  });

  // 観音開きの扉：左右の端（z=±1.0）を蝶番にして、プレイヤー側へ90度ずつ開く
  const door = new THREE.Group(); // 手前側（z=+1.0）の扉
  door.add(box(0.05, 1.9, 1, 0xe9eef1, 0, 0.95, -0.5));
  door.add(box(0.04, 0.5, 0.05, 0x8a9096, -0.04, 1.0, -0.9)); // 取っ手
  door.position.set(0, 0, 1.0);
  fridge.add(door); // 回転は sync で state.fridgeOpen に合わせる
  const doorR = new THREE.Group(); // 奥側（z=-1.0）の扉
  doorR.add(box(0.05, 1.9, 1, 0xe9eef1, 0, 0.95, 0.5));
  doorR.add(box(0.04, 0.5, 0.05, 0x8a9096, -0.04, 1.0, 0.9));
  doorR.position.set(0, 0, -1.0);
  fridge.add(doorR);

  // 冷蔵庫の中の物。位置は state.fridgeItems（右クリックで持ち上げて、棚の好きな場所に置き直せる）から毎フレーム決める。
  // 扉が閉まっている間は取れない（game.ts 側で判定）
  const fridgeItems = new Map<FridgeItemId, THREE.Group>();
  const addFridgeItem = (id: FridgeItemId, obj: THREE.Group, target: Target) => {
    setTarget(obj, target);
    fridgeSpot.add(obj);
    interactables.push(obj);
    fridgeItems.set(id, obj);
  };
  const fridgeStock = (id: IngredientId): Target => ({ kind: 'stock', id, inFridge: true });

  // サラダベース：お皿にサラダが入ったもの（2つ重ねてある）
  const saladBases = new THREE.Group();
  for (const y of [0, 0.09]) {
    saladBases.add(cyl(0.17, 0.13, 0.05, 0xf5f5f5, 0, y + 0.025, 0)); // 器
    saladBases.add(cyl(0.15, 0.16, 0.07, INGREDIENTS.saladBase.color, 0, y + 0.085, 0)); // サラダ
  }
  addFridgeItem('saladBase', saladBases, fridgeStock('saladBase'));

  // トレー・ケース（取ると冷蔵庫から消える）：ほうれん草のトレー、塩オイルソースのケース
  addFridgeItem('spinachTray', buildTray('spinach'), { kind: 'fridgeTray', id: 'spinach' });
  addFridgeItem('saltOilCase', buildTray('saltOil'), { kind: 'fridgeTray', id: 'saltOil' });

  // ミートソース缶。クリックでお玉1杯すくう
  const can = new THREE.Group();
  can.add(cyl(0.1, 0.1, 0.18, INGREDIENTS.meatSauce.color, 0, 0.09, 0)); // 缶
  can.add(cyl(0.101, 0.101, 0.012, 0xcfd3d6, 0, 0.186, 0)); // ふた
  can.add(cyl(0.012, 0.012, 0.26, 0x8a8f94, 0.04, 0.3, 0).rotateZ(-0.35)); // お玉の柄
  can.add(cyl(0.045, 0.03, 0.04, 0xc9ced3, 0.09, 0.42, 0)); // お玉の器
  addFridgeItem('meatSauce', can, fridgeStock('meatSauce'));

  // トマトソースのパックが入った食材収納容器。クリックでパック1つ
  const tomato = new THREE.Group();
  tomato.add(box(0.3, 0.1, 0.34, 0xcfe8f5, 0, 0.05, 0));
  for (let i = -1; i <= 1; i++) tomato.add(box(0.12, 0.14, 0.03, INGREDIENTS.tomatoSauce.color, 0, 0.12, i * 0.09));
  addFridgeItem('tomatoSauce', tomato, fridgeStock('tomatoSauce'));

  // カルボナーラのパック（熱湯で温めてから鍋に入れる）、ペンネ（茹で麺器に麺と同じようにセットする）、
  // コーンスープのパック（熱湯で温めて、スープ皿に入れる）
  const packStack = (color: number, count: number) => {
    const g = new THREE.Group();
    for (let i = 0; i < count; i++) g.add(box(0.16, 0.04, 0.2, color, i * 0.01, 0.02 + i * 0.042, 0));
    return g;
  };
  addFridgeItem('carbonaraSauce', packStack(0xf3e3a1, 3), fridgeStock('carbonaraSauce'));

  const penne = new THREE.Group();
  penne.add(box(0.2, 0.12, 0.14, 0xf2dca0, 0, 0.06, 0));
  penne.add(box(0.205, 0.04, 0.145, 0xc0392b, 0, 0.07, 0));
  addFridgeItem('penne', penne, fridgeStock('penne'));

  addFridgeItem('cornSoup', packStack(INGREDIENTS.cornSoup.color, 4), fridgeStock('cornSoup'));

  // 名前のラベル（位置は毎フレーム、物に付いてくる）
  const fridgeLabels = new Map<FridgeItemId, Label>();
  for (const id of FRIDGE_ITEM_IDS) fridgeLabels.set(id, decorIn(fridgeSpot, FRIDGE_ITEM_NAME[id], 0.02, 1, 0, 0.4));
  decorIn(fridgeSpot, '冷蔵庫', 0.02, 2.05, 0, 0.5);

  // 置き直す前の見せ方：置こうとしている場所の印（物の大きさの板）と、薄い物。置ける間は緑、置けないときは赤
  const fridgeGhost = new THREE.Group();
  fridgeGhost.visible = false;
  const fridgeGhostPad = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.012, 1),
    new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  fridgeGhost.add(fridgeGhostPad);
  const fridgeGhostItems = new Map<FridgeItemId, THREE.Group>();
  for (const [id, group] of fridgeItems) {
    const copy = group.clone(true);
    copy.userData = {}; // 狙える対象ではない
    copy.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = (o.material as THREE.Material).clone() as THREE.MeshLambertMaterial;
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
        o.material = m;
      }
    });
    copy.visible = false;
    fridgeGhost.add(copy);
    fridgeGhostItems.set(id, copy);
  }
  fridgeSpot.add(fridgeGhost);

  // --- サラダ台 ---
  // 基準点＝天板の中心（1.5m × 3.0m）。左の列（x=-0.45）でサラダを作り、トレーを置き、ボトルを置く。
  // 中の列（x=+0.1）と右の列（x=+0.55）に、具材コーナー（具材・ソテーソース・スープ皿）を並べる。
  // z は +側（プレイヤー寄り）から並べる。
  const saladSpot = new THREE.Group();
  saladSpot.position.set(layout.saladTable.x, 0, layout.saladTable.z);
  scene.add(saladSpot);
  const SX_WORK = -0.45; // サラダを作る台・トレー置き場
  const SX_STOCK = 0.1; // 具材コーナー（中の列）
  const SX_STOCK2 = 0.55; // 具材コーナー（右の列）

  // 天板（ドレッシング・パプリカパウダー・パセリのボトルを置ける）
  const tableBody = box(SURFACES.salad.width, 0.9, SURFACES.salad.depth, 0xa9b4a0, 0, 0.45, 0);
  setTarget(tableBody, { kind: 'tableTop', surface: 'salad', x: 0, z: 0 });
  tableBody.userData[RESOLVE_KEY] = tableTopResolver('salad', saladSpot);
  saladSpot.add(tableBody);
  interactables.push(tableBody);

  // サラダを作る場所：皿の置き場の続き（state.plateSlots の plateSlotCount 番目以降）。スープ皿もここに置く
  for (let j = 0; j < cfg.saladSlotCount; j++) {
    const slot = new THREE.Group();
    slot.add(cyl(0.3, 0.3, 0.012, 0xcfc4ae, 0, 0.006, 0));
    slot.position.set(SX_WORK, 0.9, 1.05 - j * 0.7);
    setTarget(slot, { kind: 'plateSlot', index: cfg.plateSlotCount + j });
    saladSpot.add(slot);
    interactables.push(slot);
    slotViews.push(new ItemView(slot));
  }

  // トレー・ケース置き場：冷蔵庫から取ったものを、同じ種類の置き場に置くと、1回分ずつ取れる。
  // ほうれん草のトレー（トングで1掴み）、塩オイルソースのケース（お玉で1杯）
  const trayViews = new Map<TrayId, ItemView>();
  // 手に持っているトレー・ケースの置き場を、緑の印（置く範囲）と、上下に揺れる矢印で案内する
  const trayGuides = new Map<TrayId, { group: THREE.Group; pad: THREE.Mesh; arrow: THREE.Group }>();
  const traySlots = new Map<TrayId, THREE.Group>();
  const TRAY_NAMES: Record<TrayId, string> = { spinach: 'トレー置き場', saltOil: 'ケース置き場' };
  // 置いたあとは、置き場の名前ではなく、置いたものの名前を出す
  const TRAY_CONTENT_NAMES: Record<TrayId, string> = { spinach: 'ほうれん草', saltOil: '塩オイルソース' };
  // 名前の高さ：塩オイルソースは、隣の具材（ソテーソースなど）と同じ高さ（1.3m）にそろえる
  const TRAY_LABEL_Y: Record<TrayId, number> = { spinach: 1.2, saltOil: 1.3 };
  const trayLabels = new Map<TrayId, Label>();
  for (const [id, x, z, name] of [
    ['spinach', SX_WORK, -0.3, 'トレー置き場'],
    ['saltOil', SX_STOCK2, -0.2, 'ケース置き場'],
  ] as [TrayId, number, number, string][]) {
    const slot = new THREE.Group();
    slot.add(box(0.34, 0.012, 0.4, 0xcfc4ae, 0, 0.006, 0));
    slot.position.set(x, 0.9, z);
    setTarget(slot, { kind: 'traySlot', id });
    saladSpot.add(slot);
    interactables.push(slot);
    trayViews.set(id, new ItemView(slot));
    traySlots.set(id, slot);
    trayLabels.set(id, decorIn(saladSpot, name, x, TRAY_LABEL_Y[id], z, 0.5));

    const guide = new THREE.Group();
    guide.position.set(x, 0.9, z);
    guide.visible = false;
    const guideColor = 0x4cd964;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.012, 0.46),
      new THREE.MeshBasicMaterial({ color: guideColor, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    pad.position.y = 0.014;
    guide.add(pad);
    const arrow = new THREE.Group(); // 下向きの矢印（先が置き場を指す）
    const arrowMat = new THREE.MeshBasicMaterial({ color: guideColor });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 16), arrowMat);
    head.rotation.x = Math.PI; // 先を下へ
    head.position.y = 0.1;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), arrowMat);
    shaft.position.y = 0.3;
    arrow.add(head, shaft);
    guide.add(arrow);
    saladSpot.add(guide);
    trayGuides.set(id, { group: guide, pad, arrow });
  }

  // 具材コーナー：小エビ（お玉）、チキン・パンチェッタ（トング）、ガーリック・唐辛子（お玉）、ソテーソース（パック）
  const saladStocks: [IngredientId, number, number][] = [
    ['shrimp', SX_STOCK, 1.2], // 手前の冷蔵庫の角が、プレイヤーからの視線を遮らない位置から並べる
    ['chicken', SX_STOCK, 0.75],
    ['pancetta', SX_STOCK, 0.3],
    ['garlic', SX_STOCK, -0.15],
    ['chili', SX_STOCK, -0.6],
    ['sauteSauce', SX_STOCK2, 1.2],
  ];
  for (const [id, x, z] of saladStocks) {
    const t = new THREE.Group();
    t.add(box(0.4, 0.1, 0.4, 0xdad3c2, 0, 0.05, 0));
    t.add(box(0.3, 0.04, 0.3, INGREDIENTS[id].color, 0, 0.12, 0));
    t.position.set(x, 0.9, z);
    setTarget(t, { kind: 'stock', id });
    saladSpot.add(t);
    interactables.push(t);
    decorIn(saladSpot, INGREDIENTS[id].name, x, 1.3, z, 0.45);
  }

  // スープ皿の棚（コーンスープ用）：生麺の棚と同じ作り（脚のない棚板が宙に浮いている）で、高さは生麺の棚より少し低い。
  // 上のスープ皿をクリックして取り、サラダを作る台に置く
  const BOWL_X = SX_STOCK2;
  const BOWL_Z = 0.75;
  const SHELF_Y = NOODLE_RACK_Y - 0.1;
  const bowlShelf = new THREE.Group();
  bowlShelf.add(box(0.5, 0.06, 0.5, 0x8a6a4b)); // 棚板（生麺の棚と同じ厚み・色）
  const bowlStack = new THREE.Group();
  for (let i = 0; i < 5; i++) bowlStack.add(cyl(0.2, 0.1, 0.05, 0xf5f5f5, 0, 0.03 + 0.025 + i * 0.045, 0));
  bowlShelf.add(bowlStack);
  bowlShelf.position.set(BOWL_X, SHELF_Y, BOWL_Z);
  setTarget(bowlShelf, { kind: 'plateStack', style: 'bowl' });
  saladSpot.add(bowlShelf);
  interactables.push(bowlShelf);
  decorIn(saladSpot, 'スープ皿', BOWL_X, SHELF_Y + 0.4, BOWL_Z, 0.45);

  // ボトル（ドレッシング・パプリカパウダー・パセリ）：置ける台の天板の上のどこにでも置ける。
  // 位置は state.bottles（台の中心からの相対）。台の中心（surfaceOrigin）に足して、ワールド座標に置く
  const surfaceOrigin = (surface: SurfaceId) => (surface === 'salad' ? layout.saladTable : LEFT_COUNTER);
  const BOTTLE_SCALE = 1.4;
  const bottleViews = new Map<BottleId, { group: THREE.Group; label: Label }>();
  for (const id of BOTTLE_IDS) {
    const group = new THREE.Group();
    const mesh = buildBottle(INGREDIENTS[id].color);
    mesh.scale.setScalar(BOTTLE_SCALE);
    group.add(mesh);
    setTarget(group, { kind: 'bottle', id });
    scene.add(group);
    interactables.push(group);
    const label = decor(INGREDIENTS[id].name, 0, 1.3, 0, 0.45);
    bottleViews.set(id, { group, label });
  }

  // 置く前の見せ方：置こうとしている場所の印（輪）と、薄いボトル。置ける間は緑、置けないときは赤
  const ghost = new THREE.Group();
  ghost.visible = false;
  const ghostRing = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.12, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ghostRing.position.y = 0.906;
  ghost.add(ghostRing);
  const ghostBottles = new Map<BottleId, THREE.Group>();
  for (const id of BOTTLE_IDS) {
    const mesh = buildBottle(INGREDIENTS[id].color);
    mesh.scale.setScalar(BOTTLE_SCALE);
    mesh.position.y = 0.9;
    mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshLambertMaterial;
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
      }
    });
    mesh.visible = false;
    ghost.add(mesh);
    ghostBottles.set(id, mesh);
  }
  scene.add(ghost);

  // --- 熱湯 ---
  // 基準点＝中心。パックを浸けて余温めする
  const hotWaterSpot = new THREE.Group();
  hotWaterSpot.position.set(layout.hotWater.x, 0, layout.hotWater.z);
  scene.add(hotWaterSpot);
  hotWaterSpot.add(box(0.9, 0.8, 1, 0x9aa3ab, 0, 0.4, 0));
  hotWaterSpot.add(box(0.8, 0.02, 0.9, 0x5fb7e8, 0, 0.81, 0)); // 熱湯
  // パックを浸ける場所：3×3の9か所（左上から横に数える）
  const hotWaterViews: HotWaterView[] = [];
  const hwCols = cfg.hotWaterColumns;
  const hwRows = Math.ceil(cfg.hotWaterSlotCount / hwCols);
  for (let i = 0; i < cfg.hotWaterSlotCount; i++) {
    const x = ((i % hwCols) - (hwCols - 1) / 2) * 0.27;
    const z = (Math.floor(i / hwCols) - (hwRows - 1) / 2) * 0.3;
    const slot = new THREE.Group();
    slot.add(box(0.22, 0.01, 0.26, 0x3a86c0, 0, 0.005, 0)); // 浸ける場所の印
    slot.position.set(x, 0.82, z);
    setTarget(slot, { kind: 'hotWaterSlot', index: i });
    hotWaterSpot.add(slot);
    interactables.push(slot);

    const label = makeLabel('', 0.3);
    label.sprite.position.set(x, 1.0, z);
    label.sprite.visible = false;
    hotWaterSpot.add(label.sprite);
    hotWaterViews.push({ pack: new ItemView(slot), label });
  }
  decorIn(hotWaterSpot, '熱湯', 0, 0.55, 0.53, 0.5);
  decorIn(hotWaterSpot, '湯煎器', 0, 1.3, 0, 0.5); // 湯煎器の上に浮かぶ名前（パックのタイマーより上）
  const hotWaterSteam = addSteam(hotWaterSpot, 0, 0.83, 0, { count: 14, rise: 0.45, spread: 0.5, size: 0.28 });

  // --- 歩ける範囲：壁の内側と、設備の当たり判定（上から見た矩形）---
  // 設備の位置・大きさを変えたら、ここも合わせる（冷蔵庫・サラダ台・熱湯は layout.ts に追従する）
  const obstacles: Rect[] = [
    rectAt(0, -1.8, 3, 1), // IHコンロ（鍋置き場・洗浄機を含む）
    rectAt(0, BOILER_Z, 3, 1.1), // 茹で麺器
    rectAt(LEFT_COUNTER.x, LEFT_COUNTER.z, SURFACES.left.width, SURFACES.left.depth), // 左の台（皿・トッピング・提供台）
    rectAt(layout.hotWater.x, layout.hotWater.z, 0.9, 1), // 熱湯
    rectAt(layout.saladTable.x, layout.saladTable.z, SURFACES.salad.width, SURFACES.salad.depth), // サラダ台
    rectAt(layout.fridge.x + 0.4, layout.fridge.z, 0.8, 2), // 冷蔵庫（扉は含めない）
  ];
  const wallHalf = 0.05; // 壁の厚み(0.1)の半分
  const world: World = {
    bounds: {
      minX: roomMinX + wallHalf,
      maxX: roomMaxX - wallHalf,
      minZ: roomMinZ + wallHalf,
      maxZ: roomMaxZ - wallHalf,
    },
    obstacles,
  };

  // --- 手持ちの表示（カメラの右下）---
  const handAnchor = new THREE.Group();
  handAnchor.position.set(0.32, -0.3, -0.65);
  handAnchor.rotation.set(0.35, -0.3, 0);
  const handView = new ItemView(handAnchor, 0.6);

  // --- 毎フレームの同期 ---
  let guideTime = 0;
  const sync = (state: GameState, dt: number, preview: BottlePreview | null = null, fridgePreview: FridgePreview | null = null) => {
    const follow = Math.min(1, dt * 8);

    door.rotation.y += ((state.fridgeOpen ? Math.PI / 2 : 0) - door.rotation.y) * follow;
    doorR.rotation.y = -door.rotation.y;

    // 冷蔵庫の中の物：state.fridgeItems の場所（棚・奥行き・幅）に置く。
    // 持ち上げている最中の物と、取って冷蔵庫にないトレー・ケースは隠す。名前は、同じ棚の中で高さをずらして、重ならないようにする
    const inFridge = (id: FridgeItemId) =>
      id === 'spinachTray' ? state.trays.spinach === 'fridge' : id === 'saltOilCase' ? state.trays.saltOil === 'fridge' : true;
    const shownByShelf: FridgeItemId[][] = FRIDGE_SHELF_Y.map(() => []);
    for (const id of FRIDGE_ITEM_IDS) {
      const group = fridgeItems.get(id)!;
      const spot = state.fridgeItems[id];
      const shown = inFridge(id) && state.moving !== id;
      group.visible = shown;
      group.position.set(spot.x, FRIDGE_SHELF_Y[spot.shelf] + 0.015, spot.z);
      if (shown) shownByShelf[spot.shelf].push(id);
      fridgeLabels.get(id)!.sprite.visible = false;
    }
    shownByShelf.forEach((ids, shelf) => {
      ids.sort((a, b) => state.fridgeItems[b].z - state.fridgeItems[a].z).forEach((id, rank) => {
        const label = fridgeLabels.get(id)!;
        label.sprite.visible = state.fridgeOpen;
        label.sprite.position.set(0.02, FRIDGE_SHELF_Y[shelf] + 0.2 + rank * 0.07, state.fridgeItems[id].z);
      });
    });

    // 置こうとしている場所（板と薄い物）。置けない場所では赤
    fridgeGhost.visible = fridgePreview !== null;
    if (fridgePreview) {
      const size = FRIDGE_ITEM_SIZE[fridgePreview.item];
      fridgeGhost.position.set(fridgePreview.x, FRIDGE_SHELF_Y[fridgePreview.shelf] + 0.015, fridgePreview.z);
      fridgeGhostPad.scale.set(size.hx * 2, 1, size.hz * 2);
      (fridgeGhostPad.material as THREE.MeshBasicMaterial).color.setHex(fridgePreview.valid ? 0x4cd964 : 0xe5484d);
      for (const [id, ghost] of fridgeGhostItems) ghost.visible = id === fridgePreview.item;
    }

    // 台の上のボトル（手に持っている間は台の上から消える）
    for (const id of BOTTLE_IDS) {
      const v = bottleViews.get(id)!;
      const spot = state.bottles[id];
      v.group.visible = spot !== null;
      v.label.sprite.visible = spot !== null;
      if (spot) {
        const o = surfaceOrigin(spot.surface);
        v.group.position.set(o.x + spot.x, 0.9, o.z + spot.z);
        v.label.sprite.position.set(o.x + spot.x, 1.3, o.z + spot.z);
      }
    }

    // 置こうとしている場所（輪と薄いボトル）。置けない台・場所では赤
    ghost.visible = preview !== null;
    if (preview) {
      const o = surfaceOrigin(preview.surface);
      ghost.position.set(o.x + preview.x, 0, o.z + preview.z);
      (ghostRing.material as THREE.MeshBasicMaterial).color.setHex(preview.valid ? 0x4cd964 : 0xe5484d);
      for (const id of BOTTLE_IDS) ghostBottles.get(id)!.visible = id === preview.id;
    }

    // 湯気は、一時停止中（playing 以外）は止める
    const steamDt = state.phase === 'playing' ? dt : 0;

    // トレー・ケースを持っている間、置き場の印と矢印を出し、ゆっくり脈打たせる
    guideTime += steamDt;
    for (const [id, g] of trayGuides) {
      const holding = state.hand?.kind === 'tray' && state.hand.id === id;
      g.group.visible = holding;
      if (holding) {
        (g.pad.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.25 * Math.sin(guideTime * 5);
        g.arrow.position.y = 0.3 + 0.07 * Math.sin(guideTime * 4);
      }
    }
    hotWaterSteam.update(steamDt, 0.35);

    boilerViews.forEach((v, i) => {
      const b = state.boilers[i];
      v.steam.update(steamDt, b.state === 'boiling' || b.state === 'shortBoil' ? 0.85 : 0.2);
      const lowered = b.state === 'boiling' || b.state === 'shortBoil';
      const targetY = lowered ? BASKET_DOWN : BASKET_UP;
      v.basket.position.y += (targetY - v.basket.position.y) * follow;

      // かごの中：入れた麺の種類だけ見せる
      v.noodles.noodle.visible = b.state !== 'empty' && b.noodle === 'noodle';
      v.noodles.penne.visible = b.state !== 'empty' && b.noodle === 'penne';
      if (b.state !== 'empty') {
        const key = b.state === 'shortBoil' ? 'boiling' : b.state;
        setGroupColor(v.noodles[b.noodle], (b.noodle === 'penne' ? PENNE_COLORS : NOODLE_COLORS)[key]);
      }
      (v.button.material as THREE.MeshLambertMaterial).color.setHex(b.state === 'set' ? 0x2ecc71 : 0xc0392b);

      const { text, color } = boilerLabel(b);
      v.label.setText(text, color);
    });

    slotViews.forEach((v, i) => {
      const contents = state.plateSlots[i];
      v.show(contents ? { kind: 'plate', contents, style: state.plateStyles[i] } : null);
    });

    hotWaterViews.forEach((v, i) => {
      const pack = state.hotWater[i];
      v.pack.show(pack ? { kind: 'pack', packs: [pack] } : null);
      v.label.sprite.visible = !!pack;
      if (pack) {
        if (pack.warm) v.label.setText('済', '#8be28b');
        else v.label.setText(`${Math.floor(pack.soak)}`, '#ffffff');
      }
    });

    // ほうれん草のトレー：冷蔵庫にあるか、サラダ台に置かれているか（手に持っている間はどちらにもない）
    for (const [id, view] of trayViews) view.show(state.trays[id] === 'table' ? { kind: 'tray', id } : null);
    for (const [id, label] of trayLabels) label.setText(state.trays[id] === 'table' ? TRAY_CONTENT_NAMES[id] : TRAY_NAMES[id]);

    potViews.forEach((v, i) => {
      const pot = state.potSlots[i];
      v.show(pot ? { kind: 'pot', pot } : null);
    });
    burnerViews.forEach((v, i) => {
      const pot = state.ihBurners[i];
      v.pot.show(pot ? { kind: 'pot', pot } : null);

      const heat = pot?.heat ?? 'cold';
      (v.disc.material as THREE.MeshLambertMaterial).color.setHex(BURNER_COLORS[heat]);

      // 加熱が進むほど湯気が増え、完成するといちばん多い（焦げの手前で気づけるように）
      let steamLevel = 0;
      if (pot?.heat === 'heating') steamLevel = 0.15 + 0.6 * (1 - pot.heatTimer / cfg.sauceHeatTime);
      else if (pot?.heat === 'ready') steamLevel = 1;
      v.steam.update(steamDt, steamLevel);

      const hasContents = !!pot && pot.contents.length > 0;
      v.label.sprite.visible = hasContents;
      if (pot && hasContents) {
        // 既定のソースになると自動で加熱が始まる。それまでは、入れている途中か、作れない組み合わせか
        if (heat === 'cold') {
          if (isSaucePartial(pot.contents)) v.label.setText('材料を入れる', '#ffe08a');
          else v.label.setText('組み合わせ違い', '#ff8a80');
        } else if (heat === 'heating') {
          v.label.setText(`加熱中 ${Math.ceil(pot.heatTimer)}`, '#ffffff');
        } else if (needsMix(pot)) {
          // 麺を入れた鍋（Aパターン）は、混ぜてから皿にかける
          if (isMixed(pot)) v.label.setText('混ざった！', '#8be28b');
          else v.label.setText(`混ぜる ${pot.mixCount}/${pot.mixNeed}`, '#ffe08a');
        } else {
          v.label.setText('完成！', '#8be28b');
        }
      }
    });

    const w = state.washer;
    washerView.show(w.pot ? { kind: 'pot', pot: w.pot } : null);
    if (!w.pot) washerLabel.setText('鍋洗浄機');
    else if (w.pot.dirty) washerLabel.setText(`洗浄中 ${Math.ceil(w.timer)}`, '#ffe08a');
    else washerLabel.setText('洗い終わり！', '#8be28b');

    // 壁の iPad：練習キッチンで、誰も持っていない間だけ見える
    // 持っている間は、戻す場所だけ残す（なければ、壁に向けて左クリックできず、戻せなくなる）
    const practice = state.mode === 'practice';
    const holdingIpad = state.hand?.kind === 'ipad';
    ipadWall.visible = practice;
    ipadOnWallView.visible = !holdingIpad;
    ipadDock.visible = holdingIpad;
    ipadLabel.sprite.visible = practice;
    ipadLabel.setText(holdingIpad ? 'ここに戻す（左クリック）' : 'iPad（左クリックで取る）');

    handView.show(state.hand);
  };

  const trayGuide = (state: GameState) => {
    const hand = state.hand;
    if (hand?.kind !== 'tray') return null;
    const slot = traySlots.get(hand.id)!;
    const world = slot.getWorldPosition(new THREE.Vector3());
    world.y += 0.3;
    return { world, label: TRAY_NAMES[hand.id] };
  };

  return { scene, interactables, world, handAnchor, trayGuide, sync };
}
