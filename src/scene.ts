import * as THREE from 'three';
import type { GameConfig } from './config';
import { INGREDIENTS } from './ingredients';
import { BOTTLE_FRIDGE_ITEM, BOTTLE_IDS, bottleOfFridgeItem } from './bottle';
import { BAKE_DISHES, FREE_TRAY_HOME, GETA, HOT_WATER_COUNTER, LAYOUT, LEFT_COUNTER, OVEN, OVEN_BELT, OVEN_COUNTER, OVEN_COUNTER_ROW, OVEN_COUNTER_SHELF, OVEN_COUNTER_ZS, OVEN_Z, ROOM_MIN_X, SERVE_PASS, SURFACES, WALL_HALF, type Layout } from './layout';
import { BAKE_STYLES, OVEN_DECKS, OVEN_DECK_NAME, bakeState, bakeTime, beltSpeed, emergedCount, isEmerged, laneOfOffset, remainingTime } from './oven';
import { SAUCE_FILL_PER_UNIT, isNoodle } from './pot';
import { plateLabel, potMonitor, potPopup } from './labels';
import { Steam, type SteamOptions } from './steam';
import { matchesTarget, type GuideAt } from './tutorial';
import { type Rect, type World, rectAt } from './world';
import { FRIDGE_ITEM_IDS, FRIDGE_ITEM_NAME, FRIDGE_ITEM_SIZE, FRIDGE_SHELF_Y } from './fridge';
import { FREE_TRAY_IDS, TRAY_FRIDGE_ITEM, TRAY_IDS, TRAY_SPOT_COUNT, TRAY_ZONE, TRAY_ZONE_NAME, freeTraySpots, isFreeTray, trayAt, trayContentName, trayOfFridgeItem } from './tray';
import type { BakeState, BakeStyle, Boiler, BottleId, FreeTrayId, FridgeBottleId, FridgeItemId, FridgePreview, FridgeShelf, FridgeUnit, NoodleKind, OvenDeck, TrayId, TrayZone, BottlePreview, GetaPreview, OvenPreview, GameState, IngredientId, Item, Pot, SurfaceId, Target } from './types';

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
  // チュートリアルの矢印を、指定した設備（または台の上の位置）の上に出す。null で消す。
  // 矢印の先の位置（ワールド座標）を返す（画面の外にあるとき、HUD の縁の矢印で使う）。指す先が見つからなければ null
  setMarker: (at: GuideAt | null) => THREE.Vector3 | null;
  // preview: 手に持ったボトルを置こうとしている場所（置く前の見せ方）。なければ null
  // fridgePreview: 冷蔵庫の中で持ち上げている物を、置こうとしている場所
  // hover: いま視点が合っている設備。鍋・皿の中身の名前を、視点を合わせたときだけ出すために使う
  // ovenPreview: 手に持った焼き皿を、ジェットオーブンの入口のベルトに置こうとしている場所（置く前の見せ方）。なければ null
  // getaPreview: 持ち上げた下駄の山を、台の上に置こうとしている場所（置く前の見せ方）。なければ null
  sync: (state: GameState, dt: number, preview?: BottlePreview | null, fridgePreview?: FridgePreview | null, hover?: Target | null, ovenPreview?: OvenPreview | null, getaPreview?: GetaPreview | null) => void;
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
    // 厚めの角切り：赤身のピンクに、白い脂身の筋が入っている
    const lean = i % 2 === 0 ? 0xdc7d77 : 0xe9968f;
    const w = 0.04 + rnd() * 0.012;
    const strip = box(w, 0.011, 0.014 + rnd() * 0.004, lean, Math.cos(a) * r, yAt(r) + 0.006 + (i % 3) * 0.002 + heap * (1 - r / radius), Math.sin(a) * r);
    strip.add(box(w, 0.0115, 0.005, 0xf6e1d9, 0, 0.0003, 0.003 + rnd() * 0.002)); // 脂身の筋
    strip.rotation.set((rnd() - 0.5) * 0.3, rnd() * Math.PI, (rnd() - 0.5) * 0.3, 'YXZ');
    g.add(strip);
  }
}

// ほうれん草の葉：くたっとした、ツヤのある暗い緑の葉（fresh なら、生の明るい緑）と、明るい緑の茎
function addSpinachLeaves(
  g: THREE.Group,
  count: number,
  seed: number,
  radius: number,
  yAt: (r: number) => number,
  fresh = false,
): void {
  const rnd = seeded(seed);
  const leaf = new THREE.SphereGeometry(1, 8, 5);
  const leaves = (fresh ? [0x2f7d32, 0x3a8f3a, 0x277028, 0x46a042] : [0x1f4d1f, 0x173d1a, 0x2a5e24, 0x0f2e12, 0x3a7a2e]).map(mat);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const m = new THREE.Mesh(leaf, leaves[i % leaves.length]);
    m.scale.set(0.022 + rnd() * 0.026, 0.005, 0.015 + rnd() * 0.018);
    m.position.set(Math.cos(a) * r, yAt(r) + 0.002 + rnd() * 0.014, Math.sin(a) * r);
    m.rotation.set((rnd() - 0.5) * 1.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.2, 'YXZ');
    g.add(m);
  }
  const stem = new THREE.CylinderGeometry(0.003, 0.0042, 0.06, 6);
  const stemMat = mat(fresh ? 0x9fd46a : 0x8fcf5a);
  for (let i = 0; i < Math.max(2, Math.round(count / 14)); i++) {
    const r = Math.sqrt(rnd()) * radius * 0.9;
    const a = rnd() * Math.PI * 2;
    const s = new THREE.Mesh(stem, stemMat);
    s.position.set(Math.cos(a) * r, yAt(r) + 0.012 + rnd() * 0.008, Math.sin(a) * r);
    s.rotation.set((rnd() - 0.5) * 0.4, rnd() * Math.PI, Math.PI / 2 + (rnd() - 0.5) * 0.4, 'YXZ');
    g.add(s);
  }
}

// ほうれん草のソテー：くたっとした葉の山に、パンチェッタの角切りが載る。y0＝皿の面、n＝ほうれん草の量（掴み）
function addSpinachDish(g: THREE.Group, contents: readonly IngredientId[], seed: number, y0: number): void {
  const n = Math.max(1, contents.filter((id) => id === 'spinach').length);
  const R = Math.min(0.18, 0.1 + 0.04 * n);
  const H = 0.035 + 0.012 * n;
  const topAt = (r: number) => y0 + H * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
  const under = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x1a4020));
  under.scale.set(R * 0.98, H, R * 0.98);
  under.position.y = y0;
  g.add(under);
  addSpinachLeaves(g, 55 * n, seed, R * 0.95, topAt);
  if (contents.includes('pancetta')) addPancettaStrips(g, PANCETTA_STRIPS_PER_UNIT, seed + 7, R * 0.7, (r) => topAt(r) + 0.006);
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

// ガーリックスライス：小さくて薄い丸い輪切り。yAt(r) の高さの面に、少し重なりながら散らす
function addGarlicSlices(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number): void {
  const rnd = seeded(seed);
  const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.0025, 14);
  const colors = [mat(0xf3ecc8), mat(0xe9dfae), mat(0xf8f3d8)];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const slice = new THREE.Mesh(geo, colors[i % colors.length]);
    slice.position.set(Math.cos(a) * r, yAt(r) + 0.002 + rnd() * 0.006, Math.sin(a) * r);
    slice.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
    slice.scale.setScalar(0.85 + rnd() * 0.35);
    g.add(slice);
  }
}

// 唐辛子：細かいペッパー状のフレーク（赤い小さな粒と、少し黒ずんだ粒）
function addChiliFlakes(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number): void {
  const rnd = seeded(seed);
  const geo = new THREE.BoxGeometry(0.0065, 0.0022, 0.0045);
  const colors = [mat(0xc81818), mat(0xa81010), mat(0xdc2a1c), mat(0x7a0c0c)];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const flake = new THREE.Mesh(geo, colors[i % colors.length]);
    flake.position.set(Math.cos(a) * r, yAt(r) + 0.0015 + rnd() * 0.004, Math.sin(a) * r);
    flake.rotation.set((rnd() - 0.5) * 0.8, rnd() * Math.PI, (rnd() - 0.5) * 0.8);
    flake.scale.setScalar(0.7 + rnd() * 0.7);
    g.add(flake);
  }
}

// イカ：白い輪切り（皮のピンク紫がところどころ混ざる）
function addSquidPieces(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number, scale = 1): void {
  const rnd = seeded(seed);
  const ring = new THREE.TorusGeometry(0.014, 0.0045, 6, 14);
  const colors = [mat(0xf6efe6), mat(0xeadccf), mat(0xdcc2c2), mat(0xf1e6dc)];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const s = new THREE.Mesh(ring, colors[i % colors.length]);
    s.position.set(Math.cos(a) * r, yAt(r) + 0.005 + rnd() * 0.012 * scale, Math.sin(a) * r);
    s.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.9, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6, 'YXZ');
    s.scale.setScalar((0.8 + rnd() * 0.5) * scale);
    g.add(s);
  }
}

// きのこ：茶色のかさと、白っぽい軸のスライス
function addMushroomSlices(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number, scale = 1): void {
  const rnd = seeded(seed);
  const cap = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const stem = new THREE.CylinderGeometry(0.0045, 0.0055, 0.022, 6);
  const caps = [mat(0xa87a4d), mat(0xc09a6b), mat(0x8f6540)];
  const stemMat = mat(0xefe3cd);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const piece = new THREE.Group();
    const c = new THREE.Mesh(cap, caps[i % caps.length]);
    c.scale.set(0.02 * scale, 0.011 * scale, 0.017 * scale);
    c.position.y = 0.01 * scale;
    piece.add(c);
    const s = new THREE.Mesh(stem, stemMat);
    s.scale.setScalar(scale);
    s.position.y = 0.006 * scale;
    piece.add(s);
    piece.position.set(Math.cos(a) * r, yAt(r) + 0.002 + rnd() * 0.012 * scale, Math.sin(a) * r);
    piece.rotation.set((rnd() - 0.5) * 0.8, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.8, 'YXZ');
    g.add(piece);
  }
}

// わかめ：黒に近い深緑の、ツヤのあるぬるっとした葉（細長く、うねっている）。画像のように、ところどころ濃淡がある
function addWakame(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number, scale = 1): void {
  const rnd = seeded(seed);
  const geo = new THREE.SphereGeometry(1, 8, 5);
  const colors = [mat(0x1c4a28), mat(0x143a20), mat(0x2a5e30), mat(0x0f2e18), mat(0x24562c)];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const m = new THREE.Mesh(geo, colors[i % colors.length]);
    m.scale.set((0.026 + rnd() * 0.03) * scale, 0.004 * scale, (0.011 + rnd() * 0.014) * scale);
    m.position.set(Math.cos(a) * r, yAt(r) + 0.003 + rnd() * 0.02 * scale, Math.sin(a) * r);
    m.rotation.set((rnd() - 0.5) * 1.3, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.3, 'YXZ');
    g.add(m);
  }
}

// 野菜ペースト：薄い黄色のペーストのかたまりに、緑のかけら（パセリ）が混ざる
function addPasteChunks(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number): void {
  const rnd = seeded(seed);
  const blob = new THREE.SphereGeometry(1, 8, 5);
  const colors = [mat(0xe8dc8c), mat(0xf1e6a0), mat(0xd9cf7c)];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const m = new THREE.Mesh(blob, colors[i % colors.length]);
    m.scale.set(0.012 + rnd() * 0.012, 0.007 + rnd() * 0.004, 0.012 + rnd() * 0.01);
    m.position.set(Math.cos(a) * r, yAt(r) + 0.006 + rnd() * 0.012, Math.sin(a) * r);
    m.rotation.y = rnd() * Math.PI;
    g.add(m);
    if (i % 3 === 0) g.add(box(0.006, 0.003, 0.005, 0x4f9a3a, m.position.x + 0.005, m.position.y + 0.007, m.position.z));
  }
}

// ステンレスの丸い容器（ガーリック・唐辛子）。冷蔵庫から取って、台の上の好きな場所に置く。中身は山盛りで見える
const STEEL_BIN = { r: 0.17, h: 0.1 };
function buildSteelBin(id: 'garlic' | 'chili'): THREE.Group {
  const g = new THREE.Group();
  const { r, h } = STEEL_BIN;
  const steel = 0xc9ced3;
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 0.88, h, 32, 1, true),
    new THREE.MeshLambertMaterial({ color: steel, side: THREE.DoubleSide }),
  );
  wall.position.y = h / 2;
  g.add(wall);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.008, 32), mat(0x9aa0a6));
  floor.position.y = 0.004;
  g.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 8, 40), mat(0xe6eaee));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h;
  g.add(rim);
  // 中身：下地の層と、その上に山盛りの粒
  const fillTop = h - 0.02;
  const baseColor = id === 'garlic' ? 0xe9dfae : 0x9c1010;
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.85, fillTop - 0.008, 32), mat(baseColor));
  fill.position.y = 0.008 + (fillTop - 0.008) / 2;
  g.add(fill);
  const heap = (rr: number) => fillTop + 0.03 * (1 - Math.min(1, rr / (r * 0.9)) ** 2);
  if (id === 'garlic') addGarlicSlices(g, 90, hashId('garlic-bin'), r * 0.88, heap);
  else addChiliFlakes(g, 320, hashId('chili-bin'), r * 0.88, heap);
  return g;
}

// --- サラダ：写真のような見た目（ちぎったレタス＋紫キャベツ・にんじん・ミニトマト、小エビ、チキンのスライス、ドレッシング、パプリカ） ---

// 小エビ：丸まったエビ（ピンクとオレンジの2〜3色）を散らす
function addShrimp(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number, scale = 1): void {
  const rnd = seeded(seed);
  const geo = new THREE.TorusGeometry(0.013, 0.0072, 6, 10, Math.PI * 1.55);
  const colors = [mat(0xf3b49c), mat(0xefa184), mat(0xf8cdb9)];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const s = new THREE.Mesh(geo, colors[i % colors.length]);
    s.position.set(Math.cos(a) * r, yAt(r) + 0.004 + rnd() * 0.012 * scale, Math.sin(a) * r);
    s.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 1.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.8, 'YXZ');
    s.scale.setScalar((0.8 + rnd() * 0.5) * scale);
    g.add(s);
  }
}

// サラダチキン：厚みのある、薄いベージュのスライス
function addChickenSlices(g: THREE.Group, count: number, seed: number, radius: number, yAt: (r: number) => number): void {
  const rnd = seeded(seed);
  const geo = new THREE.SphereGeometry(1, 12, 6);
  const colors = [mat(0xefe0c8), mat(0xe6d3b4), mat(0xf5ead6)];
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const s = new THREE.Mesh(geo, colors[i % colors.length]);
    s.scale.set(0.04 + rnd() * 0.025, 0.007 + rnd() * 0.004, 0.022 + rnd() * 0.012);
    s.position.set(Math.cos(a) * r, yAt(r) + 0.006 + (i % 4) * 0.005, Math.sin(a) * r);
    s.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5, 'YXZ');
    g.add(s);
  }
}

// ドレッシング（オーロラ色）：とろっとした塊と、かけた筋
function addDressing(g: THREE.Group, seed: number, radius: number, yAt: (r: number) => number, color = 0xf2bd93): void {
  const rnd = seeded(seed);
  const blob = new THREE.SphereGeometry(1, 10, 6);
  const m = mat(color);
  for (let i = 0; i < 20; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const b = new THREE.Mesh(blob, m);
    b.scale.set(0.014 + rnd() * 0.02, 0.0035, 0.01 + rnd() * 0.014);
    b.position.set(Math.cos(a) * r, yAt(r) + 0.006, Math.sin(a) * r);
    b.rotation.y = rnd() * Math.PI;
    g.add(b);
  }
  const streak = new THREE.BoxGeometry(0.075, 0.003, 0.007);
  for (let i = 0; i < 8; i++) {
    const r = Math.sqrt(rnd()) * radius * 0.9;
    const a = rnd() * Math.PI * 2;
    const s = new THREE.Mesh(streak, m);
    s.position.set(Math.cos(a) * r, yAt(r) + 0.008, Math.sin(a) * r);
    s.rotation.y = rnd() * Math.PI;
    g.add(s);
  }
}

// パプリカパウダー：赤橙の細かい粒を、中央寄りにパラパラと
function addPaprika(g: THREE.Group, seed: number, radius: number, yAt: (r: number) => number): void {
  const rnd = seeded(seed);
  const geo = new THREE.BoxGeometry(0.0045, 0.0018, 0.0045);
  const colors = [mat(0xd2491d), mat(0xb83a12), mat(0xe0561f)];
  for (let i = 0; i < 90; i++) {
    const r = Math.sqrt(rnd()) * radius;
    const a = rnd() * Math.PI * 2;
    const p = new THREE.Mesh(geo, colors[i % colors.length]);
    p.position.set(Math.cos(a) * r, yAt(r) + 0.012 + rnd() * 0.005, Math.sin(a) * r);
    p.rotation.y = rnd() * Math.PI;
    g.add(p);
  }
}

// サラダベース：レタスの山（ちぎった葉を重ねる）。紫キャベツ・にんじん・ミニトマト入り。
// y0＝器の底の高さ、R＝山の半径、H＝山の高さ。戻り値は、山の表面の高さ（半径 r の位置）
function addSaladBase(g: THREE.Group, seed: number, y0: number, R: number, H: number): (r: number) => number {
  const rnd = seeded(seed);
  const topAt = (r: number) => y0 + 0.025 + H * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
  // 下地（葉のすき間から見える）
  const under = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9bcf6a));
  under.scale.set(R * 0.98, H, R * 0.98);
  under.position.y = y0 + 0.025;
  g.add(under);
  // ちぎったレタスの葉
  const leaf = new THREE.SphereGeometry(1, 8, 5);
  const greens = [mat(0xcde88a), mat(0xa6d56e), mat(0xe4f1b0), mat(0x82c25a), mat(0xd6eba0)];
  for (let i = 0; i < 120; i++) {
    const r = Math.sqrt(rnd()) * R * 0.96;
    const a = rnd() * Math.PI * 2;
    const m = new THREE.Mesh(leaf, greens[i % greens.length]);
    m.scale.set(0.028 + rnd() * 0.03, 0.005, 0.02 + rnd() * 0.02);
    m.position.set(Math.cos(a) * r, topAt(r) + 0.003 + rnd() * 0.012, Math.sin(a) * r);
    m.rotation.set((rnd() - 0.5) * 1.0, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.0, 'YXZ');
    g.add(m);
  }
  // 紫キャベツ・にんじんの細切り
  const cabbage = new THREE.BoxGeometry(0.055, 0.003, 0.005);
  const carrot = new THREE.BoxGeometry(0.04, 0.003, 0.004);
  const purple = [mat(0x8b3f9a), mat(0x6e2f86)];
  for (let i = 0; i < 28; i++) {
    const r = Math.sqrt(rnd()) * R * 0.9;
    const a = rnd() * Math.PI * 2;
    const isCabbage = i % 2 === 0;
    const m = new THREE.Mesh(isCabbage ? cabbage : carrot, isCabbage ? purple[(i >> 1) % 2] : mat(0xf28a24));
    m.position.set(Math.cos(a) * r, topAt(r) + 0.012, Math.sin(a) * r);
    m.rotation.set((rnd() - 0.5) * 0.4, rnd() * Math.PI, (rnd() - 0.5) * 0.4, 'YXZ');
    g.add(m);
  }
  // ミニトマト
  for (let i = 0; i < 2; i++) {
    const r = R * (0.55 + rnd() * 0.2);
    const a = (i + rnd() * 0.5) * Math.PI;
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), mat(0xd3201c));
    t.scale.y = 0.9;
    t.position.set(Math.cos(a) * r, topAt(r) + 0.01, Math.sin(a) * r);
    g.add(t);
  }
  return (r) => topAt(r) + 0.012;
}

// 盛り付けたサラダ：サラダベースの上に、入れた順に具材・ドレッシング・パプリカ
function addSaladDish(g: THREE.Group, contents: readonly IngredientId[], seed: number, y0: number, R: number, H: number): void {
  const base = addSaladBase(g, seed, y0, R, H);
  let lift = 0;
  const at = (r: number) => base(r) + lift;
  contents.forEach((id, i) => {
    if (id === 'saladBase') return;
    const s = seed + i * 101;
    if (id === 'shrimp') {
      addShrimp(g, 34, s, R * 0.85, at);
      lift += 0.012;
    } else if (id === 'chicken') {
      addChickenSlices(g, 9, s, R * 0.6, at);
      lift += 0.016;
    } else if (id === 'wakame') {
      addWakame(g, 30, s, R * 0.55, at); // 中央に、こんもり黒緑のわかめの山
      lift += 0.02;
    } else if (id === 'dressing') {
      addDressing(g, s, R * 0.8, at);
      lift += 0.004;
    } else if (id === 'paprika') {
      addPaprika(g, s, R * 0.4, at);
    }
  });
}

// リム小皿の料理（レタスのないサラダ）：わかめを敷いて、その上に小エビ・蒸し鶏が山盛り。
// 小エビのカクテルは、ピンク色のクリーミーなドレッシングが絡み、蒸し鶏はガルムソースと野菜ペーストがかかる。
// y0＝皿の底の高さ、R＝わかめを敷く範囲の半径
function addRimDish(g: THREE.Group, contents: readonly IngredientId[], seed: number, y0: number, R: number): void {
  const nWakame = Math.max(1, contents.filter((id) => id === 'wakame').length);
  const H = 0.03 + 0.012 * nWakame;
  const bedAt = (r: number) => y0 + H * Math.sqrt(Math.max(0, 1 - (r / R) ** 2));
  const under = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x10301a));
  under.scale.set(R * 0.98, H, R * 0.98);
  under.position.y = y0;
  g.add(under);
  let lift = 0;
  const at = (r: number) => bedAt(r) + lift;
  const pink = contents.includes('shrimp');
  contents.forEach((id, i) => {
    const s = seed + i * 101;
    if (id === 'wakame') {
      addWakame(g, 70, s, R * 0.95, bedAt);
    } else if (id === 'shrimp') {
      addShrimp(g, 28, s, R * 0.6, at);
      lift += 0.014;
    } else if (id === 'chicken') {
      addChickenSlices(g, 7, s, R * 0.5, at);
      lift += 0.022;
    } else if (id === 'dressing') {
      addDressing(g, s, R * 0.7, at, pink ? 0xf6b3a2 : 0xf2bd93); // 小エビには、ピンク色のドレッシング
      lift += 0.004;
    } else if (id === 'paprika') {
      addPaprika(g, s, R * 0.35, at);
    } else if (id === 'garum') {
      addDressing(g, s, R * 0.55, at, INGREDIENTS.garum.color);
      lift += 0.004;
    } else if (id === 'vegetablePaste') {
      addPasteChunks(g, 18, s, R * 0.4, at);
      lift += 0.01;
    }
  });
}

// 小エビ・チキン・パンチェッタ・イカ・きのこのトレー（ステンレスの浅いバット）。中身が山盛りで見える
function buildFoodPan(id: 'shrimp' | 'chicken' | 'pancetta' | 'squid' | 'mushroom' | 'wakame'): THREE.Group {
  const g = new THREE.Group();
  const steel = 0xc9ced3;
  g.add(box(0.4, 0.02, 0.4, 0x9aa0a6, 0, 0.01, 0));
  g.add(box(0.4, 0.08, 0.012, steel, 0, 0.04, 0.194));
  g.add(box(0.4, 0.08, 0.012, steel, 0, 0.04, -0.194));
  g.add(box(0.012, 0.08, 0.376, steel, 0.194, 0.04, 0));
  g.add(box(0.012, 0.08, 0.376, steel, -0.194, 0.04, 0));
  const base = { shrimp: 0xe9a98e, pancetta: 0xe08e88, chicken: 0xe0cba8, squid: 0xe9ddd0, mushroom: 0x9a7048, wakame: 0x163a22 }[id];
  g.add(box(0.376, 0.045, 0.376, base, 0, 0.0425, 0)); // 下地
  const heap = (r: number) => 0.065 + 0.035 * Math.max(0, 1 - (r / 0.21) ** 2);
  if (id === 'shrimp') addShrimp(g, 90, hashId('shrimp-pan'), 0.2, heap);
  else if (id === 'pancetta') addPancettaStrips(g, 34, hashId('pancetta-pan'), 0.18, heap);
  else if (id === 'squid') addSquidPieces(g, 85, hashId('squid-pan'), 0.19, heap);
  else if (id === 'mushroom') addMushroomSlices(g, 70, hashId('mushroom-pan'), 0.18, heap);
  else if (id === 'wakame') addWakame(g, 130, hashId('wakame-pan'), 0.19, heap);
  else addChickenSlices(g, 22, hashId('chicken-pan'), 0.19, heap);
  return g;
}

const POT_H = 0.14;
const POT_FLOOR = 0.012; // 鍋の底の厚み
const POT_MAX_DEPTH = 0.105; // ソースが満杯のときの深さ
const PANCETTA_STRIPS_PER_UNIT = 6; // パンチェッタ1掴みの角切りの数

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
    if (id === 'squid' || id === 'mushroom') {
      const y = hasNoodle ? moundTop : surfaceY;
      if (id === 'squid') addSquidPieces(g, 9 * units(id), hashId(id), 0.09, () => y, 0.9);
      else addMushroomSlices(g, 9 * units(id), hashId(id), 0.09, () => y, 0.9);
      continue;
    }
    if (id === 'spinach') {
      const y = hasNoodle ? moundTop : surfaceY;
      addSpinachLeaves(g, 22 * units(id), hashId(id), 0.1, (rad) => y + 0.02 * (1 - rad / 0.1));
      continue;
    }
    if (id === 'garlic' || id === 'chili') {
      const y = hasNoodle ? moundTop : surfaceY;
      if (id === 'garlic') addGarlicSlices(g, 10 * units(id), hashId(id), 0.1, () => y);
      else addChiliFlakes(g, 45 * units(id), hashId(id), 0.1, () => y);
      continue;
    }
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
  const white = 0xdfe5e8;
  g.add(box(0.3, 0.02, 0.36, white, 0, 0.01, 0));
  g.add(box(0.3, 0.05, 0.012, white, 0, 0.045, 0.174));
  g.add(box(0.3, 0.05, 0.012, white, 0, 0.045, -0.174));
  g.add(box(0.012, 0.05, 0.336, white, 0.144, 0.045, 0));
  g.add(box(0.012, 0.05, 0.336, white, -0.144, 0.045, 0));
  g.add(box(0.276, 0.03, 0.336, 0x2a6b2e, 0, 0.035, 0)); // 下地
  // 生の葉（明るい緑・茎つき）が、こんもり
  addSpinachLeaves(g, 110, hashId('spinachTray'), 0.17, (r) => 0.05 + 0.04 * Math.max(0, 1 - (r / 0.2) ** 2), true);
  return g;
}

// 塩オイルソースのパックが入ったケース：浅い箱に、パックが立てて並んでいる
function buildSaltOilCase(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.3, 0.07, 0.3, 0xdfe5e8, 0, 0.035, 0));
  for (let i = -2; i <= 2; i++) g.add(box(0.04, 0.13, 0.22, INGREDIENTS.saltOilSauce.color, i * 0.05, 0.1, 0));
  return g;
}

// 刻みのりのケース：白い浅い箱に、細長い長方形ののりが山盛りに入っている
function buildNoriCase(): THREE.Group {
  const g = new THREE.Group();
  const caseColor = 0xdfe5e8;
  const w = 0.34;
  const h = 0.09;
  g.add(box(w, 0.012, w, caseColor, 0, 0.006, 0)); // 底
  g.add(box(w, h, 0.012, caseColor, 0, h / 2, -w / 2 + 0.006)); // 4つの壁
  g.add(box(w, h, 0.012, caseColor, 0, h / 2, w / 2 - 0.006));
  g.add(box(0.012, h, w, caseColor, -w / 2 + 0.006, h / 2, 0));
  g.add(box(0.012, h, w, caseColor, w / 2 - 0.006, h / 2, 0));
  const rnd = seeded(2024);
  const inner = w / 2 - 0.03;
  for (let i = 0; i < 150; i++) {
    const x = (rnd() * 2 - 1) * inner;
    const z = (rnd() * 2 - 1) * inner;
    const edge = Math.max(Math.abs(x), Math.abs(z)) / inner; // 中央ほど高く積む
    const y = 0.03 + (1 - edge * edge) * 0.07 * rnd() + rnd() * 0.02;
    const strip = box(0.055 + rnd() * 0.02, 0.003, 0.006 + rnd() * 0.002, i % 2 === 0 ? 0x1d2b22 : 0x25382c, x, y, z);
    strip.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
    g.add(strip);
  }
  return g;
}

// 生麺のケース：牛乳屋さんの配達に使うような、青いプラスチックのコンテナ。
// 側面は格子状のすき間で、中に生麺の束が横たわっている。原点は底の中心
const CRATE_BLUE = 0x2f6fb8;
const CRATE_BLUE_DARK = 0x245a97;
function buildMilkCrate(w = 0.56, d = 0.4, h = 0.26): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.02, d, CRATE_BLUE_DARK, 0, 0.01, 0)); // 底
  // 側面：上下のふちと縦の桟（すき間から中が見える）
  const wall = (len: number, x: number, z: number, rotY: number): void => {
    const side = new THREE.Group();
    side.add(box(len, 0.035, 0.022, CRATE_BLUE, 0, h - 0.0175, 0)); // 上のふち
    side.add(box(len, 0.045, 0.022, CRATE_BLUE, 0, 0.0425, 0)); // 下のふち
    const bars = Math.round(len / 0.07);
    for (let i = 0; i < bars; i++) {
      const bx = -len / 2 + (len / bars) * (i + 0.5);
      side.add(box(0.022, h - 0.08, 0.018, CRATE_BLUE, bx, h / 2 - 0.0025, 0));
    }
    side.rotation.y = rotY;
    side.position.set(x, 0, z);
    g.add(side);
  };
  wall(w, 0, d / 2 - 0.011, 0);
  wall(w, 0, -d / 2 + 0.011, 0);
  wall(d, w / 2 - 0.011, 0, Math.PI / 2);
  wall(d, -w / 2 + 0.011, 0, Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.035, h, 0.035, CRATE_BLUE_DARK, sx * (w / 2 - 0.0175), h / 2, sz * (d / 2 - 0.0175))); // 角の柱
  }
  // 中の生麺（横向きの束）。上のふちより少し高く積んである
  const bundles = Math.max(2, Math.floor((w - 0.08) / 0.085));
  for (let i = 0; i < bundles; i++) {
    const bx = -((bundles - 1) * 0.085) / 2 + i * 0.085;
    g.add(cyl(0.04, 0.04, d - 0.06, 0xf3e9c0, bx, h - 0.045, 0).rotateX(Math.PI / 2));
  }
  return g;
}

// 野菜ペーストのケース：白い浅い箱に、薄い黄色のペーストが山盛り
function buildPasteCase(): THREE.Group {
  const g = new THREE.Group();
  const white = 0xdfe5e8;
  g.add(box(0.3, 0.02, 0.3, white, 0, 0.01, 0));
  g.add(box(0.3, 0.07, 0.012, white, 0, 0.035, 0.144));
  g.add(box(0.3, 0.07, 0.012, white, 0, 0.035, -0.144));
  g.add(box(0.012, 0.07, 0.276, white, 0.144, 0.035, 0));
  g.add(box(0.012, 0.07, 0.276, white, -0.144, 0.035, 0));
  g.add(box(0.276, 0.04, 0.276, 0xcfd078, 0, 0.04, 0)); // 下地
  addPasteChunks(g, 70, hashId('paste-case'), 0.125, (r) => 0.06 + 0.03 * Math.max(0, 1 - (r / 0.14) ** 2));
  return g;
}

function buildTray(id: TrayId): THREE.Group {
  switch (id) {
    case 'vegPaste':
      return buildPasteCase();
    case 'spinach':
      return buildSpinachTray();
    case 'saltOil':
      return buildSaltOilCase();
    case 'sauteSauce':
    case 'tomatoSauce':
      return buildPackContainer(INGREDIENTS[id].color); // パックが3つ並んだ水色の容器
    case 'garlic':
    case 'chili':
      return buildSteelBin(id); // ステンレスの丸い容器に山盛り
    default:
      return buildFoodPan(id); // 小エビ・チキン・パンチェッタ：ステンレスのバットに山盛り
  }
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

const LADLED: ReadonlySet<IngredientId> = new Set(['meatSauce', 'whiteSauce', 'shrimp', 'garlic', 'chili', 'saltOilSauce', 'vegetablePaste']);
// トングでつかむ具材（手に持つとトングで表示する）
const TONGED: ReadonlySet<IngredientId> = new Set(['pancetta', 'chicken', 'spinach', 'squid', 'mushroom', 'wakame']);

// --- パスタ皿：木の深皿に、少し山なりに盛った麺＋ソース＋粉状のトッピング ---
const WOOD_BOWL_FLOOR = 0.034; // 木の皿の内側の底の高さ

function makeCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// 木目（皿の周りに沿って走る細い線）。一度だけ作って使い回す
let woodTexture: THREE.CanvasTexture | null = null;
function getWoodTexture(): THREE.CanvasTexture {
  woodTexture ??= makeCanvasTexture(256, 128, (ctx) => {
    ctx.fillStyle = '#a2602c';
    ctx.fillRect(0, 0, 256, 128);
    const rnd = seeded(11);
    for (let i = 0; i < 90; i++) {
      const y = rnd() * 128;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(70, 36, 12, 0.28)' : 'rgba(210, 150, 90, 0.22)';
      ctx.lineWidth = 0.6 + rnd() * 2.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + (rnd() - 0.5) * 5);
      ctx.stroke();
    }
  });
  return woodTexture;
}

// 麺の筋（白〜薄いグレー）。色は素材の color（麺の色・ソースの色）を掛けて出す
let strandTexture: THREE.CanvasTexture | null = null;
function getStrandTexture(): THREE.CanvasTexture {
  strandTexture ??= makeCanvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, 512, 256);
    const rnd = seeded(23);
    for (let i = 0; i < 260; i++) {
      const y0 = rnd() * 256;
      const slope = (rnd() - 0.5) * 70;
      const amp = 3 + rnd() * 9;
      const phase = rnd() * Math.PI * 2;
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(150, 150, 150, 0.55)';
      ctx.lineWidth = 1.5 + rnd() * 2;
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 16) {
        const y = y0 + slope * (x / 512) + Math.sin(x / 40 + phase) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  return strandTexture;
}

// 木の深皿（写真のような、ふちが少し立ち上がった丸い木の器）。原点は底の中心
function buildWoodBowl(): THREE.Mesh {
  const profile = [
    [0.0001, 0],
    [0.11, 0],
    [0.135, 0.012],
    [0.2, 0.05],
    [0.232, 0.076],
    [0.2255, 0.081],
    [0.218, 0.076],
    [0.2, 0.058],
    [0.135, 0.04],
    [0.1, WOOD_BOWL_FLOOR],
    [0.0001, WOOD_BOWL_FLOOR],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.Mesh(
    new THREE.LatheGeometry(profile, 48),
    new THREE.MeshLambertMaterial({ map: getWoodTexture(), side: THREE.DoubleSide }),
  );
}

// ソースのパックが入った食材収納容器：水色の浅い箱に、パックが3つ立てて並んでいる（トマトソース・ソテーソース）
function buildPackContainer(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.3, 0.1, 0.34, 0xcfe8f5, 0, 0.05, 0));
  for (let i = -1; i <= 1; i++) g.add(box(0.12, 0.14, 0.03, color, 0, 0.12, i * 0.09));
  return g;
}

// 皿の上の麺の山（回転楕円体の上半分が主役。下半分は皿の底に埋まる）
const PASTA_DOME = { rx: 0.172, ry: 0.075, cy: 0.04 };
// ソースの見た目の色（麺の筋の模様に掛けるので、素の色より少し明るくしてある）
const PASTA_SAUCE_COLOR: Partial<Record<IngredientId, number>> = {
  meatSauce: 0xd0602c,
  tomatoSauce: 0xe5472b,
  carbonaraSauce: 0xf6e6aa,
  tarakoSauce: 0xf3a09a,
  saltOilSauce: 0xeedc8a,
  whiteSauce: 0xf8f1df,
  squidInkSauce: 0x3a3a46,
};
const PASTA_TOPPINGS: ReadonlySet<IngredientId> = new Set(['cheese', 'parsley', 'blackPepper', 'nori', 'chili', 'garlic']);

function addPastaDish(g: THREE.Group, contents: readonly IngredientId[], seedBase: number): void {
  const { rx, ry, cy } = PASTA_DOME;
  const penne = contents.includes('penne');
  const noodleColor = penne ? 0xe8c872 : 0xf4d77c;
  const domeY = (r: number) => (r >= rx ? cy : cy + ry * Math.sqrt(1 - (r / rx) ** 2));
  const strands = getStrandTexture();

  // 麺の山
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), new THREE.MeshLambertMaterial({ color: noodleColor, map: strands }));
  dome.scale.set(rx, ry, rx);
  dome.position.y = cy;
  g.add(dome);

  // ソース：山の上からかぶせた薄い殻。かけた順に少しずつ小さく・厚くなる（ふちの麺は見えたまま）
  const sauces = [...new Set(contents.filter((id) => PASTA_SAUCE_COLOR[id] !== undefined))];
  let coverR = 0;
  sauces.forEach((id, k) => {
    const theta = Math.max(0.7, 1.22 - k * 0.14);
    const s = 1.014 + k * 0.007;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, theta),
      new THREE.MeshLambertMaterial({ color: PASTA_SAUCE_COLOR[id], map: strands }),
    );
    cap.scale.set(rx * s, ry * s, rx * s);
    cap.position.y = cy;
    g.add(cap);
    coverR = Math.max(coverR, rx * s * Math.sin(theta));
  });
  const sauceLift = sauces.length > 0 ? 0.002 + sauces.length * 0.0035 : 0;
  let cheeseH: (r: number) => number = () => 0; // 粉チーズの山の高さ（あとから載せる物は、この上に載る）
  const top = (r: number) => domeY(r) + sauceLift + cheeseH(r);
  const rnd = seeded(seedBase);

  // 飛び出した麺：曲がった筋（ペンネは、短い筒）を山の表面にあしらう
  if (penne) {
    for (let i = 0; i < 56; i++) {
      const r = Math.sqrt(rnd()) * rx * 0.92;
      const a = rnd() * Math.PI * 2;
      const tube = cyl(0.011, 0.011, 0.04 + rnd() * 0.01, r < coverR ? PASTA_SAUCE_COLOR[sauces[0]]! : noodleColor, Math.cos(a) * r, top(r) + 0.004, Math.sin(a) * r);
      tube.rotation.set((rnd() - 0.5) * 1.6, rnd() * Math.PI, Math.PI / 2 + (rnd() - 0.5) * 0.8, 'YXZ');
      g.add(tube);
    }
  } else {
    // スパゲッティの輪。ソースのかかった所は、ソース色の麺と、ソースをまとった黄金色の麺が交互に見える
    const coated = sauces.length > 0 ? new THREE.Color(noodleColor).lerp(new THREE.Color(PASTA_SAUCE_COLOR[sauces[0]]!), 0.45).getHex() : noodleColor;
    for (let i = 0; i < 64; i++) {
      const r = Math.sqrt(rnd()) * rx * 0.93;
      const a = rnd() * Math.PI * 2;
      const color = r < coverR ? (i % 2 === 0 ? PASTA_SAUCE_COLOR[sauces[0]]! : coated) : noodleColor;
      const loop = new THREE.Mesh(
        new THREE.TorusGeometry(0.02 + rnd() * 0.03, 0.0046, 5, 14, Math.PI * (1.1 + rnd() * 0.9)),
        mat(color),
      );
      loop.position.set(Math.cos(a) * r, domeY(r) + sauceLift + 0.002, Math.sin(a) * r);
      loop.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.9, rnd() * Math.PI * 2, 0, 'YXZ');
      g.add(loop);
    }
  }

  // 粒状の飾り（表面の高さ top に沿って、小さな破片をまく）
  const sprinkle = (count: number, maxR: number, w: number, h: number, d: number, colors: number[]): void => {
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rnd()) * maxR;
      const a = rnd() * Math.PI * 2;
      const m = box(w * (0.7 + rnd() * 0.6), h, d * (0.7 + rnd() * 0.6), colors[i % colors.length], Math.cos(a) * r, top(r) + h * 0.4, Math.sin(a) * r);
      m.rotation.set((rnd() - 0.5) * 0.6, rnd() * Math.PI, (rnd() - 0.5) * 0.6);
      g.add(m);
    }
  };

  // ソースの具（ミートのひき肉、たらこの粒）
  if (sauces.includes('meatSauce')) sprinkle(30, coverR * 0.95, 0.014, 0.01, 0.014, [0x5a2412, 0x7a3418, 0x4a1a0c]);
  if (sauces.includes('tarakoSauce')) sprinkle(26, coverR * 0.95, 0.008, 0.006, 0.008, [0xd9706b, 0xf2b3a8]);

  // 粉チーズ：中央にこんもり白い山。まわりにも粒が散る
  const cheeseCount = contents.filter((id) => id === 'cheese').length;
  if (cheeseCount > 0) {
    // ぽろぽろした粉チーズの粒が、中央に厚く積もる。麺のオレンジが、粒のすき間から見える
    const rc = Math.min(0.11, 0.075 + 0.016 * cheeseCount);
    const hc = 0.007 + 0.003 * cheeseCount;
    const base = top(0);
    const pile = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf0e2b8));
    pile.scale.set(rc * 0.8, hc, rc * 0.8);
    pile.position.y = base - hc * 0.3;
    g.add(pile);
    cheeseH = (r: number) => (r < rc * 0.8 ? hc * 0.7 * Math.sqrt(1 - (r / (rc * 0.8)) ** 2) : 0);
    sprinkle(170 * cheeseCount, rc * 1.3, 0.013, 0.006, 0.013, [0xfff6d2, 0xf3e5b0, 0xfffbe6, 0xeadca0]);
    sprinkle(40 * cheeseCount, rx * 0.8, 0.01, 0.005, 0.01, [0xfff6d2, 0xf3e5b0]); // まわりに散った粒
  }

  // それ以外の具材と粉：入れた順に、いちばん上の面へ
  contents.forEach((id, i) => {
    if (id === 'noodle' || id === 'penne' || id === 'cheese' || PASTA_SAUCE_COLOR[id] !== undefined) return;
    if (id === 'pancetta') {
      addPancettaStrips(g, PANCETTA_STRIPS_PER_UNIT, hashId(id) + i, rx * 0.88, (r) => top(r) + 0.004);
    } else if (id === 'parsley') {
      sprinkle(40, rx * 0.9, 0.011, 0.003, 0.007, [0x3f8f3a, 0x2f7d32, 0x5fae4a]);
    } else if (id === 'blackPepper') {
      sprinkle(50, rx * 0.9, 0.005, 0.005, 0.005, [0x1d1d1d, 0x333333]);
    } else if (id === 'nori') {
      sprinkle(30, rx * 0.8, 0.05, 0.004, 0.007, [0x1d2b22, 0x25382c]);
    } else if (id === 'chili') {
      addChiliFlakes(g, 90, hashId(id) + i, rx * 0.85, top);
    } else if (id === 'garlic') {
      addGarlicSlices(g, 14, hashId(id) + i, rx * 0.85, top);
    } else if (id === 'spinach') {
      addSpinachLeaves(g, 20, hashId(id) + i, rx * 0.7, (r) => top(r) + 0.004);
    } else if (id === 'squid') {
      addSquidPieces(g, 9, hashId(id) + i, rx * 0.7, (r) => top(r) + 0.002);
    } else if (id === 'mushroom') {
      addMushroomSlices(g, 9, hashId(id) + i, rx * 0.7, (r) => top(r) + 0.002);
    } else if (!PASTA_TOPPINGS.has(id)) {
      g.add(cyl(0.05, 0.05, 0.012, INGREDIENTS[id].color, 0, top(0) + 0.006, 0)); // 想定外の物は、上に平たく載せる
    }
  });
}

// --- ドリア系の焼き皿と、下駄（ドリアの下にひく木の台） ---

// 角の丸い長方形（上から見た形）。r は角の丸み
function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + d - r);
  s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + d);
  s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// 角の丸い板（長い辺が x 方向、厚み h は上向き。下の面が y）
function slab(w: number, d: number, r: number, h: number, color: number, y = 0): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), { depth: h, bevelEnabled: false, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(color));
  m.position.y = y;
  return m;
}

// 下駄1枚：オレンジがかった木の台。下の板の上に、ひと回り小さい板が重なって、皿の収まる段になっている（長い辺が x 方向。高さ GETA.h）
function buildGeta(): THREE.Group {
  const g = new THREE.Group();
  g.add(slab(GETA.w, GETA.d, 0.075, GETA.h * 0.55, 0xc8672b));
  g.add(slab(GETA.w - 0.05, GETA.d - 0.05, 0.055, GETA.h * 0.45, 0xb55a24, GETA.h * 0.55));
  return g;
}

// ドリア系の皿。茶色の陶器のふち、白いチーズ、中央のミートソース。
//   焼く前（raw）：白いチーズ、つやのある赤いミートソース。焦げ目はない
//   生焼け（half）：チーズが少し溶けて、うっすら色づく。焦げ目はまだほとんどない
//   焦げた（burnt）：全体が黒く焦げて、灰色の炭のかけらが浮く（提供できない）
//   焼き上がり（geta = false。1枚目の写真）：チーズにところどころ黄金色の焦げ目、ごろっとしたミートソース、パセリ
//   焼き上がり・下駄つき（geta = true。2枚目の写真）：深く焼けて、ミートソースやふちに黒い焦げ。パセリはない
// detail = false は、積んだ皿の下の段など、上から見えない皿（飾りを省く）。高さは BAKE_DISHES.doria.h（下駄の厚みは含まない）
function buildDoriaDish(state: BakeState, geta: boolean, detail: boolean): THREE.Group {
  const size = BAKE_DISHES.doria;
  const g = new THREE.Group();
  const baked = state === 'baked';
  const burnt = state === 'burnt';
  const charred = baked && geta;
  const W = size.w - 0.02;
  const D = size.d - 0.02;
  g.add(slab(W, D, D * 0.42, 0.036, burnt ? 0x2e2622 : charred ? 0x5a3a2c : 0x8a4a22)); // 陶器の皿
  const fw = W - 0.1;
  const fd = D - 0.1;
  g.add(slab(fw, fd, fd * 0.42, 0.013, burnt ? 0x2a211c : state === 'raw' ? 0xf3ecd6 : state === 'half' ? 0xf1e6c4 : charred ? 0xf0e2b8 : 0xf6efd6, 0.035)); // チーズ
  const top = 0.048;
  const sauce = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(burnt ? 0x1a1410 : state === 'raw' ? 0xb8431f : state === 'half' ? 0xa8401e : charred ? 0x7a4222 : 0x9c3d1a));
  sauce.scale.set(fw * 0.36, 0.01, fd * 0.36);
  sauce.position.y = top - 0.002;
  g.add(sauce); // ミートソース
  if (!detail || state === 'raw') return g;

  const rnd = seeded(hashId(charred ? 'doria-geta' : `doria-${state}`));
  const inSauce = (): [number, number] => {
    const r = Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    return [Math.cos(a) * r * fw * 0.33, Math.sin(a) * r * fd * 0.33];
  };
  if (state === 'half') {
    // うっすら色づいた、チーズの小さな跡
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2;
      const spot = cyl(0.012 + rnd() * 0.01, 0.012 + rnd() * 0.01, 0.002, 0xe8cf92, Math.cos(a) * fw * 0.42, top + 0.001, Math.sin(a) * fd * 0.42);
      spot.scale.z = 0.8;
      g.add(spot);
    }
    return g;
  }
  if (burnt) {
    // 真っ黒に焦げた、ソースのかたまりと、灰色の炭のかけら
    for (let i = 0; i < 24; i++) {
      const [x, z] = inSauce();
      const clump = new THREE.Mesh(new THREE.SphereGeometry(0.008 + rnd() * 0.006, 8, 6), mat(i % 3 ? 0x0f0b09 : 0x241b16));
      clump.scale.y = 0.6;
      clump.position.set(x, top + 0.006, z);
      g.add(clump);
    }
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2;
      const k = 0.2 + rnd() * 0.25;
      g.add(cyl(0.01 + rnd() * 0.012, 0.01 + rnd() * 0.012, 0.003, i % 2 ? 0x4a423c : 0x37302b, Math.cos(a) * fw * k, top + 0.012, Math.sin(a) * fd * k));
    }
    return g;
  }
  const meat = charred ? [0x6a3a1e, 0x7d4624, 0x59301a] : [0x7a2f14, 0x8c3a18, 0xa04a20];
  for (let i = 0; i < 30; i++) {
    const [x, z] = inSauce();
    const clump = new THREE.Mesh(new THREE.SphereGeometry(0.008 + rnd() * 0.005, 8, 6), mat(meat[i % meat.length]));
    clump.scale.y = 0.6;
    clump.position.set(x, top + 0.006, z);
    g.add(clump); // ごろっとした挽き肉
  }
  // チーズの焦げ目：ソースのまわりの、チーズの上に
  const spots = charred ? [0xb8701f, 0x6a3c18, 0xc98a2e] : [0xdda043, 0xe6b058];
  const nSpots = charred ? 9 : 7;
  for (let i = 0; i < nSpots; i++) {
    const a = rnd() * Math.PI * 2;
    const k = 0.4 + rnd() * 0.08;
    const spot = cyl(0.014 + rnd() * 0.014, 0.014 + rnd() * 0.014, 0.003, spots[i % spots.length], Math.cos(a) * fw * k, top + 0.0015, Math.sin(a) * fd * k);
    spot.scale.z = 0.8;
    g.add(spot);
  }
  if (charred) {
    // ミートソースの縁の黒い焦げ（少しだけ）
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      g.add(cyl(0.008 + rnd() * 0.008, 0.008 + rnd() * 0.008, 0.003, 0x3a2012, Math.cos(a) * fw * 0.31, top + 0.009, Math.sin(a) * fd * 0.31));
    }
  } else {
    // 刻みパセリ：緑の細かい薄片
    for (let i = 0; i < 14; i++) {
      const [x, z] = inSauce();
      const fleck = box(0.012, 0.002, 0.005, i % 2 ? 0x3f7d2c : 0x4f8f35, x * 0.7, top + 0.014, z * 0.7);
      fleck.rotation.y = rnd() * Math.PI;
      g.add(fleck);
    }
  }
  return g;
}

// 焼き皿の山（stackItems 枚）。いちばん上の皿だけ、くわしい見た目にする
function buildDishStack(style: BakeStyle, count: number): THREE.Group {
  const stack = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const topmost = i === count - 1;
    const dish = style === 'doria' && !topmost ? buildDoriaDish('raw', false, false) : buildItemMesh({ kind: 'bakeDish', style, cooked: 0, state: 'raw' });
    dish.position.y = i * BAKE_DISHES[style].h;
    stack.add(dish);
  }
  return stack;
}

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
        if (item.id === 'garlic') addGarlicSlices(g, 12, 11, 0.045, () => 0.052);
        else if (item.id === 'chili') addChiliFlakes(g, 60, 12, 0.045, () => 0.052);
        else if (item.id === 'shrimp') addShrimp(g, 6, 13, 0.03, () => 0.052, 0.8);
        else if (item.id === 'vegetablePaste') addPasteChunks(g, 6, 20, 0.03, () => 0.048);
        else g.add(cyl(0.05, 0.05, 0.01, color, 0, 0.05, 0)); // すくったソース
      } else if (TONGED.has(item.id)) {
        g.add(box(0.015, 0.3, 0.015, 0x8a8f94, -0.03, 0.17, 0).rotateZ(-0.1)); // トング
        g.add(box(0.015, 0.3, 0.015, 0x8a8f94, 0.03, 0.17, 0).rotateZ(0.1));
        if (item.id === 'chicken') addChickenSlices(g, 3, 14, 0.012, () => 0.008); // つかんだチキン
        else if (item.id === 'pancetta') addPancettaStrips(g, 3, 16, 0.012, () => 0.005); // つかんだパンチェッタ
        else if (item.id === 'spinach') addSpinachLeaves(g, 9, 15, 0.025, () => 0.012, true); // つかんだほうれん草
        else if (item.id === 'squid') addSquidPieces(g, 4, 17, 0.014, () => 0.004, 0.9); // つかんだイカ
        else if (item.id === 'mushroom') addMushroomSlices(g, 3, 18, 0.014, () => 0.004, 0.9); // つかんだきのこ
        else if (item.id === 'wakame') addWakame(g, 5, 19, 0.014, () => 0.004, 0.9); // つかんだわかめ
        else g.add(box(0.08, 0.04, 0.05, color, 0, 0.02, 0)); // つかんだ具材
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
    case 'bakeDish': {
      // 焼き皿（テスト用）。焼き上がると、こんがりした色になる。
      // 並べたとき皿どうしが見分けられるよう、置き場の大きさより 0.02 だけ小さくしてある
      const size = BAKE_DISHES[item.style];
      if (item.style === 'pizza') {
        // ピザ系：丸い鉄板の上に、生地・ソース（焼くとチーズの色）・ペパロニ。高さは size.h
        const r = size.d / 2 - 0.01;
        g.add(cyl(r, r, 0.012, 0x5b6066, 0, 0.006, 0)); // 鉄板
        const baked = item.state === 'baked';
        const burnt = item.state === 'burnt';
        g.add(cyl(r - 0.02, r - 0.02, 0.014, burnt ? 0x2a2420 : baked ? 0xc98a3a : 0xe9d3a0, 0, 0.012 + 0.007, 0)); // 生地（ふちが焼ける。焦げると黒い）
        g.add(cyl(r - 0.06, r - 0.06, 0.006, burnt ? 0x1a1512 : baked ? 0xe8b84a : 0xd8523b, 0, 0.026 + 0.003, 0)); // ソース / チーズ
        for (const [px, pz] of [[0.06, 0.04], [-0.07, 0.05], [0.0, -0.08], [-0.05, -0.04], [0.09, -0.06]]) {
          g.add(cyl(0.025, 0.025, 0.006, burnt ? 0x120d0a : baked ? 0x8a2a1c : 0x9b2d20, px, 0.032 + 0.003, pz)); // ペパロニ
        }
      } else {
        // ドリア系：陶器の皿に、チーズとミートソース。下駄つきなら、木の台に乗せる
        const dish = buildDoriaDish(item.state, item.geta === true, true);
        if (item.geta) {
          g.add(buildGeta());
          dish.position.y = GETA.h;
        }
        g.add(dish);
      }
      break;
    }
    case 'geta':
      g.add(buildGeta());
      break;
    case 'plate': {
      // 皿の種類：普通の皿 / 小皿（ほうれん草のソテー）/ スープ皿（コーンスープ）/ リム小皿（小エビのカクテル・蒸し鶏の香味ソース）
      const style = item.style ?? 'plate';
      const body = new THREE.Group();
      let y = 0.03;
      if (style === 'bowl') {
        body.add(cyl(0.21, 0.11, 0.09, 0xf5f5f5, 0, 0.045, 0)); // 深い器
        y = 0.075;
      } else if (style === 'rim') {
        // リム小皿：白い浅い皿に、茶色のふちの線が1周入っている
        body.add(cyl(0.3, 0.22, 0.04, 0xf7f5f0, 0, 0.02, 0));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.008, 6, 48), mat(0xa9715a));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.04;
        body.add(ring);
        y = 0.045;
      } else if (style === 'small') {
        body.add(cyl(0.23, 0.18, 0.03, 0xf5f5f5, 0, 0.015, 0));
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.007, 6, 40), mat(0xe3c7ba)); // 薄い茶色のふち
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.03;
        body.add(rim);
      } else {
        body.add(buildWoodBowl()); // パスタ皿：木の深皿
        y = WOOD_BOWL_FLOOR;
      }
      const g = body; // 中身は body に積む
      if (style === 'plate' && item.contents.some((id) => id === 'noodle' || id === 'penne')) {
        addPastaDish(g, item.contents, hashId(item.contents.join(',')));
        root.add(body);
        break;
      }
      if (item.contents.includes('saladBase')) {
        addSaladDish(g, item.contents, hashId(item.contents.join(',')), y, 0.185, 0.085);
        root.add(body);
        break;
      }
      if (style === 'rim' && item.contents.includes('wakame')) {
        addRimDish(g, item.contents, hashId(item.contents.join(',')), y, 0.24);
        body.scale.setScalar(0.85);
        root.add(body);
        break;
      }
      if (style === 'small' && item.contents.includes('spinach')) {
        addSpinachDish(g, item.contents, hashId(item.contents.join(',')), y);
        body.scale.setScalar(0.68);
        root.add(body);
        break;
      }
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
      if (style === 'rim') body.scale.setScalar(0.85);
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
    case 'bakeDish':
      return `bake:${item.style}:${item.state}:${item.geta ? 1 : 0}`;
    case 'geta':
      return 'geta';
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
  label: Label; // タイマー・「済」
  nameLabel: Label; // 何のパックか
};

type BurnerView = {
  disc: THREE.Mesh;
  label: Label; // モニターの画面に映す文字（絵は label のテクスチャ）
  monitor: THREE.Object3D; // 口の手前にはめ込まれたモニターの画面（文字）。加熱の状態だけ。表示する物がないときは消える
  popup: Label; // 鍋の上に浮かべる中身の名前。視点を合わせたときだけ
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

  // 部屋。冷蔵庫（2台）・サラダ台（layout.ts）がはみ出さないよう、右と奥と手前の壁は必要なら広げる
  const roomMinX = ROOM_MIN_X;
  const roomMaxX = Math.max(3.6, layout.fridge.x + 0.8 + 0.1, layout.fridge2.x + 0.8 + 0.1, layout.fridge3.x + 0.8 + 0.1, layout.saladTable.x + 0.55 + 0.1, layout.hotWater.x + HOT_WATER_COUNTER.right.maxX + 0.1);
  const roomMinZ = Math.min(-4.1, layout.saladTable.z - 1.35 - 0.1, layout.hotWater.z + HOT_WATER_COUNTER.back.minZ - 0.1);
  const roomMaxZ = Math.max(4.1, layout.fridge.z + 1.0 + 0.1, layout.fridge2.z + 1.0 + 0.1, layout.fridge3.z + 1.0 + 0.1, OVEN_COUNTER_ROW.maxZ + 0.1); // 手前は、ジェットオーブンと3台の具材台が収まるよう広げる
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

  // iPad の真上の壁に立てかけた看板（お店のロゴ）。練習でもゲームでも常にある
  const SIGN_W = 1.5;
  const SIGN_H = SIGN_W * (887 / 1774); // ロゴ画像の縦横比
  const SIGN_D = 0.05;
  const logoTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}logo.png`);
  logoTexture.colorSpace = THREE.SRGBColorSpace;
  logoTexture.anisotropy = 8;
  const sign = new THREE.Group();
  sign.add(box(SIGN_W + 0.08, SIGN_H + 0.08, SIGN_D, 0x4a3320)); // 木のふち
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), new THREE.MeshBasicMaterial({ map: logoTexture }));
  signFace.rotation.y = Math.PI; // 部屋の側（-z）へ向ける
  signFace.position.z = -(SIGN_D / 2 + 0.002);
  sign.add(signFace);
  sign.position.set(0, 2.62, roomMaxZ - 0.05 - SIGN_D / 2);
  scene.add(sign);

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

    // 加熱中・完成などの表示：黒い丸（IHの口）の手前で、コンロの台にはめ込まれた小さなモニター。画面は真上を向いている。
    // 枠と黒いガラスはいつもあり、表示する物があるときだけ文字（screen）が映る
    const label = makeLabel('', 0.68);
    const mx = x;
    const mz = -1.8 + 0.4;
    scene.add(box(0.37, 0.006, 0.12, 0x1c1f24, mx, 0.802, mz)); // 枠（天板の面から、ほんの少し出ている）
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshBasicMaterial({ color: 0x0b0d10 }));
    glass.rotation.x = -Math.PI / 2; // 上向き
    glass.position.set(mx, 0.8054, mz);
    scene.add(glass);
    const monitor = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.085), // ラベルの絵（4:1）をそのまま映す。MeshBasic なので自ら光って見える
      new THREE.MeshBasicMaterial({ map: label.sprite.material.map, transparent: true }),
    );
    monitor.rotation.x = -Math.PI / 2; // 上向き。文字の上側が奥（コンロの背板側）になり、プレイヤーから読める
    monitor.position.set(mx, 0.8058, mz);
    monitor.visible = false;
    scene.add(monitor);

    // 鍋の口の上から。加熱が進むほど、完成が近いほど多くなる
    const steam = addSteam(scene, x, 0.82 + POT_H, -1.8, { count: 16, rise: 0.55, spread: 0.07, size: 0.28 });
    // 鍋の中身の名前：具材コーナーの名前と同じように、鍋の上に浮かべる（視点を合わせたときだけ）
    const popup = makeLabel('', 0.8);
    popup.sprite.position.set(x, 1.15, -1.8);
    popup.sprite.visible = false;
    scene.add(popup.sprite);
    burnerViews.push({ disc, label, monitor, popup, pot: new ItemView(burner), steam });
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
  for (let i = -1; i <= 1; i++) {
    const crate = buildMilkCrate();
    crate.position.set(i * 0.63, 0.03, 0); // 棚板の上面に置く
    rack.add(crate);
  }
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
  for (let i = 0; i < 6; i++) {
    const bowl = buildWoodBowl(); // 重ねた木の深皿
    bowl.position.y = i * 0.032;
    stack.add(bowl);
  }
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
  // 皿の上に浮かべる名前（slotViews と同じ並び）。中身の名前は視点を合わせたときだけ、料理が出来上がったら常に料理名
  const slotLabels: Label[] = [];
  for (let i = 0; i < cfg.plateSlotCount; i++) {
    const slot = new THREE.Group();
    slot.add(cyl(0.3, 0.3, 0.012, 0xcfc4ae, 0, 0.006, 0));
    slot.position.set(LX, 0.9, -0.9 + i * 0.6);
    setTarget(slot, { kind: 'plateSlot', index: i });
    scene.add(slot);
    interactables.push(slot);
    slotViews.push(new ItemView(slot));
    const label = makeLabel('', 0.8);
    label.sprite.position.set(LX, 1.25, -0.9 + i * 0.6);
    label.sprite.visible = false;
    scene.add(label.sprite);
    slotLabels.push(label);
  }

  const toppings: [IngredientId, number][] = [
    ['tarakoSauce', -0.75],
    ['nori', -0.25],
    ['cheese', 0.25],
  ];
  toppings.forEach(([id, z]) => {
    let t: THREE.Group;
    if (id === 'tarakoSauce') {
      t = buildPackContainer(INGREDIENTS.tarakoSauce.color); // トマトソースと同じ、パックが並んだ容器
    } else if (id === 'nori') {
      t = buildNoriCase();
    } else {
      t = new THREE.Group();
      t.add(box(0.4, 0.12, 0.4, 0xdad3c2, 0, 0.06, 0));
      t.add(box(0.3, 0.04, 0.3, INGREDIENTS[id].color, 0, 0.14, 0));
    }
    t.position.set(TX, 0.9, z);
    setTarget(t, { kind: 'stock', id });
    scene.add(t);
    interactables.push(t);
    decor(INGREDIENTS[id].name, TX, 1.3, z, 0.6);
  });

  const pass = new THREE.Group();
  pass.add(box(SERVE_PASS.size, 0.04, SERVE_PASS.size, 0x58b368, 0, 0.02, 0));
  pass.position.set(SERVE_PASS.x, 0.9, SERVE_PASS.z);
  setTarget(pass, { kind: 'servePass' });
  scene.add(pass);
  interactables.push(pass);
  decor('提供台', SERVE_PASS.x, 1.3, SERVE_PASS.z, 0.5);

  // --- 左の台の手前（壁側）：ジェットオーブン（ベルトコンベア式。ドリア・鉄板焼き用）と、具材台 ---
  // 提供台を正面に見て左側。IHコンロを前方に見たときは、提供台の後ろ側（+z 方向）に、z 軸に沿って並べる。
  // 料理は壁側（+z）の入口から、提供台側（-z）の出口へ流れる。上段・下段の2段で、段ごとに流れる速さが違う（出てくるまでの秒数は config.ts）。
  // 位置・大きさは layout.ts（OVEN_Z / OVEN_BELT / OVEN / OVEN_COUNTER）。入口・出口は、皿（長い辺が流れの向き）が 流れの向きに2つ × 横に3つ並ぶ広さ + 皿 0.5個分（外側の端）
  const OV_STEEL = 0xc9ced3;
  const OV_DARK = 0x3b4046;
  const OV_BELT_COLOR = 0x474c52;
  const bodyMinZ = OVEN_Z.body.minZ;
  const bodyMaxZ = OVEN_Z.body.maxZ;
  const bodyLen = bodyMaxZ - bodyMinZ;
  const bodyCz = (bodyMinZ + bodyMaxZ) / 2;
  const bodyD = OVEN_BELT.bodyDepth;
  const frontX = OVEN.x + bodyD / 2; // 扉のある面（部屋の中央側）
  const beltWidth = OVEN_BELT.laneW * OVEN_BELT.lanes + OVEN_BELT.laneGap * (OVEN_BELT.lanes - 1);

  // 脚・キャスター（本体の下）。下段の箱の底は、下段のベルトの高さ - 0.255
  const standTop = OVEN.beltY.lower - 0.255;
  for (const sx of [OVEN.x - (bodyD / 2 - 0.06), OVEN.x + (bodyD / 2 - 0.06)]) {
    for (const sz of [bodyMinZ + 0.06, bodyMaxZ - 0.06]) {
      scene.add(box(0.05, standTop, 0.05, 0x9aa3ab, sx, standTop / 2 + 0.03, sz)); // 脚
      scene.add(cyl(0.03, 0.03, 0.06, 0x2a2d31, sx, 0.03, sz)); // キャスター
    }
  }
  scene.add(box(bodyD - 0.1, 0.03, bodyLen - 0.1, 0x8a9096, OVEN.x, 0.25, bodyCz)); // 下の棚板

  // 本体：上段・下段の箱。部屋の側（+x）の面に窓つきの扉、出口側に操作パネル
  const doorW = 0.72;
  const doorCz = bodyMaxZ - 0.05 - doorW / 2;
  for (const deck of OVEN_DECKS) {
    const y = OVEN.beltY[deck];
    scene.add(box(bodyD, 0.5, bodyLen, OV_STEEL, OVEN.x, y - 0.005, bodyCz));
    scene.add(box(0.03, 0.38, doorW, 0xdfe4e8, frontX + 0.015, y, doorCz)); // 扉
    scene.add(box(0.012, 0.14, 0.5, 0x1a232b, frontX + 0.036, y + 0.04, doorCz)); // 窓
    scene.add(box(0.03, 0.025, 0.3, 0x8a9096, frontX + 0.045, y - 0.13, doorCz)); // 取っ手
    scene.add(box(0.02, 0.2, 0.14, 0x15181b, frontX + 0.01, y, bodyMinZ + 0.14)); // 操作パネル
    scene.add(box(0.004, 0.05, 0.09, 0x3aa57a, frontX + 0.022, y + 0.05, bodyMinZ + 0.14)); // パネルの画面
    // ベルトの出入り口（本体の入口側・出口側の面の黒い口）
    scene.add(box(beltWidth + 0.06, 0.14, 0.012, 0x15181b, OVEN.x, y + 0.05, bodyMaxZ + 0.004));
    scene.add(box(beltWidth + 0.06, 0.14, 0.012, 0x15181b, OVEN.x, y + 0.05, bodyMinZ - 0.004));
  }
  scene.add(box(bodyD, 0.02, bodyLen, 0x8a9096, OVEN.x, (OVEN.beltY.lower + OVEN.beltY.upper) / 2, bodyCz)); // 上段と下段のあいだの枠

  // 入口・出口のベルト（段ごとに、クリックできるベルトの面）。ベルトの面が動いて見えるよう、横縞（スラット）を流す。
  // 入口のベルトは、視点が合っている場所（x, s）に皿を置ける（ジェットに入る手前まで）。出口のベルトでは、取るレーンを視点の横の位置で決める
  const SLAT_COUNT = 10;
  const SLAT_PITCH = OVEN_BELT.length / SLAT_COUNT;
  type BeltPad = { deck: OvenDeck; len: number; slats: THREE.Mesh[] };
  const beltPads: BeltPad[] = [];
  // 視点が当たった点（ワールド座標）から、入口のベルトなら置く位置（ベルトの中心からの横のずれ x、入口の端からの距離 s）、
  // 出口のベルトなら取るレーンを求める
  const beltTarget = (deck: OvenDeck, end: 'inlet' | 'outlet', point: THREE.Vector3): Target => {
    const x = point.x - OVEN.x;
    return end === 'inlet'
      ? { kind: 'ovenInlet', deck, x, s: OVEN_Z.inlet.maxZ - point.z }
      : { kind: 'ovenOutlet', deck, lane: laneOfOffset(x) };
  };
  const addBeltPad = (deck: OvenDeck, end: 'inlet' | 'outlet') => {
    const span = OVEN_Z[end];
    const len = span.maxZ - span.minZ;
    const pad = new THREE.Group();
    pad.position.set(OVEN.x, OVEN.beltY[deck], (span.minZ + span.maxZ) / 2);
    pad.add(box(beltWidth, 0.03, len, OV_BELT_COLOR, 0, -0.015, 0));
    const slats: THREE.Mesh[] = [];
    for (let i = 0; i < SLAT_COUNT; i++) {
      const slat = box(beltWidth - 0.02, 0.004, 0.02, 0x636970, 0, -0.0005, 0);
      pad.add(slat);
      slats.push(slat);
    }
    setTarget(pad, end === 'inlet' ? { kind: 'ovenInlet', deck, x: 0, s: 0 } : { kind: 'ovenOutlet', deck, lane: 0 });
    pad.userData[RESOLVE_KEY] = (hit: THREE.Intersection): Target | null => {
      if (!hit.face || hit.face.normal.y < 0.5) return null; // 上の面だけ
      return beltTarget(deck, end, hit.point);
    };
    scene.add(pad);
    interactables.push(pad);
    beltPads.push({ deck, len, slats });
  };
  for (const deck of OVEN_DECKS) {
    const y = OVEN.beltY[deck];
    for (const end of ['inlet', 'outlet'] as const) {
      const span = OVEN_Z[end];
      const len = span.maxZ - span.minZ;
      const cz = (span.minZ + span.maxZ) / 2;
      addBeltPad(deck, end);
      scene.add(box(beltWidth + 0.02, 0.03, len, OV_DARK, OVEN.x, y - 0.045, cz)); // ベルトの下の枠
      for (const sign of [-1, 1]) scene.add(box(0.025, 0.06, len, 0x8a9096, OVEN.x + sign * (beltWidth / 2 + 0.0125), y - 0.005, cz)); // 側板（皿が落ちない）
      // 先の端の脚
      const legZ = end === 'inlet' ? span.maxZ - 0.04 : span.minZ + 0.04;
      for (const sign of [-1, 1]) scene.add(box(0.04, y - 0.06, 0.04, 0x9aa3ab, OVEN.x + sign * (beltWidth / 2 + 0.045), (y - 0.06) / 2, legZ));
    }
  }

  // 名前：入口は段と時間、出口は焼いている様子（毎フレーム sync で書き換える）
  const ovenOutLabels = new Map<OvenDeck, Label>();
  for (const deck of OVEN_DECKS) {
    const y = OVEN.beltY[deck] + 0.3;
    decor(`${OVEN_DECK_NAME[deck]} 入口（${bakeTime(deck, cfg)}秒）`, OVEN.x, y, (OVEN_Z.inlet.minZ + OVEN_Z.inlet.maxZ) / 2, 0.8);
    ovenOutLabels.set(deck, decor(`${OVEN_DECK_NAME[deck]} 出口`, OVEN.x, y, (OVEN_Z.outlet.minZ + OVEN_Z.outlet.maxZ) / 2, 0.8));
  }
  decor('ジェットオーブン', OVEN.x, OVEN.beltY.upper + 0.55, bodyCz, 0.9);

  // ベルトに乗っている皿の表示（皿が入るたびに作り、取ったら片づける）。皿そのものを狙える（入口側 / 出口側のベルトと同じ対象）
  // 皿は、いま入口側（ジェットに入る前）か出口側かで対象が変わる。入口側の皿を狙ったときは、その点の位置（重なるので置けない）
  type OvenDishView = { root: THREE.Group; view: ItemView; deck: OvenDeck; emerged: boolean; lane: number };
  const ovenDishViews = new Map<number, OvenDishView>();

  // 置こうとしている場所の印（皿の大きさの板）。置ける間は緑、置けないときは赤
  const ovenGhost = new THREE.Group();
  ovenGhost.visible = false;
  const ovenGhostPads = {} as Record<BakeStyle, THREE.Mesh>;
  for (const style of BAKE_STYLES) {
    const size = BAKE_DISHES[style];
    const geometry = style === 'pizza' ? new THREE.CylinderGeometry(size.d / 2, size.d / 2, 0.01, 32) : new THREE.BoxGeometry(size.d, 0.01, size.w);
    const padMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.6, depthWrite: false }));
    padMesh.visible = false;
    ovenGhost.add(padMesh);
    ovenGhostPads[style] = padMesh;
  }
  scene.add(ovenGhost);

  // 具材台（オーブンの入口の先、壁側）：ドリア・鉄板焼きの具材を置くコーナー。いまは、テスト用の焼き皿の山だけ
  // 左の壁まで伸ばしてあり、天板（高さ 0.9）の下は、部屋の中央側（+x）が開いた2段の棚。各段にドリア系の皿の山を置く
  const SH = OVEN_COUNTER_SHELF;
  const CT_WOOD = 0xb89f7a;
  const CT_BOARD = 0xa38b66;
  const ctMinX = OVEN_COUNTER.x - OVEN_COUNTER.width / 2;
  const ctMaxX = OVEN_COUNTER.x + OVEN_COUNTER.width / 2;
  // 3台を、壁側（+z）へすき間なく横に並べる。どれも同じ作り（天板・側板・背板・2段の棚・ドリア系の皿の山）
  const shelfStackX = ctMaxX - BAKE_DISHES.doria.d / 2 - 0.03;
  const shelfPitch = OVEN_COUNTER.depth / SH.stacksPerTier;
  for (const cz of OVEN_COUNTER_ZS) {
    scene.add(box(OVEN_COUNTER.width, SH.topThickness, OVEN_COUNTER.depth, CT_WOOD, OVEN_COUNTER.x, 0.9 - SH.topThickness / 2, cz)); // 天板
    for (const sign of [-1, 1]) {
      // 奥（壁側）と手前（オーブン側）の側板。棚板を支える
      scene.add(box(OVEN_COUNTER.width, 0.9 - SH.topThickness, 0.03, CT_WOOD, OVEN_COUNTER.x, (0.9 - SH.topThickness) / 2, cz + (sign * (OVEN_COUNTER.depth - 0.03)) / 2));
    }
    scene.add(box(0.02, 0.9 - SH.topThickness, OVEN_COUNTER.depth, CT_WOOD, ctMinX + 0.01, (0.9 - SH.topThickness) / 2, cz)); // 壁側の背板
    for (const topY of SH.shelfTopY) {
      scene.add(box(OVEN_COUNTER.width, SH.boardThickness, OVEN_COUNTER.depth, CT_BOARD, OVEN_COUNTER.x, topY - SH.boardThickness / 2, cz)); // 棚板
    }
    // 棚のドリア系の皿の山。開いている面（+x）の端に寄せる（視点の線が天板に遮られても狙える）。皿の向きはオーブンの皿と同じ
    for (const topY of SH.shelfTopY) {
      for (let i = 0; i < SH.stacksPerTier; i++) {
        const stack = buildDishStack('doria', SH.stackHeight);
        stack.rotation.y = Math.PI / 2;
        stack.position.set(shelfStackX, topY, cz + (i - (SH.stacksPerTier - 1) / 2) * shelfPitch);
        setTarget(stack, { kind: 'ovenStock', style: 'doria' });
        scene.add(stack);
        interactables.push(stack);
      }
    }
  }
  // 焼き皿の山：ドリア系（長方形）と、ピザ系（丸）。台の上に、左右に並べる（台を伸ばす前の位置のまま。オーブンと同じ列の上）
  const PILE_X: Record<BakeStyle, number> = { doria: OVEN.x - 0.35 - OVEN_COUNTER.x, pizza: OVEN.x + 0.35 - OVEN_COUNTER.x };
  for (const style of BAKE_STYLES) {
    const dishPile = buildDishStack(style, 4);
    dishPile.rotation.y = Math.PI / 2; // オーブンの皿と同じ向き（長い辺が流れの向き）
    dishPile.position.set(OVEN_COUNTER.x + PILE_X[style], 0.9, OVEN_COUNTER.z);
    setTarget(dishPile, { kind: 'ovenStock', style });
    scene.add(dishPile);
    interactables.push(dishPile);
    decor(`焼き皿（${BAKE_DISHES[style].name}・テスト）`, OVEN_COUNTER.x + PILE_X[style], 1.3, OVEN_COUNTER.z, 0.7);
  }
  decor('具材台（仮）', OVEN_COUNTER.x, 1.1, OVEN_COUNTER.z + 0.5, 0.5);

  // 位置は layout.ts で決める。以下の座標は、それぞれの基準点からの相対位置。
  const decorIn = (parent: THREE.Object3D, text: string, x: number, y: number, z: number, width = 1.4) => {
    const l = makeLabel(text, width);
    l.sprite.position.set(x, y, z);
    parent.add(l.sprite);
    return l;
  };

  // --- 冷蔵庫（右クリックで扉を開閉。最初は閉まっている）---
  // 冷蔵庫は3台ある（FridgeUnit。0 = 最初から物が入っている冷蔵庫、1 = 隣に並べた冷蔵庫、2 = さらに隣に並べた、最初は空の冷蔵庫）。大きさも棚の段数も同じ。
  // 基準点＝前面（扉側）の中央。+x が奥行き、z が幅（2.0m）。棚は最下段・下段・中段・上段の4段。
  // 上段：サラダベース、中段：ミートソース缶とトマトソースの容器、下段：カルボナーラのパックなど、最下段：空き（0 の冷蔵庫の最初の配置）
  const STEEL = 0xd5dde2;
  const FRIDGE_UNITS: FridgeUnit[] = [0, 1, 2];
  const fridgeBases = [layout.fridge, layout.fridge2, layout.fridge3];
  const fridgeSpots: THREE.Group[] = []; // 冷蔵庫ごとの基準点
  const fridgeDoors: { left: THREE.Group; right: THREE.Group }[] = []; // 観音開きの扉（手前側 / 奥側）
  for (const unit of FRIDGE_UNITS) {
    const spot = new THREE.Group();
    spot.position.set(fridgeBases[unit].x, 0, fridgeBases[unit].z);
    scene.add(spot);
    fridgeSpots.push(spot);

    const fridge = new THREE.Group(); // 本体と扉。視点が合っている間、右クリックで開閉する
    setTarget(fridge, { kind: 'fridgeDoor', unit });
    spot.add(fridge);
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
      setTarget(board, { kind: 'fridgeShelf', unit, shelf: shelfId, x: 0, z: 0 });
      board.userData[RESOLVE_KEY] = (hit: THREE.Intersection): Target | null => {
        if (!hit.face || hit.face.normal.y < 0.5) return null;
        const local = spot.worldToLocal(hit.point.clone());
        return { kind: 'fridgeShelf', unit, shelf: shelfId, x: local.x, z: local.z };
      };
      spot.add(board);
      interactables.push(board);
    });

    // 観音開きの扉：左右の端（z=±1.0）を蝶番にして、プレイヤー側へ90度ずつ開く。
    // 扉はガラス張り（ステンレスの枠 + 薄く透けるガラス）で、閉まっていても中の物が少し見える
    // sign: 扉が蝶番から伸びる向き（手前側の扉 = -1、奥側の扉 = +1）
    const buildGlassDoor = (sign: -1 | 1): THREE.Group => {
      const door = new THREE.Group();
      const FRAME = 0.07;
      door.add(box(0.05, 1.9, FRAME, 0xe9eef1, 0, 0.95, sign * (FRAME / 2))); // 蝶番側の枠
      door.add(box(0.05, 1.9, FRAME, 0xe9eef1, 0, 0.95, sign * (1 - FRAME / 2))); // 中央側の枠
      door.add(box(0.05, FRAME, 1 - FRAME * 2, 0xe9eef1, 0, FRAME / 2, sign * 0.5)); // 下の枠
      door.add(box(0.05, FRAME, 1 - FRAME * 2, 0xe9eef1, 0, 1.9 - FRAME / 2, sign * 0.5)); // 上の枠
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 1.9 - FRAME * 2, 1 - FRAME * 2),
        new THREE.MeshLambertMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0.3, depthWrite: false }),
      );
      glass.position.set(0, 0.95, sign * 0.5);
      door.add(glass);
      door.add(box(0.04, 0.5, 0.05, 0x8a9096, -0.04, 1.0, sign * 0.9)); // 取っ手
      return door;
    };
    const left = buildGlassDoor(-1); // 手前側（z=+1.0）の扉
    left.position.set(0, 0, 1.0);
    fridge.add(left); // 回転は sync で state.fridgeOpen に合わせる
    const right = buildGlassDoor(1); // 奥側（z=-1.0）の扉
    right.position.set(0, 0, -1.0);
    fridge.add(right);
    fridgeDoors.push({ left, right });

    decorIn(spot, '冷蔵庫', 0.02, 2.05, 0, 0.5);
  }
  // 冷蔵庫の中の物は、0 の冷蔵庫の基準点の子にして、1 の冷蔵庫に入っているときは、その分ずらして置く（向きは同じ）
  const fridgeSpot = fridgeSpots[0];
  const fridgeShift = fridgeBases.map((b) => ({ x: b.x - layout.fridge.x, z: b.z - layout.fridge.z }));

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
  for (const y of [0, 0.1]) {
    const bowl = new THREE.Group();
    bowl.add(cyl(0.17, 0.13, 0.05, 0xf5f5f5, 0, 0.025, 0)); // 器
    addSaladBase(bowl, 7 + Math.round(y * 100), 0.03, 0.16, 0.045); // サラダ（レタスの山）
    bowl.position.y = y;
    saladBases.add(bowl);
  }
  addFridgeItem('saladBase', saladBases, fridgeStock('saladBase'));

  // トレー・ケース（取ると冷蔵庫から消える）：ほうれん草のトレー、塩オイルソースのケース、
  // 小エビ・サラダチキン・パンチェッタのトレー、ソテーソース・トマトソースのケース
  for (const id of TRAY_IDS) addFridgeItem(TRAY_FRIDGE_ITEM[id], buildTray(id), { kind: 'fridgeTray', id });

  // ミートソース缶。クリックでお玉1杯すくう
  const can = new THREE.Group();
  can.add(cyl(0.1, 0.1, 0.18, INGREDIENTS.meatSauce.color, 0, 0.09, 0)); // 缶
  can.add(cyl(0.101, 0.101, 0.012, 0xcfd3d6, 0, 0.186, 0)); // ふた
  can.add(cyl(0.012, 0.012, 0.26, 0x8a8f94, 0.04, 0.3, 0).rotateZ(-0.35)); // お玉の柄
  can.add(cyl(0.045, 0.03, 0.04, 0xc9ced3, 0.09, 0.42, 0)); // お玉の器
  addFridgeItem('meatSauce', can, fridgeStock('meatSauce'));

  // ホワイトソース缶（右側の冷蔵庫）。ミートソース缶と同じく、クリックでお玉1杯すくう
  const whiteCan = new THREE.Group();
  whiteCan.add(cyl(0.1, 0.1, 0.18, INGREDIENTS.whiteSauce.color, 0, 0.09, 0)); // 缶
  whiteCan.add(cyl(0.101, 0.101, 0.012, 0xcfd3d6, 0, 0.186, 0)); // ふた
  whiteCan.add(cyl(0.012, 0.012, 0.26, 0x8a8f94, 0.04, 0.3, 0).rotateZ(-0.35)); // お玉の柄
  whiteCan.add(cyl(0.045, 0.03, 0.04, 0xc9ced3, 0.09, 0.42, 0)); // お玉の器
  addFridgeItem('whiteSauce', whiteCan, fridgeStock('whiteSauce'));

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

  // イカ墨ソースのパック（右側の冷蔵庫）。温めずに、そのまま鍋に入れる
  // トマトソースのケースと同じ見た目（水色の容器にパックが並ぶ）。トレー置き場には置かず、冷蔵庫の中から直接取る
  addFridgeItem('squidInkSauce', buildPackContainer(INGREDIENTS.squidInkSauce.color), fridgeStock('squidInkSauce'));

  // イカ（ステンレスのバット）。ミートソース缶と同じく冷蔵庫の中から直接、トングで1掴み取る（トレー置き場には置かない）
  addFridgeItem('squid', buildFoodPan('squid'), fridgeStock('squid'));

  // 最初は冷蔵庫にしまってあるボトル（ドレッシング・パプリカパウダー）。取り出すと、台の上に置ける（台の上と同じ大きさ）
  for (const id of Object.keys(BOTTLE_FRIDGE_ITEM) as FridgeBottleId[]) {
    const bottle = new THREE.Group();
    const mesh = buildBottle(INGREDIENTS[id].color);
    mesh.scale.setScalar(1.4);
    bottle.add(mesh);
    addFridgeItem(BOTTLE_FRIDGE_ITEM[id], bottle, { kind: 'fridgeBottle', id });
  }

  // 名前のラベル（位置は毎フレーム、物に付いてくる）
  const fridgeLabels = new Map<FridgeItemId, Label>();
  for (const id of FRIDGE_ITEM_IDS) fridgeLabels.set(id, decorIn(fridgeSpot, FRIDGE_ITEM_NAME[id], 0.02, 1, 0, 0.4));

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
  const SX_STOCK2 = 0.55; // スープ皿の棚の位置（トレー置き場の列は TRAY_COLUMNS）

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
    slot.position.set(SX_WORK, 0.9, 0.8 - j * 0.9);
    //(SX_WORK, 0.9, 0.8 - j * x) xはサラダベース置き場の横間隔
    setTarget(slot, { kind: 'plateSlot', index: cfg.plateSlotCount + j });
    saladSpot.add(slot);
    interactables.push(slot);
    slotViews.push(new ItemView(slot));
    const label = makeLabel('', 0.8);
    label.sprite.position.set(SX_WORK, 1.25, 1.05 - j * 0.9);
    label.sprite.visible = false;
    saladSpot.add(label.sprite);
    slotLabels.push(label);
  }

  // トレー置き場：冷蔵庫から取ったものを、置き場に置くと、1回分ずつ取れる（左クリック）。右クリックで持ち上げて、置き直せる。
  // ほうれん草のトレー（トングで1掴み）、塩オイルソースのケース（お玉で1杯）、小エビ（お玉）、チキン・パンチェッタ・きのこ（トング）、ソテーソース（パック）
  // 置き場の名前は、どれも「トレー置き場」。置き場は区画（TrayZone）ごとにあり、その区画に置ける種類だけ置ける（種類と区画の対応は tray.ts）。
  //   spinach … ほうれん草のトレー専用（サラダを作る台の奥）
  //   topping … ほうれん草以外のトレー・ケース。具材コーナーに、縦2列（奥行き方向）×横5個（台の幅いっぱいに均等）の10か所。どこに、どれを置いてもよい
  // key = `${区画}:${番号}`（番号は state.traySpot と同じ）
  const trayViews = new Map<string, ItemView>();
  // 手に持っているトレー・ケースを置ける（空いている）置き場を、緑の印（置く範囲）と、上下に揺れる矢印で案内する
  const trayGuides = new Map<string, { zone: TrayZone; spot: number; group: THREE.Group; pad: THREE.Mesh; arrow: THREE.Group }>();
  const traySlots = new Map<string, THREE.Group>();
  // 名前の高さ：具材コーナーの隣の具材（ガーリックなど）と同じ高さ（1.3m）にそろえる。ほうれん草のトレーだけ少し低い
  const TRAY_LABEL_Y: Record<TrayZone, number> = { spinach: 1.2, topping: 1.3 };
  // 置き場の大きさ（x 方向 × z 方向）。小エビなどのバット（0.4 四方）が収まる大きさにしてある
  const TRAY_SLOT_SIZE: Record<TrayZone, { w: number; d: number }> = {
    spinach: { w: 0.34, d: 0.4 },
    topping: { w: 0.42, d: 0.42 },
  };
  const trayLabels = new Map<string, Label>();
  const TRAY_COLUMNS = [0.07, 0.5]; // 縦2列の x（手前の列、奥の列）。幅 0.42 の置き場が、サラダを作る台（x=-0.45）と台の右端の間に収まる
  const TRAY_ROWS = [1.12, 0.56, 0, -0.56, -1.12]; // 横5個の z（台の奥行き 3.0m に均等。間隔 0.56）
  const TRAY_SLOT_DEFS: [TrayZone, number, number, number][] = [
    ['spinach', 0, SX_WORK, -1.1], // ほうれん草のトレー置き場
    // 縦2列（x: 手前の列 → 奥の列）× 横5個（z: 手前 → 奥に均等）。番号は、手前の列の手前から奥へ 0〜4、奥の列の手前から奥へ 5〜9
    ...TRAY_COLUMNS.flatMap((x, row) =>
      TRAY_ROWS.map((z, col): [TrayZone, number, number, number] => ['topping', row * TRAY_ROWS.length + col, x, z]),
    ),
  ];
  for (const zone of Object.keys(TRAY_SPOT_COUNT) as TrayZone[]) {
    // 置き場の数が tray.ts と合っていないと、空きの判定とずれる
    if (TRAY_SLOT_DEFS.filter((d) => d[0] === zone).length !== TRAY_SPOT_COUNT[zone]) throw new Error(`トレー置き場の数が tray.ts と違う: ${zone}`);
  }
  for (const [zone, spot, x, z] of TRAY_SLOT_DEFS) {
    const key = `${zone}:${spot}`;
    const size = TRAY_SLOT_SIZE[zone];
    const slot = new THREE.Group();
    slot.add(box(size.w, 0.012, size.d, 0xcfc4ae, 0, 0.006, 0));
    slot.position.set(x, 0.9, z);
    setTarget(slot, { kind: 'traySlot', id: zone, spot });
    saladSpot.add(slot);
    interactables.push(slot);
    trayViews.set(key, new ItemView(slot));
    traySlots.set(key, slot);
    trayLabels.set(key, decorIn(saladSpot, TRAY_ZONE_NAME[zone], x, TRAY_LABEL_Y[zone], z, 0.5));

    const guide = new THREE.Group();
    guide.position.set(x, 0.9, z);
    guide.visible = false;
    const guideColor = 0x4cd964;
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(size.w + 0.08, 0.012, size.d + 0.04),
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
    trayGuides.set(key, { zone, spot, group: guide, pad, arrow });
  }

  // ガーリック・唐辛子の容器（お玉）：冷蔵庫から取って、ボトルと同じように台の上の好きな場所に置く（置き場所は state.freeTraySpot）。
  // 置くと、左クリックで1杯すくえる。右クリックで持ち上げて、置き直せる。手に持っている間と、冷蔵庫にある間は台の上から消える。
  // 位置は台の中心（surfaceOrigin）に足して、ワールド座標に置く（下のボトルと同じ）
  const hotWaterCounterOrigin = { x: layout.hotWater.x + HOT_WATER_COUNTER.center.x, z: layout.hotWater.z + HOT_WATER_COUNTER.center.z };
  const surfaceOrigin = (surface: SurfaceId) =>
    surface === 'salad' ? layout.saladTable : surface === 'hotWater' ? hotWaterCounterOrigin : LEFT_COUNTER;
  const freeTrayViews = new Map<FreeTrayId, { group: THREE.Group; label: Label }>();
  for (const id of FREE_TRAY_IDS) {
    const group = new THREE.Group();
    group.add(buildSteelBin(id as 'garlic' | 'chili'));
    setTarget(group, { kind: 'tableTray', id });
    scene.add(group);
    interactables.push(group);
    const label = decor(trayContentName(id), 0, 1.3, 0, 0.45);
    freeTrayViews.set(id, { group, label });
  }

  // スープ皿の棚（コーンスープ用）：生麺の棚と同じ作り（脚のない棚板が宙に浮いている）で、高さは生麺の棚より少し低い。
  // 上のスープ皿をクリックして取り、サラダを作る台に置く
  const BOWL_X = SX_STOCK2;
  const BOWL_Z = 0.75;
  const SHELF_Y = NOODLE_RACK_Y - 0.1;
  // 棚板は、リム小皿の山も載るように、スープ皿の山の左側（-z 側）へ広げてある（スープ皿の山の位置は変えていない）。
  // 棚板そのものは取れる物ではなく、スープ皿の山・リム小皿の山がそれぞれ取り出し元になる
  const RIM_Z = BOWL_Z - 0.55; // リム小皿の山（スープ皿の左）
  const shelfBoard = box(0.5, 0.06, 1.05, 0x8a6a4b, BOWL_X, SHELF_Y, BOWL_Z - 0.275); // 棚板（生麺の棚と同じ厚み・色）
  saladSpot.add(shelfBoard);
  const bowlShelf = new THREE.Group();
  for (let i = 0; i < 5; i++) bowlShelf.add(cyl(0.2, 0.1, 0.05, 0xf5f5f5, 0, 0.03 + 0.025 + i * 0.045, 0));
  bowlShelf.position.set(BOWL_X, SHELF_Y, BOWL_Z);
  setTarget(bowlShelf, { kind: 'plateStack', style: 'bowl' });
  saladSpot.add(bowlShelf);
  interactables.push(bowlShelf);
  decorIn(saladSpot, 'スープ皿', BOWL_X, SHELF_Y + 0.4, BOWL_Z, 0.45);
  const rimShelf = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    rimShelf.add(cyl(0.26, 0.2, 0.03, 0xf7f5f0, 0, 0.03 + 0.015 + i * 0.032, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.006, 6, 40), mat(0xa9715a)); // 茶色のふち
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03 + 0.03 + i * 0.032;
    rimShelf.add(ring);
  }
  rimShelf.position.set(BOWL_X, SHELF_Y, RIM_Z);
  setTarget(rimShelf, { kind: 'plateStack', style: 'rim' });
  saladSpot.add(rimShelf);
  interactables.push(rimShelf);
  decorIn(saladSpot, 'リム小皿', BOWL_X, SHELF_Y + 0.4, RIM_Z, 0.5);

  // ボトル（ドレッシング・パプリカパウダー・パセリ）：置ける台の天板の上のどこにでも置ける。
  // 位置は state.bottles（台の中心からの相対）。台の中心（surfaceOrigin）に足して、ワールド座標に置く
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
  // 容器（ガーリック・唐辛子）を置こうとしているときの薄い影：丸い容器の形。輪は容器の大きさに広げる
  const ghostBin = new THREE.Mesh(
    new THREE.CylinderGeometry(STEEL_BIN.r, STEEL_BIN.r * 0.88, STEEL_BIN.h, 28),
    new THREE.MeshBasicMaterial({ color: 0xc9ced3, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  ghostBin.position.y = 0.9 + STEEL_BIN.h / 2;
  ghostBin.visible = false;
  ghost.add(ghostBin);
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

  // 下駄の山（ドリアの下にひく木の台）：提供台の左。左クリックで1枚取る。右クリックで持ち上げて、台の上の好きな場所に置き直せる（置き場所は state.getaSpot）。
  // 持ち上げている間は、山と名前が台の上から消える。長い辺を z 方向にそろえて積む
  const getaPile = new THREE.Group();
  for (let i = 0; i < GETA.stackHeight; i++) {
    const geta = buildGeta();
    geta.position.y = i * GETA.h;
    getaPile.add(geta);
  }
  getaPile.rotation.y = Math.PI / 2;
  setTarget(getaPile, { kind: 'getaStack' });
  scene.add(getaPile);
  interactables.push(getaPile);
  const getaLabel = decor('下駄', 0, 1.3, 0, 0.4);
  // 置こうとしている場所の印（山の大きさの板）。置ける間は緑、置けないときは赤
  const getaGhost = new THREE.Mesh(
    new THREE.BoxGeometry(GETA.d, 0.01, GETA.w),
    new THREE.MeshBasicMaterial({ color: 0x4cd964, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  getaGhost.visible = false;
  scene.add(getaGhost);

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

    const nameLabel = makeLabel('', 0.32);
    nameLabel.sprite.position.set(x, 1.09, z);
    nameLabel.sprite.visible = false;
    hotWaterSpot.add(nameLabel.sprite);
    hotWaterViews.push({ pack: new ItemView(slot), label, nameLabel });
  }
  // 湯煎器の奥と右の台（L字）：物を置ける。天板は湯煎器の縁より少し高い。手前と左は空けて、湯煎器の中が見えるようにしてある。
  // 2つの帯は同じ台（hotWater）として扱う。置き場所は、台の外側の矩形の中心からの相対位置
  const hotWaterCounter = new THREE.Group();
  hotWaterCounter.position.set(hotWaterCounterOrigin.x, 0, hotWaterCounterOrigin.z);
  scene.add(hotWaterCounter);
  for (const part of [HOT_WATER_COUNTER.back, HOT_WATER_COUNTER.right]) {
    const w = part.maxX - part.minX;
    const d = part.maxZ - part.minZ;
    const cx = (part.minX + part.maxX) / 2 - HOT_WATER_COUNTER.center.x;
    const cz = (part.minZ + part.maxZ) / 2 - HOT_WATER_COUNTER.center.z;
    const body = box(w, 0.9, d, 0xb89f7a, cx, 0.45, cz);
    setTarget(body, { kind: 'tableTop', surface: 'hotWater', x: 0, z: 0 });
    body.userData[RESOLVE_KEY] = tableTopResolver('hotWater', hotWaterCounter);
    hotWaterCounter.add(body);
    interactables.push(body);
  }
  decorIn(hotWaterSpot, '熱湯', 0, 0.55, 0.53, 0.5);
  decorIn(hotWaterSpot, '湯煎器', 0, 1.4, 0, 0.5); // 湯煎器の上に浮かぶ名前（パックの名前・タイマーより上）
  const hotWaterSteam = addSteam(hotWaterSpot, 0, 0.83, 0, { count: 14, rise: 0.45, spread: 0.5, size: 0.28 });

  // --- 歩ける範囲：壁の内側と、設備の当たり判定（上から見た矩形）---
  // 設備の位置・大きさを変えたら、ここも合わせる（冷蔵庫・サラダ台・熱湯は layout.ts に追従する）
  const obstacles: Rect[] = [
    rectAt(0, -1.8, 3, 1, BOILER_TOP), // IHコンロ（鍋置き場・洗浄機を含む）
    rectAt(0, BOILER_Z, 3, 1.1, BOILER_TOP), // 茹で麺器
    rectAt(LEFT_COUNTER.x, LEFT_COUNTER.z, SURFACES.left.width, SURFACES.left.depth, 0.9), // 左の台（皿・トッピング・提供台）
    rectAt(OVEN.x, (OVEN_Z.outlet.minZ + OVEN_Z.inlet.maxZ) / 2, OVEN_BELT.bodyDepth, OVEN_Z.inlet.maxZ - OVEN_Z.outlet.minZ, OVEN.beltY.upper + 0.25), // ジェットオーブン（入口・出口のベルトを含む）
    rectAt(OVEN_COUNTER.x, OVEN_COUNTER_ROW.z, OVEN_COUNTER.width, OVEN_COUNTER_ROW.depth, 0.9), // 具材台（オーブンの入口の先に3台並ぶ）
    rectAt(layout.hotWater.x, layout.hotWater.z, 0.9, 1, 0.8), // 熱湯
    ...[HOT_WATER_COUNTER.back, HOT_WATER_COUNTER.right].map((p) =>
      rectAt(layout.hotWater.x + (p.minX + p.maxX) / 2, layout.hotWater.z + (p.minZ + p.maxZ) / 2, p.maxX - p.minX, p.maxZ - p.minZ, 0.9),
    ), // 湯煎器の奥と右の台
    rectAt(layout.saladTable.x, layout.saladTable.z, SURFACES.salad.width, SURFACES.salad.depth, 0.9), // サラダ台
    rectAt(layout.fridge.x + 0.4, layout.fridge.z, 0.8, 2, 1.9), // 冷蔵庫（扉は含めない）
    rectAt(layout.fridge2.x + 0.4, layout.fridge2.z, 0.8, 2, 1.9), // 2台目の冷蔵庫
    rectAt(layout.fridge3.x + 0.4, layout.fridge3.z, 0.8, 2, 1.9), // 3台目の冷蔵庫
  ];
  const wallHalf = WALL_HALF; // 壁の厚み(0.1)の半分
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
  const HAND_POS = new THREE.Vector3(0.32, -0.3, -0.65);
  const HAND_ROT = new THREE.Euler(0.35, -0.3, 0);
  handAnchor.position.copy(HAND_POS);
  handAnchor.rotation.copy(HAND_ROT);
  const handView = new ItemView(handAnchor, 0.6);

  // ボトルを振る動き：口を前に倒して、細かく振る。SHAKE_TIME 秒で元の構えに戻る
  const SHAKE_TIME = 0.6;
  const applyHandPose = (state: GameState) => {
    const elapsed = state.bottleShakeAt === null ? Infinity : state.time - state.bottleShakeAt;
    const shaking = state.hand?.kind === 'bottle' && elapsed >= 0 && elapsed < SHAKE_TIME;
    if (!shaking) {
      handAnchor.position.copy(HAND_POS);
      handAnchor.rotation.copy(HAND_ROT);
      return;
    }
    const env = Math.sin((Math.PI * elapsed) / SHAKE_TIME); // 0→1→0。倒して、戻す
    const wobble = Math.sin(elapsed * 50) * env; // 細かい振動
    handAnchor.position.set(HAND_POS.x, HAND_POS.y + 0.06 * env + 0.025 * wobble, HAND_POS.z - 0.08 * env);
    handAnchor.rotation.set(HAND_ROT.x - 2.0 * env + 0.18 * wobble, HAND_ROT.y, HAND_ROT.z + 0.08 * wobble);
  };

  // --- 投げた鍋 ---
  // 投げるたびに作り、拾ったら片づける。視点を合わせやすいよう、鍋より大きい見えない当たり判定を付ける
  type ThrownView = { root: THREE.Group; view: ItemView; hitbox: THREE.Mesh };
  const thrownViews = new Map<number, ThrownView>();
  const syncThrownPots = (state: GameState) => {
    const live = new Set<number>();
    for (const t of state.thrownPots) {
      live.add(t.id);
      let v = thrownViews.get(t.id);
      if (!v) {
        const root = new THREE.Group();
        const hitbox = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.3, 0.46),
          new THREE.MeshLambertMaterial({ visible: false }),
        );
        hitbox.position.y = 0.12;
        root.add(hitbox);
        setTarget(root, { kind: 'thrownPot', id: t.id });
        scene.add(root);
        interactables.push(root);
        v = { root, view: new ItemView(root), hitbox };
        thrownViews.set(t.id, v);
      }
      v.root.position.set(t.x, t.y, t.z);
      v.root.rotation.y = t.yaw;
      v.view.show({ kind: 'pot', pot: t.pot });
    }
    for (const [id, v] of thrownViews) {
      if (live.has(id)) continue;
      v.view.show(null);
      v.hitbox.geometry.dispose();
      (v.hitbox.material as THREE.Material).dispose();
      scene.remove(v.root);
      interactables.splice(interactables.indexOf(v.root), 1);
      thrownViews.delete(id);
    }
  };

  // --- チュートリアルの矢印：指す設備の真上で、上下に揺れる。壁や台に隠れても見えるようにしておく ---
  const marker = new THREE.Group();
  const markerArrow = new THREE.Group(); // 先が下。y = 0 が矢印の先
  {
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 16), markerMat);
    head.rotation.x = Math.PI; // 先を下へ
    head.position.y = 0.1;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.22, 12), markerMat);
    shaft.position.y = 0.31;
    markerArrow.add(head, shaft);
    markerArrow.traverse((o) => (o.renderOrder = 1000));
  }
  marker.add(markerArrow);
  marker.visible = false;
  scene.add(marker);

  // 矢印が指す設備の位置：その設備の見えている部分の、真上（天面の中心）。設備は動く（かごの上下など）ので、毎フレーム調べる
  const markerBox = new THREE.Box3();
  const markerPart = new THREE.Box3();
  const guidePosition = (at: GuideAt): THREE.Vector3 | null => {
    if (at.kind === 'surfaceSpot') {
      const o = surfaceOrigin(at.surface);
      return new THREE.Vector3(o.x + at.x, 0.9, o.z + at.z);
    }
    const root = interactables.find((r) => r.userData[TARGET_KEY] && matchesTarget(r.userData[TARGET_KEY] as Target, at));
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    markerBox.makeEmpty();
    root.traverseVisible((o) => {
      if (o instanceof THREE.Mesh) markerBox.union(markerPart.setFromObject(o));
    });
    if (markerBox.isEmpty()) return root.getWorldPosition(new THREE.Vector3());
    const c = markerBox.getCenter(new THREE.Vector3());
    return new THREE.Vector3(c.x, markerBox.max.y, c.z);
  };

  // --- 毎フレームの同期 ---
  let guideTime = 0;
  let beltTime = 0; // ベルトの縞が流れた時間（一時停止中は止まる）
  const sync = (
    state: GameState,
    dt: number,
    preview: BottlePreview | null = null,
    fridgePreview: FridgePreview | null = null,
    hover: Target | null = null,
    ovenPreview: OvenPreview | null = null,
    getaPreview: GetaPreview | null = null,
  ) => {
    const follow = Math.min(1, dt * 8);

    for (const unit of FRIDGE_UNITS) {
      const { left, right } = fridgeDoors[unit];
      left.rotation.y += ((state.fridgeOpen[unit] ? Math.PI / 2 : 0) - left.rotation.y) * follow;
      right.rotation.y = -left.rotation.y;
    }

    // 冷蔵庫の中の物：state.fridgeItems の場所（棚・奥行き・幅）に置く。
    // 持ち上げている最中の物と、取って冷蔵庫にないトレー・ケースは隠す。名前は、同じ棚の中で高さをずらして、重ならないようにする
    const inFridge = (id: FridgeItemId) => {
      const tray = trayOfFridgeItem(id);
      if (tray) return state.trays[tray] === 'fridge';
      const bottle = bottleOfFridgeItem(id);
      return bottle ? state.bottles[bottle] === null && !(state.hand?.kind === 'bottle' && state.hand.id === bottle) : true;
    };
    const shownByShelf: FridgeItemId[][][] = FRIDGE_UNITS.map(() => FRIDGE_SHELF_Y.map(() => []));
    for (const id of FRIDGE_ITEM_IDS) {
      const group = fridgeItems.get(id)!;
      const spot = state.fridgeItems[id];
      const shown = inFridge(id) && state.moving !== id;
      group.visible = shown;
      group.position.set(spot.x + fridgeShift[spot.unit].x, FRIDGE_SHELF_Y[spot.shelf] + 0.015, spot.z + fridgeShift[spot.unit].z);
      if (shown) shownByShelf[spot.unit][spot.shelf].push(id);
      fridgeLabels.get(id)!.sprite.visible = false;
    }
    shownByShelf.forEach((shelves, unit) => {
      shelves.forEach((ids, shelf) => {
        ids.sort((a, b) => state.fridgeItems[b].z - state.fridgeItems[a].z).forEach((id, rank) => {
          const label = fridgeLabels.get(id)!;
          label.sprite.visible = state.fridgeOpen[unit];
          label.sprite.position.set(0.02 + fridgeShift[unit].x, FRIDGE_SHELF_Y[shelf] + 0.2 + rank * 0.07, state.fridgeItems[id].z + fridgeShift[unit].z);
        });
      });
    });

    // 置こうとしている場所（板と薄い物）。置けない場所では赤
    fridgeGhost.visible = fridgePreview !== null;
    if (fridgePreview) {
      const size = FRIDGE_ITEM_SIZE[fridgePreview.item];
      const shift = fridgeShift[fridgePreview.unit];
      fridgeGhost.position.set(fridgePreview.x + shift.x, FRIDGE_SHELF_Y[fridgePreview.shelf] + 0.015, fridgePreview.z + shift.z);
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

    // 台の上のガーリック・唐辛子の容器（冷蔵庫にある間と、手に持っている間は台の上から消える）
    for (const id of FREE_TRAY_IDS) {
      const v = freeTrayViews.get(id)!;
      const onTable = state.trays[id] === 'table';
      v.group.visible = onTable;
      v.label.sprite.visible = onTable;
      if (onTable) {
        const spot = state.freeTraySpot[id];
        const o = surfaceOrigin(spot.surface);
        v.group.position.set(o.x + spot.x, 0.9, o.z + spot.z);
        v.label.sprite.position.set(o.x + spot.x, 1.3, o.z + spot.z);
      }
    }

    // 提供台の左の下駄の山（持ち上げている間は台の上から消える）と、置こうとしている場所の印。置けない場所では赤
    getaPile.visible = !state.getaMoving;
    getaLabel.sprite.visible = !state.getaMoving;
    {
      const o = surfaceOrigin(state.getaSpot.surface);
      getaPile.position.set(o.x + state.getaSpot.x, 0.9, o.z + state.getaSpot.z);
      getaLabel.sprite.position.set(o.x + state.getaSpot.x, 1.3, o.z + state.getaSpot.z);
    }
    getaGhost.visible = getaPreview !== null;
    if (getaPreview) {
      const o = surfaceOrigin(getaPreview.surface);
      getaGhost.position.set(o.x + getaPreview.x, 0.905, o.z + getaPreview.z);
      (getaGhost.material as THREE.MeshBasicMaterial).color.setHex(getaPreview.valid ? 0x4cd964 : 0xe5484d);
    }

    // 置こうとしている場所（輪と薄いボトル・容器）。置けない台・場所では赤
    ghost.visible = preview !== null;
    if (preview) {
      const o = surfaceOrigin(preview.surface);
      ghost.position.set(o.x + preview.x, 0, o.z + preview.z);
      (ghostRing.material as THREE.MeshBasicMaterial).color.setHex(preview.valid ? 0x4cd964 : 0xe5484d);
      const isBin = isFreeTray(preview.id);
      for (const id of BOTTLE_IDS) ghostBottles.get(id)!.visible = id === preview.id;
      ghostBin.visible = isBin;
      ghostRing.scale.setScalar(isBin ? 1.7 : 1);
    }

    // 湯気は、一時停止中（playing 以外）は止める
    const steamDt = state.phase === 'playing' ? dt : 0;

    // トレー・ケースを持っている間、それを置ける（同じ区画で、空いている）置き場に印と矢印を出し、ゆっくり脈打たせる
    guideTime += steamDt;
    for (const g of trayGuides.values()) {
      const holding = state.hand?.kind === 'tray' && TRAY_ZONE[state.hand.id] === g.zone && trayAt(state, g.zone, g.spot) === null;
      g.group.visible = holding;
      if (holding) {
        (g.pad.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.25 * Math.sin(guideTime * 5);
        g.arrow.position.y = 0.3 + 0.07 * Math.sin(guideTime * 4);
      }
    }
    markerArrow.position.y = 0.1 + 0.06 * Math.sin(guideTime * 5);
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
      v.nameLabel.sprite.visible = !!pack;
      if (pack) {
        v.nameLabel.setText(INGREDIENTS[pack.id].name, '#ffe08a');
        if (pack.warm) v.label.setText('済', '#8be28b');
        else v.label.setText(`${Math.floor(pack.soak)}`, '#ffffff');
      }
    });

    // トレー・ケース：冷蔵庫にあるか、サラダ台に置かれているか（手に持っている間はどちらにもない）。置いた1か所にだけ見せる。
    // 置いたあとは、置き場の名前ではなく、置いたものの名前を出す
    const trayHere = (key: string): TrayId | null => {
      const [zone, spot] = key.split(':') as [TrayZone, string];
      return trayAt(state, zone, Number(spot));
    };
    for (const [key, view] of trayViews) {
      const id = trayHere(key);
      view.show(id ? { kind: 'tray', id } : null);
    }
    for (const [key, label] of trayLabels) {
      const id = trayHere(key);
      label.setText(id ? trayContentName(id) : TRAY_ZONE_NAME[key.split(':')[0] as TrayZone]);
    }

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

      // モニターには加熱の状態だけ。中身の名前は、視点を合わせたときだけ鍋の上に浮かべる
      const status = pot ? potMonitor(pot) : null;
      v.monitor.visible = status !== null;
      if (status) v.label.setText(status.text, status.color);

      const popup = pot ? potPopup(pot, hover?.kind === 'ihBurner' && hover.index === i) : null;
      v.popup.sprite.visible = popup !== null;
      if (popup) v.popup.setText(popup.text, popup.color);
    });

    // 皿の名前：盛り付け中は視点を合わせたときだけ中身の名前。料理が出来上がったら、常に料理名だけ
    slotLabels.forEach((label, i) => {
      const contents = state.plateSlots[i];
      const spec = contents ? plateLabel(contents, hover?.kind === 'plateSlot' && hover.index === i) : null;
      label.sprite.visible = spec !== null;
      if (spec) label.setText(spec.text, spec.color);
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

    // ジェットオーブン：ベルトの縞を流し、ベルトの上の皿を state.oven の位置に置く。本体の中に完全に入っている皿は見せない
    beltTime += steamDt;
    for (const pad of beltPads) {
      const offset = (beltTime * beltSpeed(pad.deck, 'doria', cfg)) % SLAT_PITCH;
      pad.slats.forEach((slat, i) => (slat.position.z = pad.len / 2 - ((i * SLAT_PITCH + offset) % pad.len))); // 縞は -z（出口の向き）へ流れる
    }
    const liveDishes = new Set<number>();
    for (const deck of OVEN_DECKS) {
      for (const d of state.oven.decks[deck]) {
        liveDishes.add(d.id);
        let v = ovenDishViews.get(d.id);
        if (!v) {
          const root = new THREE.Group();
          scene.add(root);
          interactables.push(root);
          const created: OvenDishView = { root, view: new ItemView(root), deck, emerged: false, lane: 0 };
          root.userData[RESOLVE_KEY] = (hit: THREE.Intersection): Target | null =>
            created.emerged ? { kind: 'ovenOutlet', deck: created.deck, lane: created.lane } : beltTarget(created.deck, 'inlet', hit.point);
          ovenDishViews.set(d.id, created);
          v = created;
        }
        // 本体の出口を通り過ぎたら、この1周ぶんの時間が焼けた見た目になる（それまでは、流す前までの焼け具合）
        const passed = d.s >= OVEN_BELT.length + OVEN_BELT.body;
        const cooked = (d.cooked ?? 0) + (passed ? bakeTime(deck, cfg) : 0);
        v.view.show({ kind: 'bakeDish', style: d.style, cooked, state: bakeState(d.style, cooked, cfg) });
        // 流れは +z（壁側の入口の端）から -z（出口）へ。ドリア系は長い辺を流れの向きにして、横向きに置く
        const half = BAKE_DISHES[d.style].w / 2;
        v.root.position.set(OVEN.x + d.x, OVEN.beltY[deck] + 0.002, OVEN_Z.inlet.maxZ - d.s);
        v.emerged = isEmerged(d);
        v.lane = laneOfOffset(d.x);
        v.root.rotation.y = Math.PI / 2;
        v.root.visible = !(d.s - half >= OVEN_BELT.length && d.s + half <= OVEN_BELT.length + OVEN_BELT.body);
        // 出てきた皿は出口の皿（取れる）、それまでは入口側の皿。狙ったときの対象は、皿の位置にいちばん近いレーン
        setTarget(v.root, v.emerged ? { kind: 'ovenOutlet', deck, lane: v.lane } : { kind: 'ovenInlet', deck, x: d.x, s: d.s });
      }
    }
    ovenGhost.visible = ovenPreview !== null;
    if (ovenPreview) {
      for (const style of BAKE_STYLES) ovenGhostPads[style].visible = style === ovenPreview.style;
      const pad = ovenGhostPads[ovenPreview.style];
      (pad.material as THREE.MeshBasicMaterial).color.setHex(ovenPreview.valid ? 0x4cd964 : 0xe5484d);
      ovenGhost.position.set(OVEN.x + ovenPreview.x, OVEN.beltY[ovenPreview.deck] + 0.01, OVEN_Z.inlet.maxZ - ovenPreview.s);
    }
    for (const [id, v] of ovenDishViews) {
      if (liveDishes.has(id)) continue;
      v.view.show(null);
      scene.remove(v.root);
      interactables.splice(interactables.indexOf(v.root), 1);
      ovenDishViews.delete(id);
    }
    for (const deck of OVEN_DECKS) {
      const label = ovenOutLabels.get(deck)!;
      const left = remainingTime(state.oven, deck, cfg);
      const ready = emergedCount(state.oven, deck);
      const name = `${OVEN_DECK_NAME[deck]} 出口`;
      if (ready > 0) label.setText(`${name} 出てきた！ ×${ready}`, '#8be28b');
      else if (left !== null) label.setText(`${name} 焼き中 ${Math.ceil(left)}`, '#ffe08a');
      else label.setText(name);
    }

    syncThrownPots(state);
    handView.show(state.hand);
    applyHandPose(state);
  };

  const trayGuide = (state: GameState) => {
    const hand = state.hand;
    if (hand?.kind !== 'tray') return null;
    const zone = TRAY_ZONE[hand.id];
    if (zone === null) {
      // ガーリック・唐辛子の容器：台の上のどこでもよい。標準の場所を案内する
      const home = FREE_TRAY_HOME[hand.id as FreeTrayId];
      const o = surfaceOrigin(home.surface);
      return { world: new THREE.Vector3(o.x + home.x, 1.2, o.z + home.z), label: '台の上の好きな場所に置く' };
    }
    const spot = freeTraySpots(state, zone)[0]; // 空いている置き場が複数あるときは、最初のひとつを案内する
    const slot = spot === undefined ? undefined : traySlots.get(`${zone}:${spot}`);
    if (!slot) return null; // 空きがない（持ち上げた元の場所は、持った時点で空く）
    const world = slot.getWorldPosition(new THREE.Vector3());
    world.y += 0.3;
    return { world, label: TRAY_ZONE_NAME[zone] };
  };

  const setMarker = (at: GuideAt | null): THREE.Vector3 | null => {
    const pos = at ? guidePosition(at) : null;
    marker.visible = pos !== null;
    if (!pos) return null;
    marker.position.copy(pos);
    return pos.clone().setY(pos.y + 0.4); // 矢印の中ほど（画面の縁の矢印は、この位置の向きを指す）
  };

  return { scene, interactables, world, handAnchor, trayGuide, setMarker, sync };
}
