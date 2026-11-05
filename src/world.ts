// 歩ける範囲の判定（上から見た2Dの当たり判定）。Three.js には依存しない。
// プレイヤーは半径 r の円。部屋の壁（bounds）の内側で、設備（obstacles）に入らない場所だけ立てる。

// top: 設備の天板の高さ（m）。投げた鍋が上に乗る・横からぶつかるために使う（省略 = 高さ不明の設備）
export type Rect = { minX: number; maxX: number; minZ: number; maxZ: number; top?: number };

export type World = {
  bounds: Rect; // 壁の内側の面
  obstacles: Rect[]; // カウンター・冷蔵庫などの設備
};

// 中心 (cx, cz)、幅 w（x 方向）× 奥行き d（z 方向）の矩形。top は天板の高さ
export function rectAt(cx: number, cz: number, w: number, d: number, top?: number): Rect {
  const rect: Rect = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
  if (top !== undefined) rect.top = top;
  return rect;
}

function circleHitsRect(x: number, z: number, r: number, rect: Rect): boolean {
  const nearestX = Math.min(rect.maxX, Math.max(rect.minX, x));
  const nearestZ = Math.min(rect.maxZ, Math.max(rect.minZ, z));
  return Math.hypot(x - nearestX, z - nearestZ) < r;
}

export function canStand(x: number, z: number, r: number, world: World): boolean {
  const b = world.bounds;
  if (x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r) return false;
  return world.obstacles.every((o) => !circleHitsRect(x, z, r, o));
}

// (dx, dz) だけ動く。ぶつかる軸だけ止めるので、壁や設備に沿って滑るように動ける
export function moveInWorld(
  x: number,
  z: number,
  dx: number,
  dz: number,
  r: number,
  world: World,
): { x: number; z: number } {
  const nx = canStand(x + dx, z, r, world) ? x + dx : x;
  const nz = canStand(nx, z + dz, r, world) ? z + dz : z;
  return { x: nx, z: nz };
}
