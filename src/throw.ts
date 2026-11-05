import type { ThrownPot, Pot } from './types';
import type { World } from './world';

// 投げた鍋の動き（重力・床・台の天板・台の側面・壁）。Three.js には依存しない。
// 鍋は上から見て半径 POT_RADIUS の円として扱い、高さのある設備（World の obstacles の top）には乗る・ぶつかる。

export type Vec3 = { x: number; y: number; z: number };
// 投げる向き。origin = 視点の位置、dir = 視線の向き
export type ThrowAim = { origin: Vec3; dir: Vec3 };

export const POT_RADIUS = 0.17;
const THROW_SPEED = 6; // 投げる速さ（m/s）
const THROW_LIFT = 1.5; // 少し上向きに放る（m/s）
const SPAWN_AHEAD = 0.5; // 視点からこれだけ前で手を離れる
const SPAWN_DROP = 0.25; // 手の高さ（視点より低い）
const SPIN = 9; // 飛んでいる間の回転（rad/s）
const GRAVITY = 9.8;
const RESTITUTION = 0.3; // 床・台に落ちたときの跳ね返り
const WALL_RESTITUTION = 0.4;
const GROUND_DRAG = 5; // 床・台の上で滑る勢いが減る速さ（1/s）
const REST_SPEED = 0.15; // これより遅くなったら止まる
const CEILING = 3.1;
const MAX_STEP = 1 / 120; // 速い鍋が台を突き抜けないよう、細かく刻んで進める

// 床も壁もない広い空間（設備を知らないとき）
export const OPEN_WORLD: World = {
  bounds: { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity },
  obstacles: [],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 手を離れる鍋の最初の位置と速度
export function launchPot(id: number, pot: Pot, aim: ThrowAim): ThrownPot {
  const len = Math.hypot(aim.dir.x, aim.dir.y, aim.dir.z) || 1;
  const d = { x: aim.dir.x / len, y: aim.dir.y / len, z: aim.dir.z / len };
  return {
    id,
    pot,
    x: aim.origin.x + d.x * SPAWN_AHEAD,
    y: aim.origin.y + d.y * SPAWN_AHEAD - SPAWN_DROP,
    z: aim.origin.z + d.z * SPAWN_AHEAD,
    vx: d.x * THROW_SPEED,
    vy: d.y * THROW_SPEED + THROW_LIFT,
    vz: d.z * THROW_SPEED,
    yaw: 0,
    spin: SPIN,
    resting: false,
  };
}

// 落ちた勢いが小さければ跳ねず、大きければ少し跳ね返る
function bounce(vy: number): number {
  return vy < -1.2 ? -vy * RESTITUTION : 0;
}

export function stepThrownPot(p: ThrownPot, dt: number, world: World): void {
  if (p.resting) return;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
  const h = dt / steps;
  for (let i = 0; i < steps && !p.resting; i++) substep(p, h, world);
}

function substep(p: ThrownPot, h: number, world: World): void {
  const prevY = p.y;
  p.vy -= GRAVITY * h;
  p.x += p.vx * h;
  p.y += p.vy * h;
  p.z += p.vz * h;
  let grounded = false;

  // 台・冷蔵庫など：天板の上から落ちてきたら乗る。それ以外（横から）はぶつかって跳ね返る
  for (const o of world.obstacles) {
    if (o.top === undefined || p.y >= o.top) continue;
    const dx = p.x - clamp(p.x, o.minX, o.maxX);
    const dz = p.z - clamp(p.z, o.minZ, o.maxZ);
    const dist = Math.hypot(dx, dz);
    if (dist >= POT_RADIUS) continue;

    if (prevY >= o.top && p.vy < 0) {
      p.y = o.top;
      p.vy = bounce(p.vy);
      grounded = true;
      continue;
    }

    let ux: number;
    let uz: number;
    let pen: number;
    if (dist > 1e-6) {
      ux = dx / dist;
      uz = dz / dist;
      pen = POT_RADIUS - dist;
    } else {
      // 中心が設備の中に入ってしまったときは、いちばん近い縁から押し出す
      const l = p.x - o.minX;
      const r = o.maxX - p.x;
      const f = p.z - o.minZ;
      const b = o.maxZ - p.z;
      const m = Math.min(l, r, f, b);
      if (m === l) [ux, uz, pen] = [-1, 0, l + POT_RADIUS];
      else if (m === r) [ux, uz, pen] = [1, 0, r + POT_RADIUS];
      else if (m === f) [ux, uz, pen] = [0, -1, f + POT_RADIUS];
      else [ux, uz, pen] = [0, 1, b + POT_RADIUS];
    }
    p.x += ux * pen;
    p.z += uz * pen;
    const vn = p.vx * ux + p.vz * uz;
    if (vn < 0) {
      p.vx -= (1 + WALL_RESTITUTION) * vn * ux;
      p.vz -= (1 + WALL_RESTITUTION) * vn * uz;
    }
  }

  // 床
  if (p.y <= 0) {
    p.y = 0;
    if (p.vy < 0) p.vy = bounce(p.vy);
    grounded = true;
  }

  // 天井
  if (p.y > CEILING) {
    p.y = CEILING;
    if (p.vy > 0) p.vy = -p.vy * WALL_RESTITUTION;
  }

  // 壁
  const b = world.bounds;
  if (p.x < b.minX + POT_RADIUS) {
    p.x = b.minX + POT_RADIUS;
    if (p.vx < 0) p.vx = -p.vx * WALL_RESTITUTION;
  } else if (p.x > b.maxX - POT_RADIUS) {
    p.x = b.maxX - POT_RADIUS;
    if (p.vx > 0) p.vx = -p.vx * WALL_RESTITUTION;
  }
  if (p.z < b.minZ + POT_RADIUS) {
    p.z = b.minZ + POT_RADIUS;
    if (p.vz < 0) p.vz = -p.vz * WALL_RESTITUTION;
  } else if (p.z > b.maxZ - POT_RADIUS) {
    p.z = b.maxZ - POT_RADIUS;
    if (p.vz > 0) p.vz = -p.vz * WALL_RESTITUTION;
  }

  p.yaw += p.spin * h;
  if (!grounded) return;

  // 床・台の上では滑りながら減速して止まる
  const drag = Math.exp(-GROUND_DRAG * h);
  p.vx *= drag;
  p.vz *= drag;
  p.spin *= drag;
  if (Math.hypot(p.vx, p.vz) < REST_SPEED && Math.abs(p.vy) < 0.01) {
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.spin = 0;
    p.resting = true;
  }
}
