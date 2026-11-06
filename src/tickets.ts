import type { GameConfig } from './config';
import type { MenuItem } from './recipe';
import type { Ticket } from './types';

type Rng = () => number;

// progress（0〜1）が進むほど間隔が短くなる。ばらつきで「次がいつ来るか」を読ませない
export function nextTicketInterval(
  progress: number,
  cfg: Pick<GameConfig, 'ticketIntervalStart' | 'ticketIntervalEnd' | 'ticketIntervalJitter'>,
  rng: Rng,
): number {
  const p = Math.min(1, Math.max(0, progress));
  const base = cfg.ticketIntervalStart + (cfg.ticketIntervalEnd - cfg.ticketIntervalStart) * p;
  const jitter = 1 + (rng() * 2 - 1) * cfg.ticketIntervalJitter;
  return base * jitter;
}

// weights: 品ごとの出やすさ（0 = 出ない。書いていない品は 1）。省略 = どの品も同じ確率
export function pickMenu(menus: readonly MenuItem[], rng: Rng, weights: Readonly<Record<string, number>> = {}): MenuItem {
  const weightOf = (m: MenuItem) => Math.max(0, weights[m.id] ?? 1);
  const pool = menus.filter((m) => m.enabled && weightOf(m) > 0);
  if (pool.length === 0) throw new Error('no enabled menu');
  let r = rng() * pool.reduce((sum, m) => sum + weightOf(m), 0);
  for (const m of pool) {
    r -= weightOf(m);
    if (r < 0) return m;
  }
  return pool[pool.length - 1];
}

export function createTicket(id: number, menu: MenuItem, now: number): Ticket {
  return { id, menuId: menu.id, arrivedAt: now, station: menu.station };
}
