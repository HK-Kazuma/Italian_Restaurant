import type { GameConfig } from './config';
import type { Boiler, NoodleKind } from './types';

type BoilerTimes = Pick<GameConfig, 'boilTime' | 'penneBoilTime' | 'graceTime' | 'shortBoilTime'>;

// 状態遷移：empty → set → boiling → lifted → (猶予切れ) overdue → shortBoil → lifted …
// 各関数は遷移できたら true を返す。boiler は直接書き換える。

export function createBoiler(): Boiler {
  return { state: 'empty', timer: 0, noodle: 'noodle' };
}

export function setNoodle(b: Boiler, noodle: NoodleKind = 'noodle'): boolean {
  if (b.state !== 'empty') return false;
  b.state = 'set';
  b.timer = 0;
  b.noodle = noodle;
  return true;
}

export function pressButton(b: Boiler, cfg: BoilerTimes): boolean {
  if (b.state !== 'set') return false;
  b.state = 'boiling';
  b.timer = b.noodle === 'penne' ? cfg.penneBoilTime : cfg.boilTime;
  return true;
}

// かごが上がっている間だけ麺を取り出せる。取り出した麺の種類を返す（取れなければ null）
export function takeNoodle(b: Boiler): NoodleKind | null {
  if (b.state !== 'lifted') return null;
  b.state = 'empty';
  b.timer = 0;
  return b.noodle;
}

export function startShortBoil(b: Boiler, cfg: BoilerTimes): boolean {
  if (b.state !== 'overdue') return false;
  b.state = 'shortBoil';
  b.timer = cfg.shortBoilTime;
  return true;
}

export function updateBoiler(b: Boiler, dt: number, cfg: BoilerTimes): void {
  switch (b.state) {
    case 'boiling':
    case 'shortBoil':
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = 'lifted';
        b.timer = cfg.graceTime + b.timer; // 超過分は猶予から引く
      }
      break;
    case 'lifted':
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = 'overdue';
        b.timer = 0;
      }
      break;
    default:
      break;
  }
}
