import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { BAKE_DISHES, GETA, GETA_HOME, GETA_RANGE, LEFT_COUNTER, SERVE_PASS, SURFACES } from './layout';
import { frontS } from './oven';
import type { Target } from './types';

const stack: Target = { kind: 'getaStack' };
const stock: Target = { kind: 'ovenStock', style: 'doria' };
const inlet: Target = { kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('doria') };
const outlet: Target = { kind: 'ovenOutlet', deck: 'upper', lane: 1 };
const pass: Target = { kind: 'servePass' };
const tableTop = (x: number, z: number, surface: 'left' | 'salad' | 'hotWater' = 'left'): Target => ({ kind: 'tableTop', surface, x, z });

const newGame = () => {
  const g = new Game(cfg, () => 0);
  g.startPractice();
  g.state.nextTicketAt = Infinity;
  return g;
};

// ドリア系の皿を焼いて、出口に出てきた状態にする
const bakeDoria = (g: Game) => {
  g.interact(stock);
  g.interact(inlet);
  for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
};

describe('下駄の置き場（layout.ts）', () => {
  it('下駄は、ドリアの皿よりひと回り大きい', () => {
    expect(GETA.w).toBeGreaterThan(BAKE_DISHES.doria.w);
    expect(GETA.d).toBeGreaterThan(BAKE_DISHES.doria.d);
  });

  it('山の最初の置き場所は、左の台の上で、提供台より壁側（+z）の置ける範囲の中にある', () => {
    expect(GETA_HOME.surface).toBe('left');
    expect(GETA_HOME.x).toBeGreaterThanOrEqual(GETA_RANGE.minX);
    expect(GETA_HOME.x).toBeLessThanOrEqual(GETA_RANGE.maxX);
    expect(GETA_HOME.z).toBeGreaterThanOrEqual(GETA_RANGE.minZ);
    expect(GETA_HOME.z).toBeLessThanOrEqual(GETA_RANGE.maxZ);
    // 提供台のすぐ左（提供台と同じ列）で、提供台に重ならない
    expect(LEFT_COUNTER.x + GETA_HOME.x).toBeCloseTo(SERVE_PASS.x);
    const passEdge = SERVE_PASS.z + SERVE_PASS.size / 2;
    expect(LEFT_COUNTER.z + GETA_HOME.z - GETA.w / 2).toBeGreaterThan(passEdge);
  });

  it('置ける範囲は、左の台の天板の内側に収まる', () => {
    expect(GETA_RANGE.minX - GETA.d / 2).toBeGreaterThanOrEqual(-SURFACES.left.width / 2);
    expect(GETA_RANGE.maxX + GETA.d / 2).toBeLessThanOrEqual(SURFACES.left.width / 2);
    expect(GETA_RANGE.maxZ + GETA.w / 2).toBeLessThanOrEqual(SURFACES.left.depth / 2);
  });
});

describe('下駄を取る・戻す', () => {
  it('手が空なら、下駄の山から1枚取れる。何枚でも取れる（山は減らない）', () => {
    const g = newGame();
    g.interact(stack);
    expect(g.state.hand).toEqual({ kind: 'geta' });
    g.interact(stack); // 持っているときは戻す
    expect(g.state.hand).toBeNull();
    g.interact(stack);
    expect(g.state.hand).toEqual({ kind: 'geta' });
  });

  it('ほかの物を持っているときは、下駄を取れない', () => {
    const g = newGame();
    g.interact({ kind: 'noodleRack' });
    expect(g.planInteract(stack)).toBeNull();
  });
});

describe('ドリアを下駄に乗せる', () => {
  it('下駄を持って、焼き上がったドリアに左クリックすると、ドリアが下駄に乗る', () => {
    const g = newGame();
    bakeDoria(g);
    g.interact(stack);
    expect(g.planInteract(outlet)).not.toBeNull();
    g.interact(outlet);
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'doria', baked: true, geta: true });
    expect(g.state.oven.decks.upper).toHaveLength(0); // ベルトからは取れている
  });

  it('まだ出てきていないドリアには、乗せられない（下駄は手に残る）', () => {
    const g = newGame();
    g.interact(stock);
    g.interact(inlet);
    g.interact(stack);
    expect(g.planInteract(outlet)).toBeNull();
    expect(g.state.hand).toEqual({ kind: 'geta' });
  });

  it('下駄に乗せられるのはドリア系だけ（焼けたピザ系には乗せられない）', () => {
    const g = newGame();
    g.interact({ kind: 'ovenStock', style: 'pizza' });
    g.interact({ kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('pizza') });
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.interact(stack);
    expect(g.planInteract(outlet)).toBeNull();
    expect(g.state.oven.decks.upper).toHaveLength(1);
  });

  it('下駄なしで取った焼き上がりのドリアも、下駄の山に左クリックして、下駄に乗せられる', () => {
    const g = newGame();
    bakeDoria(g);
    g.interact(outlet);
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'doria', baked: true });
    g.interact(stack);
    expect(g.state.hand).toEqual({ kind: 'bakeDish', style: 'doria', baked: true, geta: true });
    expect(g.planInteract(stack)).toBeNull(); // もう乗っている
  });

  it('焼く前のドリアは、下駄に乗せられない', () => {
    const g = newGame();
    g.interact(stock);
    expect(g.planInteract(stack)).toBeNull();
  });
});

describe('提供', () => {
  it('下駄に乗せたドリアは、提供台に出せる（ドリアのメニューがないので、採点はなし）', () => {
    const g = newGame();
    bakeDoria(g);
    g.interact(stack);
    g.interact(outlet);
    const before = { score: g.state.score, mistakes: g.state.mistakes };
    g.interact(pass);
    expect(g.state.hand).toBeNull();
    expect(g.state.score).toBe(before.score);
    expect(g.state.mistakes).toBe(before.mistakes);
  });

  it('下駄に乗せていないドリアは、提供台に出せない', () => {
    const g = newGame();
    bakeDoria(g);
    g.interact(outlet);
    expect(g.planInteract(pass)).toBeNull();
    expect(g.getaHint(pass)).toContain('下駄');
  });
});

describe('下駄の山を右クリックで置き直す', () => {
  it('手が空で、山に右クリックすると持ち上がる。持ち上げている間は、山から取れない', () => {
    const g = newGame();
    g.rightClick(stack);
    expect(g.state.getaMoving).toBe(true);
    expect(g.planInteract(stack)).toBeNull();
    expect(g.state.hand).toBeNull();
  });

  it('手に物を持っているときは、持ち上がらない', () => {
    const g = newGame();
    g.interact({ kind: 'noodleRack' });
    g.rightClick(stack);
    expect(g.state.getaMoving).toBe(false);
  });

  it('台の上に右クリックすると、その場所に置ける（置ける範囲に収まる）', () => {
    const g = newGame();
    g.rightClick(stack);
    const x = (GETA_RANGE.minX + GETA_RANGE.maxX) / 2 - 0.1;
    const z = GETA_RANGE.maxZ - 0.05;
    expect(g.previewGeta(tableTop(x, z))).toMatchObject({ valid: true, surface: 'left' });
    g.rightClick(tableTop(x, z));
    expect(g.state.getaMoving).toBe(false);
    expect(g.state.getaSpot).toEqual({ surface: 'left', x, z });
    g.interact(stack); // 置き直したあとも、取れる
    expect(g.state.hand).toEqual({ kind: 'geta' });
  });

  it('台の外へ狙いがずれても、置ける範囲の内側に収まる（提供台には重ならない）', () => {
    const g = newGame();
    g.rightClick(stack);
    const p = g.previewGeta(tableTop(-9, -9))!;
    expect(p.x).toBeCloseTo(GETA_RANGE.minX);
    expect(p.z).toBeCloseTo(GETA_RANGE.minZ);
    const q = g.previewGeta(tableTop(9, 9))!;
    expect(q.x).toBeCloseTo(GETA_RANGE.maxX);
    expect(q.z).toBeCloseTo(GETA_RANGE.maxZ);
  });

  it('ほかの台（サラダ台・湯煎器の台）には置けない。置けない場所に右クリックしても、持ち上げたまま', () => {
    const g = newGame();
    g.rightClick(stack);
    expect(g.previewGeta(tableTop(0, 0, 'salad'))).toMatchObject({ valid: false, reason: 'surface' });
    g.rightClick(tableTop(0, 0, 'salad'));
    expect(g.state.getaMoving).toBe(true);
    expect(g.state.getaSpot).toEqual(GETA_HOME);
  });

  it('台以外に右クリックすると、置き直しをやめる（もとの場所のまま）', () => {
    const g = newGame();
    g.rightClick(stack);
    g.rightClick({ kind: 'noodleRack' });
    expect(g.state.getaMoving).toBe(false);
    expect(g.state.getaSpot).toEqual(GETA_HOME);
  });

  it('持ち上げていないとき、置く前の見せ方は出ない', () => {
    const g = newGame();
    expect(g.previewGeta(tableTop(GETA_HOME.x, GETA_HOME.z))).toBeNull();
  });

  it('ボトルの近くには置けない', () => {
    const g = newGame();
    g.state.bottles.parsley = { surface: 'left', x: GETA_HOME.x, z: GETA_HOME.z };
    g.rightClick(stack);
    expect(g.previewGeta(tableTop(GETA_HOME.x, GETA_HOME.z))).toMatchObject({ valid: false, reason: 'gap' });
  });

  it('置き直した位置は、練習・ゲームを始め直しても残る。持ち上げた状態は残らない', () => {
    const g = newGame();
    g.rightClick(stack);
    const z = GETA_RANGE.maxZ - 0.1;
    g.rightClick(tableTop(GETA_HOME.x, z));
    g.rightClick(stack);
    g.startPractice();
    expect(g.state.getaSpot).toEqual({ surface: 'left', x: GETA_HOME.x, z });
    expect(g.state.getaMoving).toBe(false);
  });
});

describe('下駄の山の上にはボトル・容器を置けない', () => {
  it('山のある場所にはボトルを置けない。持ち上げている間は置ける', () => {
    const g = newGame();
    g.state.bottles.parsley = null;
    g.state.hand = { kind: 'bottle', id: 'parsley' };
    const at = tableTop(GETA_HOME.x, GETA_HOME.z);
    expect(g.previewBottle(at)).toMatchObject({ valid: false, reason: 'gap' });
    expect(g.planInteract(at)).toBeNull();
    g.state.getaMoving = true;
    expect(g.previewBottle(at)?.valid).toBe(true);
  });

  it('山のある場所には、ガーリック・唐辛子の容器も置けない', () => {
    const g = newGame();
    g.state.trays.garlic = 'hand';
    g.state.hand = { kind: 'tray', id: 'garlic' };
    expect(g.previewFreeTray(tableTop(GETA_HOME.x, GETA_HOME.z))).toMatchObject({ valid: false, reason: 'gap' });
  });
});

describe('案内（HUD）', () => {
  it('山に視点が合っているときの案内が、手の中身で変わる', () => {
    const g = newGame();
    expect(g.getaHint(stack)).toContain('下駄を取る');
    g.state.hand = { kind: 'geta' };
    expect(g.getaHint(stack)).toContain('戻す');
    g.state.hand = { kind: 'bakeDish', style: 'doria', baked: true };
    expect(g.getaHint(stack)).toContain('下駄に乗せる');
    g.state.hand = null;
    expect(g.getaHint({ kind: 'noodleRack' })).toBeNull();
  });

  it('出口に下駄を持って視点を合わせたとき、乗せられるかが分かる', () => {
    const g = newGame();
    g.interact(stack);
    expect(g.ovenHint(outlet)).toContain('まだ出てきていない');
    g.state.hand = null;
    bakeDoria(g);
    g.interact(stack);
    expect(g.ovenHint(outlet)).toContain('下駄に乗せる');
  });
});
