import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { createPot } from './pot';
import { OPEN_WORLD, POT_RADIUS, launchPot, stepThrownPot, type ThrowAim } from './throw';
import type { Target } from './types';
import { rectAt, type World } from './world';

const potSlot = (index: number): Target => ({ kind: 'potSlot', index });
const aimForward: ThrowAim = { origin: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 } }; // -z が正面

function simulate(p: ReturnType<typeof launchPot>, world: World, seconds = 10) {
  for (let t = 0; t < seconds && !p.resting; t += 1 / 60) stepThrownPot(p, 1 / 60, world);
  return p;
}

describe('投げた鍋の動き', () => {
  it('視線の向きに飛んで、床に落ちて止まる', () => {
    const p = simulate(launchPot(1, createPot(), aimForward), OPEN_WORLD);
    expect(p.resting).toBe(true);
    expect(p.y).toBe(0);
    expect(p.z).toBeLessThan(-1); // 前（-z）へ飛んだ
    expect(Math.abs(p.x)).toBeLessThan(0.01);
  });

  it('上を向いて投げると、真下を向いて投げるより遠くへ飛ぶ', () => {
    const up = simulate(launchPot(1, createPot(), { origin: aimForward.origin, dir: { x: 0, y: 0.5, z: -1 } }), OPEN_WORLD);
    const down = simulate(launchPot(2, createPot(), { origin: aimForward.origin, dir: { x: 0, y: -0.5, z: -1 } }), OPEN_WORLD);
    expect(up.z).toBeLessThan(down.z);
  });

  it('壁の手前で止まり、壁の外へは出ない', () => {
    const world: World = { bounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }, obstacles: [] };
    const p = simulate(launchPot(1, createPot(), aimForward), world);
    expect(p.z).toBeGreaterThanOrEqual(-3 + POT_RADIUS - 1e-9);
  });

  it('台の上に落ちたら、天板に乗って止まる', () => {
    const world: World = { bounds: OPEN_WORLD.bounds, obstacles: [rectAt(0, -1.2, 2, 1.2, 0.9)] };
    // 台の真上から放る
    const p = launchPot(1, createPot(), { origin: { x: 0, y: 1.6, z: -1.2 }, dir: { x: 0, y: 0, z: -1 } });
    p.x = 0;
    p.z = -1.2;
    p.vx = 0;
    p.vz = 0;
    p.vy = 0;
    simulate(p, world);
    expect(p.resting).toBe(true);
    expect(p.y).toBeCloseTo(0.9, 5);
  });

  it('台の側面に当たったら、台の中へは入らず跳ね返る', () => {
    const counter = rectAt(0, -2, 4, 1, 0.9);
    const world: World = { bounds: OPEN_WORLD.bounds, obstacles: [counter] };
    // 低い位置から台に向かって投げる
    const p = launchPot(1, createPot(), { origin: { x: 0, y: 0.5, z: 0 }, dir: { x: 0, y: 0, z: -1 } });
    for (let i = 0; i < 600 && !p.resting; i++) {
      stepThrownPot(p, 1 / 60, world);
      if (p.y < 0.85) expect(p.z).toBeGreaterThanOrEqual(counter.maxZ + POT_RADIUS - 1e-6); // 手前の面より中には入らない
    }
    expect(p.resting).toBe(true);
  });

  it('1フレームが長くても、速い鍋が台を突き抜けない', () => {
    const counter = rectAt(0, -2, 4, 0.2, 0.9); // 薄い台
    const world: World = { bounds: OPEN_WORLD.bounds, obstacles: [counter] };
    const p = launchPot(1, createPot(), { origin: { x: 0, y: 0.5, z: 0 }, dir: { x: 0, y: 0, z: -1 } });
    for (let i = 0; i < 100; i++) stepThrownPot(p, 0.1, world);
    expect(p.z).toBeGreaterThan(-1.9);
  });
});

describe('Game: 鍋を投げる・拾う', () => {
  function gameHoldingPot() {
    const g = new Game(cfg, () => 0);
    g.start();
    g.interact(potSlot(0));
    return g;
  }

  it('鍋を持って右クリックすると、手から離れて飛んでいく', () => {
    const g = gameHoldingPot();
    const pot = (g.state.hand as { pot: unknown }).pot;
    g.rightClick(null, aimForward);
    expect(g.state.hand).toBeNull();
    expect(g.state.thrownPots).toHaveLength(1);
    expect(g.state.thrownPots[0].pot).toBe(pot); // 同じ鍋（中身も汚れも引き継ぐ）
  });

  it('向きがない右クリックでは、鍋は手に残る（今までどおり捨てられない）', () => {
    const g = gameHoldingPot();
    g.rightClick(null);
    expect(g.state.hand?.kind).toBe('pot');
    expect(g.state.thrownPots).toHaveLength(0);
  });

  it('鍋以外を持っているときの右クリックは、鍋を投げない', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    g.interact({ kind: 'plateStack' });
    g.rightClick(null, aimForward);
    expect(g.state.thrownPots).toHaveLength(0);
    expect(g.state.hand).toBeNull(); // 皿は今までどおり捨てられる
  });

  it('投げた鍋は、時間が進むと床に落ちて止まる', () => {
    const g = gameHoldingPot();
    g.rightClick(null, aimForward);
    for (let i = 0; i < 300; i++) g.update(1 / 60);
    expect(g.state.thrownPots[0].resting).toBe(true);
    expect(g.state.thrownPots[0].y).toBe(0);
  });

  it('落ちた鍋は、手が空なら左クリックで拾える（中身もそのまま）', () => {
    const g = gameHoldingPot();
    const pot = (g.state.hand as { pot: { contents: string[] } }).pot;
    pot.contents.push('meatSauce');
    g.rightClick(null, aimForward);
    for (let i = 0; i < 300; i++) g.update(1 / 60);

    const id = g.state.thrownPots[0].id;
    g.interact({ kind: 'thrownPot', id });
    expect(g.state.hand?.kind).toBe('pot');
    expect((g.state.hand as { pot: unknown }).pot).toBe(pot);
    expect(g.state.thrownPots).toHaveLength(0);
  });

  it('手がふさがっていると、落ちた鍋は拾えない', () => {
    const g = gameHoldingPot();
    g.rightClick(null, aimForward);
    const id = g.state.thrownPots[0].id;
    g.interact({ kind: 'plateStack' }); // 皿を持つ
    expect(g.planInteract({ kind: 'thrownPot', id })).toBeNull();
  });

  it('拾った鍋は、また鍋置き場などに戻せる', () => {
    const g = gameHoldingPot();
    g.rightClick(null, aimForward);
    g.interact({ kind: 'thrownPot', id: g.state.thrownPots[0].id });
    g.interact(potSlot(0)); // 空いた置き場へ
    expect(g.state.hand).toBeNull();
    expect(g.state.potSlots[0]).not.toBeNull();
  });

  it('存在しない鍋は拾えない', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    expect(g.planInteract({ kind: 'thrownPot', id: 999 })).toBeNull();
  });

  it('一時停止中は、投げた鍋も止まる', () => {
    const g = gameHoldingPot();
    g.rightClick(null, aimForward);
    g.update(0.05);
    const before = { ...g.state.thrownPots[0] };
    g.pause();
    g.update(1);
    expect(g.state.thrownPots[0].x).toBe(before.x);
    expect(g.state.thrownPots[0].y).toBe(before.y);
  });

  it('ゲームをやり直すと、投げた鍋は片づく', () => {
    const g = gameHoldingPot();
    g.rightClick(null, aimForward);
    g.start();
    expect(g.state.thrownPots).toHaveLength(0);
  });
});
