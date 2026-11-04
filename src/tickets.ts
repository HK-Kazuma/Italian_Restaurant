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

export function pickMenu(menus: readonly MenuItem[], rng: Rng): MenuItem {
  const pool = menus.filter((m) => m.enabled);
  if (pool.length === 0) throw new Error('no enabled menu');
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

export function createTicket(id: number, menu: MenuItem, now: number): Ticket {
  return { id, menuId: menu.id, arrivedAt: now, station: menu.station };
}
