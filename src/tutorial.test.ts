import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import { MENU } from './recipe';
import { hasTutorial, matchesTarget, tutorialSteps, type GuideAt } from './tutorial';
import type { Target, TrayId } from './types';

// --- 設備の指定（game.test.ts と同じ書き方）---
const rack: Target = { kind: 'noodleRack' };
const basket = (index: number): Target => ({ kind: 'boilerBasket', index });
const button = (index: number): Target => ({ kind: 'boilerButton', index });
const slot = (index: number): Target => ({ kind: 'plateSlot', index });
const saladSlot = (j: number): Target => ({ kind: 'plateSlot', index: cfg.plateSlotCount + j });
const potSlot = (index: number): Target => ({ kind: 'potSlot', index });
const burner = (index: number): Target => ({ kind: 'ihBurner', index });
const hotWater = (index: number): Target => ({ kind: 'hotWaterSlot', index });
const washer: Target = { kind: 'washer' };
const pass: Target = { kind: 'servePass' };
const plateStack: Target = { kind: 'plateStack' };
const smallStack: Target = { kind: 'plateStack', style: 'small' };
const bowlStack: Target = { kind: 'plateStack', style: 'bowl' };
const fridgeDoor: Target = { kind: 'fridgeDoor' };
const fridgeDoor2: Target = { kind: 'fridgeDoor', unit: 1 }; // 右側の冷蔵庫
const stock = (id: Extract<Target, { kind: 'stock' }>['id']): Target => ({ kind: 'stock', id });
const fridgeStock = (id: Extract<Target, { kind: 'stock' }>['id']): Target => ({ kind: 'stock', id, inFridge: true });
const bottle = (id: Extract<Target, { kind: 'bottle' }>['id']): Target => ({ kind: 'bottle', id });
const tray = (id: 'spinach' | 'saltOil'): Target => ({ kind: 'traySlot', id });
const fridgeTray = (id: TrayId): Target => ({ kind: 'fridgeTray', id });
// 小エビ・チキン・パンチェッタ・イカ・きのこのトレーとソテーソースのケースを置く、トッピングの置き場（spot 番目）
const topping = (spot: number): Target => ({ kind: 'traySlot', id: 'topping', spot });
const table = (x: number, z: number, surface: 'salad' | 'left'): Target => ({ kind: 'tableTop', surface, x, z });

// 台本の1手：左クリック / 右クリック / 時間を進める / 矢印が指さない場所への左クリック（ボトルを台に置くなど）
type Act = Target | { right: Target } | { wait: number } | { free: Target };

const mix = (): Act[] => Array.from({ length: cfg.mixClicks }, () => burner(0));
const wait = (seconds: number): Act => ({ wait: seconds });
const parsleyBack = table(-0.4, 0.95, 'left');
const pepperBack = table(-0.4, 1.45, 'left');
const saladBack = table(0.3, -0.5, 'salad');
// ガーリック・唐辛子の容器は、台の上のどこに置いてもよい（矢印は標準の場所を指す）
const fridgeBottle = (id: 'dressing' | 'paprika'): Target => ({ kind: 'fridgeBottle', id });
const bin = (id: 'garlic' | 'chili'): Target => ({ kind: 'tableTray', id });
const garlicHome = table(0.1, -0.15, 'salad');
const chiliHome = table(0.1, -0.6, 'salad');

// 洗い終わった鍋を、鍋置き場に戻す（最後の工程）
const returnPot = (): Act[] => [wait(cfg.potWashTime + 1), washer, potSlot(0)];

// 上手な人の手順。矢印はその手順どおりの場所を指し、最後に提供できて、チュートリアルが完了するはず。
const SCRIPTS: Record<string, Act[]> = {
  tarako: [
    rack, basket(0), button(0), plateStack, slot(0), wait(cfg.boilTime + 1),
    basket(0), slot(0), stock('tarakoSauce'), slot(0), stock('nori'), slot(0), slot(0), pass,
  ],
  meat: [
    rack, basket(0), button(0), { right: fridgeDoor }, potSlot(0), burner(0),
    fridgeStock('meatSauce'), burner(0), fridgeStock('meatSauce'), burner(0),
    plateStack, slot(0), wait(cfg.boilTime + 1),
    basket(0), burner(0), ...mix(), burner(0), slot(0), washer,
    stock('cheese'), slot(0), bottle('parsley'), { right: slot(0) }, { free: parsleyBack },
    slot(0), pass, ...returnPot(),
  ],
  parma: [
    rack, basket(0), button(0), { right: fridgeDoor }, fridgeTray('tomatoSauce'), topping(0), fridgeTray('pancetta'), topping(1),
    potSlot(0), burner(0), topping(0), burner(0), topping(1), burner(0),
    plateStack, slot(0), wait(cfg.boilTime + 1),
    basket(0), burner(0), ...mix(), burner(0), slot(0), washer,
    stock('cheese'), slot(0), slot(0), pass, ...returnPot(),
  ],
  peperoncino: [
    rack, basket(0), button(0), { right: fridgeDoor }, fridgeTray('saltOil'), tray('saltOil'),
    fridgeTray('garlic'), { free: garlicHome }, fridgeTray('chili'), { free: chiliHome }, potSlot(0), burner(0),
    tray('saltOil'), burner(0), bin('garlic'), burner(0), bin('chili'), burner(0),
    plateStack, slot(0), wait(cfg.boilTime + 1),
    basket(0), slot(0), burner(0), slot(0), washer,
    bottle('parsley'), { right: slot(0) }, { free: parsleyBack }, slot(0), pass, ...returnPot(),
  ],
  carbonara: [
    rack, basket(0), button(0), { right: fridgeDoor }, fridgeStock('carbonaraSauce'), hotWater(0),
    potSlot(0), burner(0), wait(cfg.carbonaraWarmTime + 0.1), hotWater(0), burner(0),
    plateStack, slot(0), wait(cfg.boilTime + 1),
    basket(0), slot(0), burner(0), slot(0), washer,
    stock('cheese'), slot(0), bottle('blackPepper'), { right: slot(0) }, { free: pepperBack },
    slot(0), pass, ...returnPot(),
  ],
  penne: [
    { right: fridgeDoor }, fridgeTray('tomatoSauce'), topping(0),
    fridgeTray('garlic'), { free: garlicHome }, fridgeTray('chili'), { free: chiliHome },
    fridgeStock('penne'), basket(0), button(0), potSlot(0), burner(0),
    topping(0), burner(0), bin('garlic'), burner(0), bin('chili'), burner(0),
    plateStack, slot(0), wait(cfg.penneBoilTime + 1),
    basket(0), burner(0), ...mix(), burner(0), slot(0), washer,
    bottle('parsley'), { right: slot(0) }, { free: parsleyBack }, slot(0), pass, ...returnPot(),
  ],
  squidInk: [
    rack, basket(0), button(0), { right: fridgeDoor2 }, fridgeTray('squid'), topping(0),
    potSlot(0), burner(0), fridgeStock('squidInkSauce'), burner(0), topping(0), burner(0),
    plateStack, slot(0), wait(cfg.boilTime + 1),
    basket(0), burner(0), ...mix(), burner(0), slot(0), washer,
    bottle('parsley'), { right: slot(0) }, { free: parsleyBack }, slot(0), pass, ...returnPot(),
  ],
  mushroomCream: [
    rack, basket(0), button(0), { right: fridgeDoor2 }, fridgeTray('mushroom'), topping(0),
    { right: fridgeDoor }, fridgeTray('spinach'), tray('spinach'), fridgeTray('pancetta'), topping(1),
    fridgeTray('saltOil'), tray('saltOil'),
    potSlot(0), burner(0), fridgeStock('whiteSauce'), burner(0),
    tray('spinach'), burner(0), topping(1), burner(0), topping(0), burner(0), tray('saltOil'), burner(0),
    plateStack, slot(0), wait(cfg.boilTime + 1),
    basket(0), slot(0), burner(0), slot(0), washer,
    stock('cheese'), slot(0), bottle('blackPepper'), { right: slot(0) }, { free: pepperBack },
    slot(0), pass, ...returnPot(),
  ],
  spinach: [
    { right: fridgeDoor }, fridgeTray('spinach'), tray('spinach'), fridgeTray('pancetta'), topping(0), fridgeTray('sauteSauce'), topping(1),
    potSlot(0), burner(0),
    tray('spinach'), burner(0), tray('spinach'), burner(0), topping(0), burner(0), topping(1), burner(0),
    smallStack, slot(0), wait(cfg.sauceHeatTime + 1),
    burner(0), slot(0), washer, slot(0), pass, ...returnPot(),
  ],
  shrimpSalad: [
    { right: fridgeDoor }, fridgeTray('shrimp'), topping(0), fridgeStock('saladBase'), saladSlot(0), topping(0), saladSlot(0),
    fridgeBottle('dressing'), { right: saladSlot(0) }, { free: saladBack },
    fridgeBottle('paprika'), { right: saladSlot(0) }, { free: table(0.3, -0.95, 'salad') },
    saladSlot(0), pass,
  ],
  chickenSalad: [
    { right: fridgeDoor }, fridgeTray('chicken'), topping(0), fridgeStock('saladBase'), saladSlot(0), topping(0), saladSlot(0),
    fridgeBottle('dressing'), { right: saladSlot(0) }, { free: saladBack },
    fridgeBottle('paprika'), { right: saladSlot(0) }, { free: table(0.3, -0.95, 'salad') },
    saladSlot(0), pass,
  ],
  cornSoup: [
    { right: fridgeDoor }, fridgeStock('cornSoup'), hotWater(0), bowlStack, saladSlot(0),
    wait(cfg.cornSoupWarmTime + 0.1), hotWater(0), saladSlot(0), saladSlot(0), pass,
  ],
};

function newTutorial(menuId: string) {
  const g = new Game(cfg, () => 0);
  g.startPractice();
  expect(g.startTutorial(menuId)).toBe(true);
  return g;
}

// 台本どおりに操作する。手を打つ前に、矢印がその場所を指していることを確かめる
function play(menuId: string, acts: Act[], onComplete: ((id: string) => void) | null = null) {
  const g = newTutorial(menuId);
  g.onTutorialComplete = onComplete;
  let lastStep = 0;
  const label = () => `${menuId} 工程${(g.state.tutorial?.step ?? -1) + 1}`;
  const expectArrowAt = (target: Target) => {
    const guide = g.tutorialGuide();
    expect(guide, `${label()}: 矢印が出ていない`).not.toBeNull();
    expect(matchesTarget(target, guide!.at as GuideAt), `${label()}: 矢印が ${JSON.stringify(guide!.at)} を指している（操作は ${JSON.stringify(target)}）`).toBe(true);
  };
  for (const act of acts) {
    if ('wait' in act) g.update(act.wait);
    else if ('right' in act) {
      expectArrowAt(act.right);
      g.rightClick(act.right);
    } else if ('free' in act) g.interact(act.free);
    else {
      expectArrowAt(act);
      g.interact(act);
    }
    g.update(0.01);
    const step = g.state.tutorial?.step ?? Infinity; // 最後まで終わると、チュートリアルは自動で終わる
    expect(step, '工程は戻らない').toBeGreaterThanOrEqual(lastStep);
    lastStep = step;
  }
  return g;
}

describe('チュートリアル：メニューの一覧', () => {
  it('提供できるメニューすべてに、工程が用意されている（メニューを足したら、工程も足す）', () => {
    for (const m of MENU.filter((x) => x.enabled)) {
      expect(hasTutorial(m.id), `${m.name}（${m.id}）の工程がない`).toBe(true);
      expect(tutorialSteps(m.id, cfg)!.length).toBeGreaterThan(0);
    }
  });

  it('工程がないメニューは始められない', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    expect(g.startTutorial('unknown')).toBe(false);
    expect(g.state.tutorial).toBeNull();
    expect(tutorialSteps('unknown', cfg)).toBeNull();
  });
});

describe('チュートリアル：始め方', () => {
  it('厨房が最初の状態に戻り、そのメニューの伝票が1枚だけ。時間がたっても、ほかの伝票は届かない', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    g.state.hand = { kind: 'ipad' }; // iPad を持ったまま始める
    g.state.ipadOpen = true;
    g.state.score = 99;
    expect(g.startTutorial('meat')).toBe(true);
    expect(g.state.mode).toBe('practice');
    expect(g.state.hand).toBeNull(); // iPad は壁に戻る
    expect(g.state.ipadOpen).toBe(false);
    expect(g.state.tickets.map((t) => t.menuId)).toEqual(['meat']);
    expect(g.state.tutorial).toMatchObject({ menuId: 'meat', step: 0 });
    for (let i = 0; i < 10 * cfg.practiceTicketInterval; i++) g.update(1);
    expect(g.state.tickets).toHaveLength(1);
  });

  it('冷蔵庫の中の置き直しは引き継ぐ', () => {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    g.rightClick(fridgeDoor);
    g.rightClick({ kind: 'stock', id: 'meatSauce', inFridge: true });
    g.rightClick({ kind: 'fridgeShelf', shelf: 3, x: 0.66, z: 0 });
    g.startTutorial('meat');
    expect(g.state.fridgeItems.meatSauce).toEqual({ unit: 0, shelf: 3, x: 0.66, z: 0 });
  });

  it('ゲーム（本番）を始めると、チュートリアルは消える', () => {
    const g = newTutorial('tarako');
    g.start();
    expect(g.state.tutorial).toBeNull();
    const h = newTutorial('tarako');
    h.getReady();
    expect(h.state.tutorial).toBeNull();
  });

  it('やめると、チュートリアルは消えて、練習キッチンに戻る（伝票もまた届く）', () => {
    const g = newTutorial('tarako');
    g.update(30);
    g.stopTutorial();
    expect(g.state.tutorial).toBeNull();
    expect(g.tutorialGuide()).toBeNull();
    expect(g.tutorialView()).toBeNull();
    g.update(cfg.practiceTicketInterval);
    expect(g.state.tickets.length).toBeGreaterThan(1);
  });

  it('最後まで終わったときだけ、完了が通知される（ミッション達成の記録に使う）', () => {
    const done: string[] = [];
    const g = play('tarako', SCRIPTS.tarako, (id) => done.push(id));
    expect(g.state.tutorial).toBeNull();
    expect(done).toEqual(['tarako']);
    g.update(cfg.practiceTicketInterval * 3);
    expect(done).toEqual(['tarako']); // 1回だけ

    const h = newTutorial('tarako');
    const stopped: string[] = [];
    h.onTutorialComplete = (id) => stopped.push(id);
    h.stopTutorial();
    expect(stopped).toEqual([]); // やめたときは通知しない
  });

  it('完了して終わったあとは、練習キッチンに戻る（伝票もまた届く）。もう一度始めることもできる', () => {
    const g = play('tarako', SCRIPTS.tarako);
    expect(g.state.tutorial).toBeNull();
    g.update(cfg.practiceTicketInterval);
    expect(g.state.tickets.length).toBe(1); // 新しい伝票が届いた（提供した伝票は消えている）
    expect(g.startTutorial('tarako')).toBe(true);
    expect(g.state.tutorial).toMatchObject({ step: 0 });
  });

  it('やり直すと、最初の工程に戻る', () => {
    const g = newTutorial('tarako');
    g.interact(rack);
    g.interact(basket(0));
    g.update(0.01);
    expect(g.state.tutorial!.step).toBeGreaterThan(0);
    g.startTutorial('tarako');
    expect(g.state.tutorial!.step).toBe(0);
    expect(g.state.boilers.every((b) => b.state === 'empty')).toBe(true);
  });
});

describe('チュートリアル：矢印と工程の進み方', () => {
  it('最初は生麺の棚を指し、取るとかごを指し、セットすると次の工程へ進む', () => {
    const g = newTutorial('tarako');
    expect(g.tutorialGuide()?.at).toEqual({ kind: 'noodleRack' });
    g.interact(rack);
    g.update(0.01);
    expect(g.tutorialGuide()?.at).toEqual({ kind: 'boilerBasket', index: 0 });
    expect(g.state.tutorial!.step).toBe(0);
    g.interact(basket(0));
    g.update(0.01);
    expect(g.state.tutorial!.step).toBe(1);
    expect(g.tutorialGuide()?.at).toEqual({ kind: 'boilerButton', index: 0 });
  });

  it('別のかごに入れても、そのかごのボタンを指す', () => {
    const g = newTutorial('tarako');
    g.interact(rack);
    g.interact(basket(2));
    g.update(0.01);
    expect(g.tutorialGuide()?.at).toEqual({ kind: 'boilerButton', index: 2 });
  });

  it('手に別の物を持っていると、一言で知らせる', () => {
    const g = newTutorial('tarako');
    g.state.hand = { kind: 'ingredient', id: 'cheese' };
    expect(g.tutorialGuide()?.text).toContain('手がふさがっています');
  });

  it('iPad を持っているときは、まず壁に戻すよう案内する', () => {
    const g = newTutorial('tarako');
    g.state.hand = { kind: 'ipad' };
    expect(g.tutorialGuide()?.at).toEqual({ kind: 'ipadWall' });
    expect(g.tutorialView()?.hint).toContain('iPad');
  });

  it('冷蔵庫の扉が閉まっていると、取る場所の代わりに扉を指す', () => {
    const g = newTutorial('meat');
    g.interact(rack);
    g.interact(basket(0));
    g.interact(button(0));
    g.rightClick(fridgeDoor);
    g.interact(potSlot(0));
    g.interact(burner(0));
    g.update(0.01);
    expect(g.tutorialGuide()?.at).toEqual({ kind: 'stock', id: 'meatSauce' });
    g.rightClick(fridgeDoor); // 閉めてしまった
    expect(g.tutorialGuide()?.at).toEqual({ kind: 'fridgeDoor', unit: 0 });
    expect(g.tutorialGuide()?.text).toContain('冷蔵庫');
  });

  it('待ち時間は、残りの秒数を知らせる（茹で・加熱・温め）', () => {
    const g = newTutorial('meat');
    for (const t of [rack, basket(0), button(0)]) g.interact(t);
    g.rightClick(fridgeDoor);
    g.interact(potSlot(0));
    g.interact(burner(0));
    for (let i = 0; i < 2; i++) {
      g.interact({ kind: 'stock', id: 'meatSauce', inFridge: true });
      g.interact(burner(0));
    }
    g.interact(plateStack);
    g.interact(slot(0));
    g.update(5);
    expect(g.tutorialView()?.labels[g.state.tutorial!.step]).toContain('加熱');
    expect(g.tutorialView()?.hint).toContain('加熱中');
    g.update(cfg.sauceHeatTime);
    expect(g.tutorialView()?.hint).toContain('茹で上がるまで待つ');
  });

  it('くり返す工程（ミートソース2杯・混ぜる3回）は、進み具合を言い方に添える', () => {
    const g = newTutorial('meat');
    for (const t of [rack, basket(0), button(0)]) g.interact(t);
    g.rightClick(fridgeDoor);
    g.interact(potSlot(0));
    g.interact(burner(0));
    g.update(0.01);
    expect(g.tutorialView()?.progress).toBe('0/2');
    expect(g.tutorialGuide()?.text).toBe('ミートソースを2回、鍋に入れる（0/2）');
    g.interact(fridgeStock('meatSauce'));
    g.interact(burner(0));
    g.update(0.01);
    expect(g.tutorialView()?.progress).toBe('1/2');
    g.interact(fridgeStock('meatSauce'));
    g.interact(burner(0));
    g.update(0.01);
    expect(g.tutorialView()?.progress).toBeNull(); // 次の工程（皿）は、くり返さない
  });

  it('工程の一覧：全工程の言い方と、いまの工程の番号が分かる', () => {
    const g = newTutorial('tarako');
    const v = g.tutorialView()!;
    expect(v.menuName).toBe('たらこのパスタ');
    expect(v.step).toBe(0);
    expect(v.labels).toEqual(tutorialSteps('tarako', cfg)!.map((s) => s.label));
  });

  it('提供を間違えると、やり直しを案内する', () => {
    const g = newTutorial('tarako');
    for (const t of [plateStack, slot(0), slot(0), pass]) g.interact(t);
    g.state.hand = { kind: 'plate', contents: ['nori'] };
    g.interact(pass);
    expect(g.state.mistakes).toBeGreaterThan(0);
  });
});

describe('チュートリアル：メニューを最後まで作る（矢印は上手な人の手順を指す）', () => {
  for (const m of MENU.filter((x) => x.enabled)) {
    it(`${m.name}：矢印のとおりに作ると、提供できて、チュートリアルが完了する`, () => {
      const script = SCRIPTS[m.id];
      expect(script, `${m.name} の台本がない`).toBeDefined();
      const g = play(m.id, script);
      expect(g.state.served).toBe(1);
      expect(g.state.mistakes).toBe(0);
      expect(g.state.toast?.text).toBe(`${m.name}のチュートリアル完了！`);
      expect(g.state.tutorial).toBeNull(); // 完了したら、自動で終わる
      expect(g.tutorialView()).toBeNull(); // 工程の一覧も
      expect(g.tutorialGuide()).toBeNull(); // 矢印も消える
    });
  }

  it('矢印が指す場所は、台本のどの手でも、実際に操作できる場所', () => {
    // 手を打つ直前に矢印の指す場所へ planInteract できる（光る）か：meat を例に、全手を確かめる
    const g = newTutorial('meat');
    for (const act of SCRIPTS.meat) {
      if ('wait' in act) g.update(act.wait);
      else if ('right' in act) g.rightClick(act.right);
      else if ('free' in act) g.interact(act.free);
      else {
        const at = g.tutorialGuide()?.at;
        if (at && at.kind !== 'surfaceSpot' && at.kind !== 'fridgeDoor') {
          expect(g.planInteract(act), `${JSON.stringify(at)} に操作できない`).not.toBeNull();
        }
        g.interact(act);
      }
      g.update(0.01);
    }
    expect(g.state.served).toBe(1);
  });

  it('途中で先の工程を済ませてしまっても、まとめて進む（戻らない）', () => {
    const g = newTutorial('tarako');
    // 麺をセットし、ボタンを押し、皿を置くまでを、フレームをまたがず一気にやる
    for (const t of [rack, basket(0), button(0), plateStack, slot(0)]) g.interact(t);
    g.update(0.01);
    expect(g.state.tutorial!.step).toBe(3); // 皿を置く工程（3番目）まで終わって、麺を盛る工程から
    expect(g.tutorialView()!.labels[3]).toContain('麺');
  });

  it('別のかごを使い、別の鍋・皿の置き場を使っても完了できる', () => {
    const g = newTutorial('parma');
    // 矢印は「最初の空き」を指すので、別の場所を選ぶ手は free（矢印の提案と違う手）にする。選んだあとは、その場所を指す
    const acts: Act[] = [
      rack, { free: basket(2) }, button(2), { right: fridgeDoor }, fridgeTray('tomatoSauce'), topping(0),
      fridgeTray('pancetta'), { free: topping(2) }, { free: potSlot(3) }, { free: burner(1) },
      topping(0), burner(1), topping(2), burner(1),
      plateStack, { free: slot(2) }, wait(cfg.boilTime + 1),
      basket(2), burner(1), burner(1), burner(1), burner(1), burner(1), slot(2), washer,
      stock('cheese'), slot(2), slot(2), pass,
      wait(cfg.potWashTime + 1), washer, potSlot(3),
    ];
    for (const act of acts) {
      if ('wait' in act) g.update(act.wait);
      else if ('right' in act) g.rightClick(act.right);
      else if ('free' in act) g.interact(act.free);
      else {
        const guide = g.tutorialGuide();
        expect(guide, `工程${g.state.tutorial!.step + 1}`).not.toBeNull();
        expect(matchesTarget(act, guide!.at), `${JSON.stringify(act)} ← ${JSON.stringify(guide!.at)}`).toBe(true);
        g.interact(act);
      }
      g.update(0.01);
    }
    expect(g.state.served).toBe(1);
    expect(g.state.tutorial).toBeNull();
  });
});

describe('matchesTarget：矢印の指定と、実際の設備', () => {
  it('指定した項目だけ比べる', () => {
    expect(matchesTarget({ kind: 'stock', id: 'meatSauce', inFridge: true }, { kind: 'stock', id: 'meatSauce' })).toBe(true);
    expect(matchesTarget({ kind: 'stock', id: 'cheese' }, { kind: 'stock', id: 'meatSauce' })).toBe(false);
    expect(matchesTarget({ kind: 'boilerBasket', index: 1 }, { kind: 'boilerBasket', index: 1 })).toBe(true);
    expect(matchesTarget({ kind: 'boilerBasket', index: 1 }, { kind: 'boilerBasket', index: 0 })).toBe(false);
    expect(matchesTarget({ kind: 'washer' }, { kind: 'servePass' })).toBe(false);
  });

  it('皿の山は、種類を区別する（省略 = ふつうの皿）', () => {
    expect(matchesTarget({ kind: 'plateStack' }, { kind: 'plateStack' })).toBe(true);
    expect(matchesTarget({ kind: 'plateStack', style: 'small' }, { kind: 'plateStack' })).toBe(false);
    expect(matchesTarget({ kind: 'plateStack', style: 'bowl' }, { kind: 'plateStack', style: 'bowl' })).toBe(true);
    expect(matchesTarget({ kind: 'plateStack' }, { kind: 'plateStack', style: 'bowl' })).toBe(false);
  });

  it('台の上の位置の指定は、設備には当てはまらない', () => {
    expect(matchesTarget({ kind: 'tableTop', surface: 'left', x: 0, z: 0 }, { kind: 'surfaceSpot', surface: 'left', x: 0, z: 0 })).toBe(false);
  });
});
