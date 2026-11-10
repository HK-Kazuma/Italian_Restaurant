import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { OVEN_COUNTER, OVEN_COUNTER_ZS, PIZZA_COUNTER, PIZZA_PLATE_STACK, PROP_RANGE, PROP_RANGE_PREP, SURFACES } from './layout';
import { bakeItem, frontS } from './oven';
import { MOZZ_TOTAL, addTopping, canAddTopping, emptyPan, isBuffalo, mozzSpots, pizzaName, pizzaOf, whyNotTopping } from './pizza';
import type { PizzaBuild, Target } from './types';

const doughStack: Target = { kind: 'pizzaDoughStack' };
const panStack: Target = { kind: 'pizzaPanStack' };
const sauce: Target = { kind: 'pizzaSource', id: 'sauce' };
const cheese: Target = { kind: 'pizzaSource', id: 'cheese' };
const mozz: Target = { kind: 'pizzaSource', id: 'mozzarella' };
const slot = (index = 0): Target => ({ kind: 'pizzaSlot', index });
const plateStack: Target = { kind: 'pizzaPlateStack' };
const panPile: Target = { kind: 'panPile' };
const tableTop = (x: number, z: number, surface: 'left' | 'salad' | 'hotWater' | 'prep' = 'left'): Target => ({ kind: 'tableTop', surface, x, z });
const emptyPanItem = () => bakeItem('pizza', 0, cfg, emptyPan()); // 鉄板（スタックから取った物も、使い終わった物も同じ）
const PREP_FREE = { x: 0, z: 1.2 }; // 作業台（具材台）の、何も置いていない3台目の天板の上（作業台の中心からの相対）
const PLATE_AT = { x: 0.25, z: 1.95 }; // お皿を置ける、左の台のあき地
const PILE_AT = { x: -0.3, z: 1.2 }; // 鉄板の山を置ける場所
const upperInlet: Target = { kind: 'ovenInlet', deck: 'upper', x: 0, s: frontS('pizza') };
const lowerInlet: Target = { kind: 'ovenInlet', deck: 'lower', x: 0, s: frontS('pizza') };
const upperOutlet: Target = { kind: 'ovenOutlet', deck: 'upper', lane: 1 };
const lowerOutlet: Target = { kind: 'ovenOutlet', deck: 'lower', lane: 1 };

const newGame = () => {
  const g = new Game(cfg, () => 0);
  g.startPractice();
  g.state.nextTicketAt = Infinity;
  return g;
};

// 鉄板に生地をのせて、組み立て台（slot）に置く
const setPan = (g: Game, index = 0) => {
  g.interact(doughStack);
  g.interact(panStack);
  g.interact(slot(index));
};

// 具を1つ取って、組み立て台の鉄板にのせる
const add = (g: Game, source: Target, index = 0) => {
  g.interact(source);
  g.interact(slot(index));
};

// ピザのお皿を1枚取って、台に置く。置いたお皿の対象を返す
const putPlate = (g: Game, at = PLATE_AT): Target => {
  g.interact(plateStack);
  g.interact(tableTop(at.x, at.z));
  const plate = g.state.pizzaPlates[g.state.pizzaPlates.length - 1];
  return { kind: 'pizzaPlate', id: plate.id };
};

// バッファローピザを組み立てて、手に持つ
const makeBuffalo = (g: Game, index = 0) => {
  setPan(g, index);
  add(g, sauce, index);
  add(g, cheese, index);
  add(g, mozz, index);
  add(g, mozz, index);
  g.interact(slot(index));
};

describe('ピザの具のルール（pizza.ts）', () => {
  it('生地 → ソース → チーズ → モッツァレラ の順にだけ、のせられる', () => {
    const p = emptyPan();
    expect(whyNotTopping(p, 'sauce')).toContain('生地');
    const d: PizzaBuild = { ...p, dough: true };
    expect(canAddTopping(d, 'sauce')).toBe(true);
    expect(whyNotTopping(d, 'cheese')).toContain('ソース');
    const s = addTopping(d, 'sauce');
    expect(canAddTopping(s, 'sauce')).toBe(false); // ソースは1杯だけ
    expect(whyNotTopping(s, 'mozzarella')).toContain('チーズ');
    const c = addTopping(s, 'cheese');
    expect(canAddTopping(c, 'cheese')).toBe(false);
    expect(canAddTopping(c, 'mozzarella')).toBe(true);
  });

  it('モッツァレラは1個で3つ分。2個で6つになり、それ以上はのせられない', () => {
    let p: PizzaBuild = { dough: true, sauce: true, cheese: true, mozz: 0 };
    p = addTopping(p, 'mozzarella');
    expect(p.mozz).toBe(3);
    expect(isBuffalo(p)).toBe(false);
    p = addTopping(p, 'mozzarella');
    expect(p.mozz).toBe(MOZZ_TOTAL);
    expect(isBuffalo(p)).toBe(true);
    expect(canAddTopping(p, 'mozzarella')).toBe(false);
    expect(addTopping(p, 'mozzarella')).toBe(p);
  });

  it('モッツァレラは円周の6か所に等間隔。1個目は1つおき、2個目がそのあいだを埋める', () => {
    expect(mozzSpots(0)).toEqual([]);
    expect(mozzSpots(3)).toEqual([0, 2, 4]);
    expect(mozzSpots(6).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mozzSpots(99)).toHaveLength(6);
  });

  it('具をのせても、元のデータは書き換わらない', () => {
    const p: PizzaBuild = { dough: true, sauce: false, cheese: false, mozz: 0 };
    addTopping(p, 'sauce');
    expect(p.sauce).toBe(false);
  });

  it('名前：のっている物で変わる。そろうとバッファローピザ', () => {
    expect(pizzaName(emptyPan())).toBe('ピザの鉄板');
    expect(pizzaName({ dough: true, sauce: false, cheese: false, mozz: 0 })).toBe('ピザ生地');
    expect(pizzaName({ dough: true, sauce: true, cheese: true, mozz: 3 })).toContain('3/6');
    expect(pizzaName({ dough: true, sauce: true, cheese: true, mozz: 6 })).toBe('バッファローピザ');
  });

  it('pizza を持たない焼き皿は、生地・ソース・チーズがのった見た目（モッツァレラなし）', () => {
    const p = pizzaOf(bakeItem('pizza', 0, cfg));
    expect(p).toEqual({ dough: true, sauce: true, cheese: true, mozz: 0 });
    expect(isBuffalo(p)).toBe(false);
  });
});

describe('置き場（layout.ts）', () => {
  it('ソース（正方形）・チーズ（長方形。z 方向に長い）の容器の形', () => {
    expect(PIZZA_COUNTER.sauce.w).toBe(PIZZA_COUNTER.sauce.d);
    expect(PIZZA_COUNTER.cheese.d).toBeGreaterThan(PIZZA_COUNTER.cheese.w);
  });

  it('置き物は、具材台の天板の内側に収まり、重ならない', () => {
    const halfW = OVEN_COUNTER.width / 2;
    const halfD = OVEN_COUNTER.depth / 2;
    type Box = { name: string; x: number; z: number; hx: number; hz: number };
    const boxes: Box[] = [
      { name: 'sauce', x: PIZZA_COUNTER.sauce.xr, z: PIZZA_COUNTER.sauce.zr, hx: PIZZA_COUNTER.sauce.w / 2, hz: PIZZA_COUNTER.sauce.d / 2 },
      { name: 'cheese', x: PIZZA_COUNTER.cheese.xr, z: PIZZA_COUNTER.cheese.zr, hx: PIZZA_COUNTER.cheese.w / 2, hz: PIZZA_COUNTER.cheese.d / 2 },
      { name: 'mozz', x: PIZZA_COUNTER.mozz.xr, z: PIZZA_COUNTER.mozz.zr, hx: PIZZA_COUNTER.mozz.w / 2, hz: PIZZA_COUNTER.mozz.d / 2 },
      ...PIZZA_COUNTER.slots.map((s, i) => ({ name: `slot${i}`, x: s.xr, z: s.zr, hx: PIZZA_COUNTER.slotR, hz: PIZZA_COUNTER.slotR })),
      { name: 'dough', x: PIZZA_COUNTER.doughStack.xr, z: PIZZA_COUNTER.doughStack.zr, hx: 0.215, hz: 0.215 },
      { name: 'pan', x: PIZZA_COUNTER.panStack.xr, z: PIZZA_COUNTER.panStack.zr, hx: 0.25, hz: 0.25 },
    ];
    for (const b of boxes) {
      expect(b.x - b.hx, b.name).toBeGreaterThanOrEqual(-halfW - 1e-6);
      expect(b.x + b.hx, b.name).toBeLessThanOrEqual(halfW + 1e-6);
      expect(b.z - b.hz, b.name).toBeGreaterThanOrEqual(-halfD - 1e-6);
      expect(b.z + b.hz, b.name).toBeLessThanOrEqual(halfD + 1e-6);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = Math.abs(a.x - b.x) < a.hx + b.hx - 1e-6 && Math.abs(a.z - b.z) < a.hz + b.hz - 1e-6;
        expect(overlap, `${a.name} と ${b.name}`).toBe(false);
      }
    }
    expect(OVEN_COUNTER_ZS[PIZZA_COUNTER.counter]).toBeDefined();
  });
});

describe('ピザを組み立てる（Game）', () => {
  it('生地のスタックから生地を取り、鉄板のスタックの上にセットすると、生地をのせた鉄板になる', () => {
    const g = newGame();
    g.interact(doughStack);
    expect(g.state.hand).toEqual({ kind: 'pizzaDough' });
    g.interact(panStack);
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'pizza', state: 'raw', pizza: { dough: true, sauce: false, cheese: false, mozz: 0 } });
  });

  it('先に鉄板を取って、生地のスタックにクリックしても、生地がのる', () => {
    const g = newGame();
    g.interact(panStack);
    expect(g.state.hand).toMatchObject({ pizza: { dough: false } });
    g.interact(doughStack);
    expect(g.state.hand).toMatchObject({ pizza: { dough: true } });
  });

  it('組み立て台に鉄板を置くと、置ける。置いた鉄板は持ち上げられる', () => {
    const g = newGame();
    g.interact(panStack);
    g.interact(slot(1));
    expect(g.state.hand).toBeNull();
    expect(g.state.pizzaSlots[1]).toMatchObject({ style: 'pizza' });
    expect(g.state.pizzaSlots[0]).toBeNull();
    g.interact(slot(1));
    expect(g.state.hand).toMatchObject({ style: 'pizza' });
    expect(g.state.pizzaSlots[1]).toBeNull();
  });

  it('使用中の組み立て台には、別の鉄板を置けない', () => {
    const g = newGame();
    setPan(g);
    g.interact(panStack);
    expect(g.planInteract(slot(0))).toBeNull();
  });

  it('ソース → チーズ → モッツァレラ2個（6つ）の順にのせると、バッファローピザ。具は1つ取るごとに手がふさがる', () => {
    const g = newGame();
    setPan(g);
    g.interact(sauce);
    expect(g.state.hand).toEqual({ kind: 'pizzaTopping', id: 'sauce' });
    expect(g.planInteract(panStack)).toBeNull(); // 手がふさがっている
    g.interact(slot());
    expect(g.state.hand).toBeNull();
    expect(g.state.pizzaSlots[0]?.pizza).toEqual({ dough: true, sauce: true, cheese: false, mozz: 0 });
    add(g, cheese);
    add(g, mozz);
    expect(g.state.pizzaSlots[0]?.pizza?.mozz).toBe(3);
    add(g, mozz);
    expect(g.state.pizzaSlots[0]?.pizza).toEqual({ dough: true, sauce: true, cheese: true, mozz: 6 });
    expect(pizzaName(g.state.pizzaSlots[0]!.pizza!)).toBe('バッファローピザ');
  });

  it('順番を飛ばしてはのせられない（チーズが先、ソースが2回、モッツァレラが3個目）', () => {
    const g = newGame();
    setPan(g);
    g.interact(cheese);
    expect(g.planInteract(slot())).toBeNull();
    expect(g.pizzaHint(slot())).toContain('ソース');
    g.interact(cheese); // 同じ物を持っていれば、容器に戻せる
    expect(g.state.hand).toBeNull();
    add(g, sauce);
    g.interact(sauce);
    expect(g.planInteract(slot())).toBeNull(); // ソースは1杯だけ
    g.interact(sauce);
    add(g, cheese);
    add(g, mozz);
    add(g, mozz);
    g.interact(mozz);
    expect(g.planInteract(slot())).toBeNull(); // もう6つのっている
  });

  it('生地がのっていない鉄板には、具をのせられない。あとから生地を持ってきてのせられる', () => {
    const g = newGame();
    g.interact(panStack);
    g.interact(slot());
    g.interact(sauce);
    expect(g.planInteract(slot())).toBeNull();
    g.interact(sauce); // 戻す
    g.interact(doughStack);
    g.interact(slot());
    expect(g.state.pizzaSlots[0]?.pizza?.dough).toBe(true);
    expect(g.state.hand).toBeNull();
  });

  it('組み立て台の鉄板を持ち上げて、オーブンの上段に流すと、焼き上がる（バッファローピザ）', () => {
    const g = newGame();
    makeBuffalo(g);
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'pizza', state: 'raw', pizza: { mozz: 6 } });
    expect(g.planInteract(upperInlet)).not.toBeNull();
    g.interact(upperInlet);
    expect(g.state.oven.decks.upper[0].pizza).toEqual({ dough: true, sauce: true, cheese: true, mozz: 6 });
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.interact(upperOutlet);
    expect(g.state.hand).toMatchObject({ style: 'pizza', state: 'baked', pizza: { dough: true, sauce: true, cheese: true, mozz: 6 } });
  });

  it('下段に流すと焦げて、提供できない', () => {
    const g = newGame();
    makeBuffalo(g);
    g.interact(lowerInlet);
    for (let t = 0; t < cfg.ovenLowerTime + 1; t++) g.update(1);
    g.interact(lowerOutlet);
    expect(g.state.hand).toMatchObject({ style: 'pizza', state: 'burnt' });
    expect(g.planInteract({ kind: 'servePass' })).toBeNull();
    expect(g.getaHint({ kind: 'servePass' })).toContain('焦げて');
  });

  it('焼き上がったバッファローピザは、お皿に入れてから、提供台に出せる（ピザのメニューがないので採点なし）', () => {
    const g = newGame();
    const plate = putPlate(g);
    makeBuffalo(g);
    g.interact(upperInlet);
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.interact(upperOutlet);
    expect(g.planInteract({ kind: 'servePass' })).toBeNull(); // 鉄板に乗ったままでは出せない
    expect(g.getaHint({ kind: 'servePass' })).toContain('お皿');
    g.interact(plate); // お皿に入れる
    g.interact(plate); // 手に鉄板があるので、お皿は持ち上げられない
    expect(g.state.hand).toEqual(emptyPanItem());
    g.interact(tableTop(-0.3, 1.2)); // 鉄板を台に置く
    g.interact(plate); // お皿を持ち上げる
    expect(g.state.hand).toMatchObject({ kind: 'pizzaPlate', dish: { state: 'baked', pizza: { mozz: 6 } } });
    const before = { score: g.state.score, mistakes: g.state.mistakes };
    expect(g.planInteract({ kind: 'servePass' })).not.toBeNull();
    g.interact({ kind: 'servePass' });
    expect(g.state.hand).toBeNull();
    expect(g.state.score).toBe(before.score);
    expect(g.state.mistakes).toBe(before.mistakes);
  });

  it('モッツァレラが足りないピザは、焼けてお皿に入れても、提供できない', () => {
    const g = newGame();
    const plate = putPlate(g);
    setPan(g);
    add(g, sauce);
    add(g, cheese);
    add(g, mozz); // 3つだけ
    g.interact(slot());
    g.interact(upperInlet);
    for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
    g.interact(upperOutlet);
    expect(g.state.hand).toMatchObject({ state: 'baked' });
    g.interact(plate);
    g.interact(tableTop(-0.3, 1.2));
    g.interact(plate);
    expect(g.state.hand).toMatchObject({ kind: 'pizzaPlate' });
    expect(g.planInteract({ kind: 'servePass' })).toBeNull();
    expect(g.getaHint({ kind: 'servePass' })).toContain('そろっていない');
  });

  it('生地のない鉄板は、オーブンに流せない', () => {
    const g = newGame();
    g.interact(panStack);
    expect(g.planInteract(upperInlet)).toBeNull();
    expect(g.previewOven(upperInlet)).toBeNull();
    expect(g.ovenHint(upperInlet)).toContain('生地');
  });

  it('具材台のテスト用の焼き皿（ピザ系）は、これまでどおり流せる', () => {
    const g = newGame();
    g.interact({ kind: 'ovenStock', style: 'pizza' });
    expect(g.planInteract(upperInlet)).not.toBeNull();
  });

  it('組み立て台の鉄板は、練習・ゲームを始め直すと空に戻る', () => {
    const g = newGame();
    setPan(g);
    g.startPractice();
    expect(g.state.pizzaSlots).toEqual([null, null]);
  });
});

describe('案内（HUD）', () => {
  it('材料・鉄板・組み立て台に視点を合わせたときの案内', () => {
    const g = newGame();
    expect(g.pizzaHint(doughStack)).toContain('ピザ生地を取る');
    expect(g.pizzaHint(panStack)).toContain('鉄板を取る');
    expect(g.pizzaHint(sauce)).toContain('ピザソース');
    expect(g.pizzaHint(mozz)).toContain('1個');
    expect(g.pizzaHint(slot())).toContain('空き');
    expect(g.pizzaHint({ kind: 'noodleRack' })).toBeNull();
    setPan(g);
    expect(g.pizzaHint(slot())).toContain('持ち上げる');
    g.interact(sauce);
    expect(g.pizzaHint(slot())).toContain('塗る');
    g.interact(sauce);
    g.interact(mozz);
    expect(g.pizzaHint(slot())).toContain('のせられない');
  });
});

// 焼き上がったピザを手に持つ（組み立て → 上段 → 出口）
const bakedPizza = (g: Game) => {
  makeBuffalo(g);
  g.interact(upperInlet);
  for (let t = 0; t < cfg.ovenUpperTime + 1; t++) g.update(1);
  g.interact(upperOutlet);
};

describe('鉄板のスタック（1山10枚。取ると減る）', () => {
  it('最初は10枚。取ると1枚ずつ減り、戻すと増える', () => {
    const g = newGame();
    expect(g.state.pizzaPanStock).toBe(cfg.pizzaPanCount);
    expect(cfg.pizzaPanCount).toBe(10);
    g.interact(panStack);
    expect(g.state.pizzaPanStock).toBe(9);
    g.interact(panStack); // 持っている鉄板を戻す
    expect(g.state.pizzaPanStock).toBe(10);
    expect(g.state.hand).toBeNull();
  });

  it('生地を持って鉄板のスタックをクリックしても、1枚減る', () => {
    const g = newGame();
    g.interact(doughStack);
    g.interact(panStack);
    expect(g.state.pizzaPanStock).toBe(9);
  });

  it('0枚になると、鉄板は取れない', () => {
    const g = newGame();
    g.state.pizzaPanStock = 0;
    expect(g.planInteract(panStack)).toBeNull();
    expect(g.pizzaHint(panStack)).toContain('鉄板がない');
    g.interact(doughStack);
    expect(g.planInteract(panStack)).toBeNull();
  });

  it('鉄板を捨てると、焼く前ならスタックに戻り、焼いたあとなら鉄板が手に残る（それを捨てると、スタックに戻る）', () => {
    const g = newGame();
    g.interact(panStack);
    g.discard();
    expect(g.state.hand).toBeNull();
    expect(g.state.pizzaPanStock).toBe(10);
    bakedPizza(g);
    expect(g.state.pizzaPanStock).toBe(9);
    g.discard();
    expect(g.state.hand).toEqual(emptyPanItem());
    expect(g.state.pizzaPanStock).toBe(9);
    g.discard();
    expect(g.state.hand).toBeNull();
    expect(g.state.pizzaPanStock).toBe(10);
  });
});

describe('ピザのお皿', () => {
  it('提供台の左のお皿の山から1枚取れる（なくならない）。空のお皿は山に戻せる', () => {
    const g = newGame();
    g.interact(plateStack);
    expect(g.state.hand).toEqual({ kind: 'pizzaPlate' });
    g.interact(plateStack);
    expect(g.state.hand).toBeNull();
    g.interact(plateStack);
    expect(g.state.hand).toEqual({ kind: 'pizzaPlate' });
  });

  it('お皿は、台のあき地のどこにでも置ける。置く前の見せ方が出る', () => {
    const g = newGame();
    g.interact(plateStack);
    const p = g.previewProp(tableTop(PLATE_AT.x, PLATE_AT.z))!;
    expect(p).toMatchObject({ what: 'plate', valid: true, surface: 'left' });
    expect(g.pizzaHint(tableTop(PLATE_AT.x, PLATE_AT.z))).toContain('ここに置く');
    g.interact(tableTop(PLATE_AT.x, PLATE_AT.z));
    expect(g.state.hand).toBeNull();
    expect(g.state.pizzaPlates).toHaveLength(1);
    expect(g.state.pizzaPlates[0]).toMatchObject({ spot: { surface: 'left', x: PLATE_AT.x, z: PLATE_AT.z }, dish: null });
  });

  it('狙いが範囲の外にずれても、置ける範囲に収まる。ほかの台や、ほかの物に近すぎる場所には置けない', () => {
    const g = newGame();
    g.interact(plateStack);
    const far = g.previewProp(tableTop(9, 9))!;
    expect(far.x).toBeCloseTo(PROP_RANGE.maxX);
    expect(far.z).toBeCloseTo(PROP_RANGE.maxZ);
    expect(g.previewProp(tableTop(0, 0, 'salad'))).toMatchObject({ valid: false, reason: 'surface' });
    expect(g.planInteract(tableTop(0, 0, 'salad'))).toBeNull();
    // お皿の山のすぐ横
    expect(g.previewProp(tableTop(PIZZA_PLATE_STACK.x + 0.1, PIZZA_PLATE_STACK.z))).toMatchObject({ valid: false, reason: 'gap' });
    // 下駄の山の上
    expect(g.previewProp(tableTop(0.2, 1.2))).toMatchObject({ valid: false, reason: 'gap' });
    // 置いたお皿に重なる
    g.interact(tableTop(PLATE_AT.x, PLATE_AT.z));
    g.interact(plateStack);
    expect(g.previewProp(tableTop(PLATE_AT.x, PLATE_AT.z + 0.2))).toMatchObject({ valid: false, reason: 'gap' });
  });

  it('焼き上がったピザを持ってお皿に左クリックすると、ピザがお皿に入って、鉄板だけが手に残る', () => {
    const g = newGame();
    const plate = putPlate(g);
    bakedPizza(g);
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'pizza', state: 'baked' });
    expect(g.pizzaHint(plate)).toContain('お皿に入れる');
    g.interact(plate);
    expect(g.state.hand).toEqual(emptyPanItem());
    expect(g.state.pizzaPlates[0].dish).toMatchObject({ state: 'baked', pizza: { dough: true, mozz: 6 } });
    expect(g.pizzaHint(plate)).toContain('もうピザが入っている'); // 鉄板を持っているときは、お皿にはもう入れられない
  });

  it('焼く前・焦げたピザや、もうピザが入っているお皿には入れられない', () => {
    const g = newGame();
    const plate = putPlate(g);
    g.interact(panStack);
    expect(g.planInteract(plate)).toBeNull(); // 焼く前
    g.state.hand = bakeItem('pizza', cfg.ovenLowerTime, cfg, { dough: true, sauce: true, cheese: true, mozz: 6 });
    expect(g.planInteract(plate)).toBeNull(); // 焦げた
    expect(g.pizzaHint(plate)).toContain('焦げ');
    g.state.hand = bakeItem('pizza', cfg.ovenUpperTime, cfg);
    expect(g.planInteract(plate)).not.toBeNull();
    g.interact(plate);
    g.state.hand = bakeItem('pizza', cfg.ovenUpperTime, cfg);
    expect(g.planInteract(plate)).toBeNull(); // もう入っている
  });

  it('台の上のお皿は、手が空なら持ち上げられる（ピザが入っていれば、そのまま）。置き直せる', () => {
    const g = newGame();
    const plate = putPlate(g);
    g.interact(plate);
    expect(g.state.hand).toEqual({ kind: 'pizzaPlate' });
    expect(g.state.pizzaPlates).toHaveLength(0);
    g.interact(tableTop(0.1, 2.1));
    expect(g.state.pizzaPlates).toHaveLength(1);
  });

  it('空のお皿は提供できない', () => {
    const g = newGame();
    g.interact(plateStack);
    expect(g.planInteract({ kind: 'servePass' })).toBeNull();
    expect(g.getaHint({ kind: 'servePass' })).toContain('入っていない');
  });

  it('お皿の上にはボトル・容器・下駄を置けない', () => {
    const g = newGame();
    putPlate(g);
    g.state.bottles.parsley = null;
    g.state.hand = { kind: 'bottle', id: 'parsley' };
    expect(g.previewBottle(tableTop(PLATE_AT.x, PLATE_AT.z))).toMatchObject({ valid: false, reason: 'gap' });
    g.state.hand = null;
    g.state.trays.garlic = 'hand';
    g.state.hand = { kind: 'tray', id: 'garlic' };
    expect(g.previewFreeTray(tableTop(PLATE_AT.x, PLATE_AT.z))).toMatchObject({ valid: false, reason: 'gap' });
    g.state.hand = null;
    g.state.getaMoving = true;
    expect(g.previewGeta(tableTop(PLATE_AT.x, PLATE_AT.z))).toMatchObject({ valid: false, reason: 'gap' });
  });

  it('練習・ゲームを始め直すと、お皿・鉄板の山・スタックの枚数は最初に戻る', () => {
    const g = newGame();
    putPlate(g);
    g.state.pizzaPanStock = 3;
    g.state.panPile = { spot: { surface: 'left', ...PILE_AT }, count: 4 };
    g.startPractice();
    expect(g.state.pizzaPlates).toEqual([]);
    expect(g.state.panPile).toBeNull();
    expect(g.state.pizzaPanStock).toBe(10);
  });
});

describe('鉄板を積む・持ち上げる・戻す', () => {
  it('台のあき地に置くと山ができ、そこに左クリックで積める（山は1つだけ）', () => {
    const g = newGame();
    g.state.hand = emptyPanItem();
    g.interact(tableTop(PILE_AT.x, PILE_AT.z));
    expect(g.state.panPile).toEqual({ spot: { surface: 'left', x: PILE_AT.x, z: PILE_AT.z }, count: 1 });
    expect(g.state.hand).toBeNull();

    g.state.hand = emptyPanItem();
    expect(g.previewProp(tableTop(0.25, 2.2))).toMatchObject({ valid: false, reason: 'pile' }); // 別の場所には、2つ目の山は作れない
    expect(g.planInteract(tableTop(0.25, 2.2))).toBeNull();
    expect(g.pizzaHint(tableTop(0.25, 2.2))).toContain('山がもうある');
    expect(g.pizzaHint(panPile)).toContain('積む');
    g.interact(panPile);
    expect(g.state.panPile?.count).toBe(2);
    expect(g.state.hand).toBeNull();
  });

  it('山は10枚まで積める', () => {
    const g = newGame();
    g.state.panPile = { spot: { surface: 'left', ...PILE_AT }, count: cfg.pizzaPanCount };
    g.state.hand = emptyPanItem();
    expect(g.planInteract(panPile)).toBeNull();
  });

  it('山に右クリックすると、山ごと持てる。持っていると、台に置き直せる', () => {
    const g = newGame();
    g.state.panPile = { spot: { surface: 'left', ...PILE_AT }, count: 3 };
    expect(g.pizzaHint(panPile)).toContain('右クリック');
    g.rightClick(panPile);
    expect(g.state.hand).toEqual({ kind: 'panPile', count: 3 });
    expect(g.state.panPile).toBeNull();
    expect(g.previewProp(tableTop(0.25, 2.2))).toMatchObject({ what: 'panPile', valid: true });
    g.interact(tableTop(0.25, 2.2));
    expect(g.state.panPile).toEqual({ spot: { surface: 'left', x: 0.25, z: 2.2 }, count: 3 });
    expect(g.state.hand).toBeNull();
  });

  it('手に物を持っているときは、山を持ち上げられない。持っている山は捨てられない', () => {
    const g = newGame();
    g.state.panPile = { spot: { surface: 'left', ...PILE_AT }, count: 3 };
    g.interact({ kind: 'noodleRack' });
    g.rightClick(panPile);
    expect(g.state.panPile?.count).toBe(3);
    g.state.hand = { kind: 'panPile', count: 2 };
    g.discard();
    expect(g.state.hand).toEqual({ kind: 'panPile', count: 2 });
  });

  it('持ち上げた山は、鉄板のスタックに戻して再利用できる（空きがあるぶんだけ。入りきらない分は手に残る）', () => {
    const g = newGame();
    g.state.hand = { kind: 'panPile', count: 4 };
    expect(g.planInteract(panStack)).toBeNull(); // スタックはいっぱい（10枚）
    expect(g.pizzaHint(panStack)).toContain('いっぱい');
    g.state.pizzaPanStock = 0;
    expect(g.pizzaHint(panStack)).toContain('再利用');
    g.interact(panStack);
    expect(g.state.pizzaPanStock).toBe(4);
    expect(g.state.hand).toBeNull();
    g.interact(panStack); // また取れる
    expect(g.state.pizzaPanStock).toBe(3);
    g.state.pizzaPanStock = 8;
    g.state.hand = { kind: 'panPile', count: 4 };
    g.interact(panStack);
    expect(g.state.pizzaPanStock).toBe(10);
    expect(g.state.hand).toEqual({ kind: 'panPile', count: 2 }); // 入りきらなかった2枚
  });

  it('ピザを作って焼いてお皿に入れ、鉄板を積み、10枚使い切ってからも、鉄板を戻せば作り続けられる', () => {
    const g = newGame();
    g.state.pizzaPanStock = 1; // あと1枚
    const plate = putPlate(g);
    bakedPizza(g);
    expect(g.state.pizzaPanStock).toBe(0);
    g.interact(plate);
    g.interact(tableTop(PILE_AT.x, PILE_AT.z)); // 使い終わった鉄板を置く
    expect(g.state.panPile?.count).toBe(1);
    g.interact(panStack);
    expect(g.state.hand).toBeNull(); // 0枚なので取れない
    g.rightClick(panPile);
    g.interact(panStack);
    expect(g.state.pizzaPanStock).toBe(1);
    g.interact(panStack);
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'pizza' });
  });
});

describe('鉄板は、使う前も使い終わったあとも同じ物', () => {
  it('ピザをお皿に移した鉄板は、スタックから取った鉄板と同じ。そのまま組み立て台に置いて、次のピザに使える', () => {
    const g = newGame();
    const plate = putPlate(g);
    bakedPizza(g);
    g.interact(plate);
    const reused = g.state.hand;
    expect(reused).toEqual(emptyPanItem());
    g.interact(panStack); // スタックに戻すと、取ったときと同じ枚数に戻る
    expect(g.state.pizzaPanStock).toBe(10);
    g.interact(panStack);
    expect(g.state.hand).toEqual(reused); // スタックから取った鉄板と、まったく同じ
    g.interact(slot(1)); // そのまま組み立て台に置ける
    expect(g.state.pizzaSlots[1]).toEqual(reused);
  });

  it('ピザをお皿に移した鉄板に、そのまま生地をのせられる', () => {
    const g = newGame();
    const plate = putPlate(g);
    bakedPizza(g);
    g.interact(plate);
    g.interact(doughStack); // 鉄板を持ったまま、生地のスタックをクリック
    expect(g.state.hand).toMatchObject({ kind: 'bakeDish', style: 'pizza', pizza: { dough: true } });
  });
});

describe('作業台（具材台の天板）にも置ける', () => {
  it('作業台は、置ける面として扱われる（3台ぶんの大きさ）', () => {
    expect(SURFACES.prep.width).toBeCloseTo(OVEN_COUNTER.width);
    expect(SURFACES.prep.depth).toBeCloseTo(OVEN_COUNTER.depth * 3);
  });

  it('持ち上げた鉄板の山を、作業台の何も置いていないところに置ける（置く前の見せ方も出る）', () => {
    const g = newGame();
    g.state.panPile = { spot: { surface: 'left', ...PILE_AT }, count: 3 };
    g.rightClick(panPile);
    const at = tableTop(PREP_FREE.x, PREP_FREE.z, 'prep');
    expect(g.previewProp(at)).toMatchObject({ what: 'panPile', surface: 'prep', valid: true });
    expect(g.pizzaHint(at)).toContain('鉄板の山をここに置く');
    g.interact(at);
    expect(g.state.hand).toBeNull();
    expect(g.state.panPile).toEqual({ spot: { surface: 'prep', x: PREP_FREE.x, z: PREP_FREE.z }, count: 3 });
  });

  it('作業台に置いた山も、右クリックで持ち上げて、左の台に置き直せる', () => {
    const g = newGame();
    g.state.panPile = { spot: { surface: 'prep', ...PREP_FREE }, count: 2 };
    g.rightClick(panPile);
    expect(g.state.hand).toEqual({ kind: 'panPile', count: 2 });
    g.interact(tableTop(PILE_AT.x, PILE_AT.z));
    expect(g.state.panPile?.spot.surface).toBe('left');
  });

  it('お皿・鉄板も、作業台に置ける。置く位置は天板の内側に収まる', () => {
    const g = newGame();
    g.interact(plateStack);
    const far = g.previewProp(tableTop(9, 9, 'prep'))!;
    expect(far.x).toBeCloseTo(PROP_RANGE_PREP.maxX);
    expect(far.z).toBeCloseTo(PROP_RANGE_PREP.maxZ);
    expect(far.valid).toBe(true);
    g.interact(tableTop(PREP_FREE.x, PREP_FREE.z, 'prep'));
    expect(g.state.pizzaPlates[0].spot.surface).toBe('prep');
    g.interact(panStack);
    expect(g.previewProp(tableTop(PREP_FREE.x, PREP_FREE.z + 0.2, 'prep'))).toMatchObject({ valid: false, reason: 'gap' }); // お皿に重なる
    g.interact(tableTop(-0.54, PREP_FREE.z, 'prep'));
    expect(g.state.panPile?.spot.surface).toBe('prep');
  });

  it('作業台にもとから置いてある物（容器・組み立て台・スタック・テスト用の皿の山）の上には置けない', () => {
    const g = newGame();
    g.state.hand = { kind: 'panPile', count: 2 };
    const fixtures: [string, number, number][] = [
      ['ソース', PIZZA_COUNTER.sauce.xr, PIZZA_COUNTER.sauce.zr],
      ['チーズ', PIZZA_COUNTER.cheese.xr, PIZZA_COUNTER.cheese.zr],
      ['モッツァレラ', PIZZA_COUNTER.mozz.xr, PIZZA_COUNTER.mozz.zr],
      ['組み立て台', PIZZA_COUNTER.slots[0].xr, PIZZA_COUNTER.slots[0].zr],
      ['鉄板のスタック', PIZZA_COUNTER.panStack.xr, PIZZA_COUNTER.panStack.zr],
      ['生地のスタック', PIZZA_COUNTER.doughStack.xr, PIZZA_COUNTER.doughStack.zr],
    ];
    for (const [name, x, z] of fixtures) {
      expect(g.previewProp(tableTop(x, z, 'prep')), name).toMatchObject({ valid: false, reason: 'gap' });
    }
  });

  it('サラダ台・湯煎器の台には、お皿も鉄板も置けない', () => {
    const g = newGame();
    g.state.hand = { kind: 'panPile', count: 2 };
    expect(g.previewProp(tableTop(0, 0, 'salad'))).toMatchObject({ valid: false, reason: 'surface' });
    expect(g.previewProp(tableTop(0, 0, 'hotWater'))).toMatchObject({ valid: false, reason: 'surface' });
    expect(g.pizzaHint(tableTop(0, 0, 'salad'))).toContain('作業台');
  });

  it('作業台には、ボトル・ガーリック・唐辛子の容器・下駄は置けない', () => {
    const g = newGame();
    const at = tableTop(PREP_FREE.x, PREP_FREE.z, 'prep');
    g.state.bottles.parsley = null;
    g.state.hand = { kind: 'bottle', id: 'parsley' };
    expect(g.previewBottle(at)).toMatchObject({ valid: false, reason: 'surface' });
    g.state.trays.garlic = 'hand';
    g.state.hand = { kind: 'tray', id: 'garlic' };
    expect(g.previewFreeTray(at)).toMatchObject({ valid: false, reason: 'surface' });
    g.state.hand = null;
    g.state.getaMoving = true;
    expect(g.previewGeta(at)).toMatchObject({ valid: false, reason: 'surface' });
  });
});
