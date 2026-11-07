import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { DIFFICULTIES, configFor, getDifficulty } from './difficulty';
import { Game } from './game';
import { MENU } from './recipe';

describe('難易度の表', () => {
  it('3つあり、初級・中級・上級の順', () => {
    expect(DIFFICULTIES.map((d) => d.name)).toEqual(['トライアルクルー', 'リーディングクルー', 'アソシエイトクルー']);
  });
  it('重みに書いた品は、すべて実在するメニュー', () => {
    const ids = new Set(MENU.map((m) => m.id));
    for (const d of DIFFICULTIES) for (const id of Object.keys(d.menuWeights)) expect(ids.has(id)).toBe(true);
  });
  it('どの難易度でも、出る品が1つ以上ある', () => {
    for (const d of DIFFICULTIES) {
      expect(MENU.some((m) => m.enabled && (d.menuWeights[m.id] ?? 1) > 0)).toBe(true);
    }
  });
  it('難しいほど、伝票が届く間隔が短く、並ぶ数が多い', () => {
    const [trial, leading, associate] = DIFFICULTIES.map((d) => configFor(cfg, d.id));
    expect(trial.ticketIntervalStart).toBeGreaterThan(leading.ticketIntervalStart);
    expect(leading.ticketIntervalStart).toBeGreaterThan(associate.ticketIntervalStart);
    expect(trial.ticketIntervalEnd).toBeGreaterThan(leading.ticketIntervalEnd);
    expect(leading.ticketIntervalEnd).toBeGreaterThan(associate.ticketIntervalEnd);
    expect(trial.maxOpenTickets).toBeLessThan(leading.maxOpenTickets);
  });
  it('練習（難易度なし）は config.ts のまま', () => {
    expect(configFor(cfg, null)).toBe(cfg);
  });
});

// 偏りのない（再現できる）乱数
function seeded(seed = 12345): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('Game: 難易度', () => {
  // rng = 0.5 は、間隔のばらつきがちょうど 0 になる値
  const game = (difficulty: 'trial' | 'leading' | 'associate', rng: () => number = () => 0.5) => {
    const g = new Game(cfg, rng);
    g.getReady(difficulty);
    g.begin();
    return g;
  };

  it('選んだ難易度が状態に入る。練習は null', () => {
    const g = new Game(cfg, () => 0);
    expect(g.state.difficulty).toBeNull();
    g.getReady('associate');
    expect(g.state.difficulty).toBe('associate');
    g.startPractice();
    expect(g.state.difficulty).toBeNull();
  });

  it('最初の伝票が届く時刻と、その次の間隔が難易度で変わる', () => {
    const trial = game('trial');
    expect(trial.state.nextTicketAt).toBe(getDifficulty('trial').tickets.firstTicketAt);
    trial.update(trial.state.nextTicketAt);
    expect(trial.state.nextTicketAt - trial.state.time).toBeCloseTo(getDifficulty('trial').tickets.ticketIntervalStart!, 0);

    const pro = game('associate');
    pro.update(pro.state.nextTicketAt);
    expect(pro.state.nextTicketAt - pro.state.time).toBeCloseTo(getDifficulty('associate').tickets.ticketIntervalStart!, 0);
  });

  it('同時に並ぶ伝票の上限が難易度で変わる', () => {
    const trial = game('trial');
    for (let i = 0; i < 200; i++) trial.update(1);
    expect(trial.state.tickets.length).toBe(getDifficulty('trial').tickets.maxOpenTickets);
  });

  it('トライアルでは、手順の多い4品は出ない', () => {
    const seen = new Set<string>();
    const g = game('trial', seeded());
    for (let i = 0; i < 2000; i++) {
      g.state.nextTicketAt = 0; // 毎回、次の伝票を届けさせる
      g.state.tickets = [];
      g.update(0.001);
      for (const t of g.state.tickets) seen.add(t.menuId);
    }
    expect(seen.size).toBe(MENU.length - 4);
    for (const id of ['peperoncino', 'carbonara', 'penne', 'mushroomCream']) expect(seen.has(id)).toBe(false);
  });

  it('アソシエイトでは、全部の品が出る（手順の多い品が多め）', () => {
    const counts = new Map<string, number>();
    const g = game('associate', seeded());
    for (let i = 0; i < 2000; i++) {
      g.state.nextTicketAt = 0;
      g.state.tickets = [];
      g.update(0.001);
      for (const t of g.state.tickets) counts.set(t.menuId, (counts.get(t.menuId) ?? 0) + 1);
    }
    expect(counts.size).toBe(MENU.length);
    expect(counts.get('carbonara')!).toBeGreaterThan(counts.get('tarako')! * 2);
  });
});
