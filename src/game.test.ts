import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { FRIDGE_ITEM_IDS, fitsOnShelf } from './fridge';
import { Game } from './game';
import { getMenu } from './recipe';
import { createTicket } from './tickets';
import type { Target, TrayId } from './types';

// 冷蔵庫の中のトレー・ケース、サラダ台のトッピングの置き場（小エビ・チキン・パンチェッタのトレーとソテーソースのケースを置く、4か所）
const fridgeTray = (id: TrayId): Target => ({ kind: 'fridgeTray', id });
const toppingSlot = (spot: number): Target => ({ kind: 'traySlot', id: 'topping', spot });

const rack: Target = { kind: 'noodleRack' };
const basket = (index: number): Target => ({ kind: 'boilerBasket', index });
const button = (index: number): Target => ({ kind: 'boilerButton', index });
const slot = (index: number): Target => ({ kind: 'plateSlot', index });
const tarakoSauce: Target = { kind: 'stock', id: 'tarakoSauce' };
const nori: Target = { kind: 'stock', id: 'nori' };
const plateStack: Target = { kind: 'plateStack' };
const pass: Target = { kind: 'servePass' };

const fridgeDoor: Target = { kind: 'fridgeDoor' };
// 冷蔵庫の棚板の、視点が合っている点（shelf: 0 = 最下段、1 = 下段、2 = 中段、3 = 上段。x: 奥行き、z: 幅）
const fridgeShelf = (shelf: 0 | 1 | 2 | 3, x: number, z: number): Target => ({ kind: 'fridgeShelf', shelf, x, z });

// 冷蔵庫は開けた状態で始める（扉の開閉は専用のテストで確認する）
function newGame() {
  const g = new Game(cfg, () => 0); // 伝票は先頭のメニュー（たらこ）になる
  g.start();
  g.rightClick(fridgeDoor);
  return g;
}

// 指定したメニューの伝票が1枚だけある状態で始める（ほかの伝票は届かない）
function gameWithTicket(menuId: string) {
  const g = newGame();
  g.state.tickets = [createTicket(1, getMenu(menuId), 0)];
  g.state.nextTicketAt = Infinity;
  return g;
}

// 冷蔵庫のトレー・ケースを取って、トッピングの置き場（spot 番目）に置く
function putTopping(g: Game, id: TrayId, spot = 0) {
  g.interact(fridgeTray(id));
  g.interact(toppingSlot(spot));
}

// 麺をセットして茹で上がりまで進める
function boilNoodle(g: Game, i = 0) {
  g.interact(rack);
  g.interact(basket(i));
  g.interact(button(i));
  g.update(cfg.boilTime + 1);
}

// 皿を台に置き、麺・たらこソース・のりを載せる
function plateTarako(g: Game) {
  g.interact(plateStack);
  g.interact(slot(0));
  g.interact(basket(0));
  g.interact(slot(0));
  g.interact(tarakoSauce);
  g.interact(slot(0));
  g.interact(nori);
  g.interact(slot(0));
}

describe('Game: たらこのパスタを1皿出す', () => {
  it('茹でて盛って提供するとスコアが入り、伝票が消える', () => {
    const g = newGame();
    g.update(0.1);
    boilNoodle(g);
    expect(g.state.boilers[0].state).toBe('lifted');
    const before = g.state.tickets.length;
    expect(before).toBeGreaterThan(0);

    plateTarako(g);
    expect(g.state.plateSlots[0]).toEqual(['noodle', 'tarakoSauce', 'nori']);

    g.interact(slot(0)); // 皿を手に取る
    g.interact(pass);
    expect(g.state.score).toBeGreaterThan(0);
    expect(g.state.served).toBe(1);
    expect(g.state.combo).toBe(1);
    expect(g.state.tickets.length).toBe(before - 1);
    expect(g.state.hand).toBeNull();
  });

  it('中身が違う皿は注文ミスで減点・コンボ切れ', () => {
    const g = newGame();
    g.state.score = 100;
    g.state.combo = 4;
    g.interact(plateStack);
    g.interact(slot(0));
    g.interact(tarakoSauce);
    g.interact(slot(0));
    g.interact(slot(0));
    g.interact(pass);
    expect(g.state.score).toBe(100 - cfg.orderMissPenalty);
    expect(g.state.combo).toBe(0);
    expect(g.state.mistakes).toBe(1);
  });
});

describe('Game: 手持ちのルール', () => {
  it('手に持てるのは1つだけ', () => {
    const g = newGame();
    g.interact(rack);
    expect(g.planInteract(plateStack)).toBeNull();
    expect(g.state.hand).toEqual({ kind: 'rawNoodle', id: 'noodle' });
  });
  it('右クリックで捨てられる', () => {
    const g = newGame();
    g.interact(rack);
    g.discard();
    expect(g.state.hand).toBeNull();
  });
  it('麺は上がっている間しか取れない', () => {
    const g = newGame();
    g.interact(rack);
    g.interact(basket(0));
    g.interact(button(0));
    g.update(10);
    expect(g.planInteract(basket(0))).toBeNull(); // 茹で中
  });
});

describe('Game: のびかけとショート茹で', () => {
  it('猶予を過ぎたら麺を取れず、ダブルクリックで復活する', () => {
    const g = newGame();
    boilNoodle(g);
    g.update(cfg.graceTime + 1);
    expect(g.state.boilers[0].state).toBe('overdue');

    g.interact(basket(0));
    expect(g.state.hand).toBeNull();

    g.doubleClick(basket(0));
    expect(g.state.boilers[0].state).toBe('shortBoil');
    g.update(cfg.shortBoilTime + 0.1);
    g.interact(basket(0));
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'noodle' });
  });
});

const potSlot = (index: number): Target => ({ kind: 'potSlot', index });
const burner = (index: number): Target => ({ kind: 'ihBurner', index });
const washer: Target = { kind: 'washer' };
const can: Target = { kind: 'stock', id: 'meatSauce', inFridge: true };
const cheese: Target = { kind: 'stock', id: 'cheese' };
const parsley: Target = { kind: 'bottle', id: 'parsley' };

// 鍋置き場から鍋を取ってIHに置き、ミートソースを n 杯入れる
function setPot(g: Game, slotIndex: number, burnerIndex: number, scoops = 2) {
  g.interact(potSlot(slotIndex));
  g.interact(burner(burnerIndex));
  for (let i = 0; i < scoops; i++) {
    g.interact(can);
    g.interact(burner(burnerIndex));
  }
}

describe('Game: 鍋の循環', () => {
  it('鍋置き場から取ってIHに置き、取り直せる', () => {
    const g = newGame();
    g.interact(potSlot(0));
    expect(g.state.hand?.kind).toBe('pot');
    expect(g.state.potSlots[0]).toBeNull();

    g.interact(burner(2));
    expect(g.state.hand).toBeNull();
    expect(g.state.ihBurners[2]?.dirty).toBe(false); // 置いただけでは使用済みにならない

    g.interact(burner(2));
    expect(g.state.hand?.kind).toBe('pot');
    expect(g.state.ihBurners[2]).toBeNull();
  });

  it('使用済みの鍋は鍋置き場に戻せない。洗えば戻せる', () => {
    const g = newGame();
    setPot(g, 0, 0, 1);
    g.interact(burner(0)); // 具材を入れた鍋を手に取る
    expect(g.state.hand?.kind === 'pot' && g.state.hand.pot.dirty).toBe(true);
    expect(g.planInteract(potSlot(0))).toBeNull();

    g.interact(washer);
    expect(g.state.hand).toBeNull();
    expect(g.planInteract(washer)).toBeNull(); // 洗浄中は取り出せない

    g.update(cfg.potWashTime + 0.1);
    g.interact(washer);
    expect(g.state.hand?.kind).toBe('pot');

    g.interact(potSlot(0));
    expect(g.state.hand).toBeNull();
    expect(g.state.potSlots[0]?.dirty).toBe(false);
    expect(g.state.potSlots[0]?.contents).toEqual([]);
  });

  it('洗浄機は1台：使用済みの鍋が重なると2個目は入れられない', () => {
    const g = newGame();
    setPot(g, 0, 0, 1);
    setPot(g, 1, 1, 1);
    g.interact(burner(0));
    g.interact(washer);
    g.interact(burner(1));
    expect(g.planInteract(washer)).toBeNull();
    expect(g.state.hand?.kind).toBe('pot'); // 2個目は手に持ったまま待つ
  });

  it('使っていない（洗い済みの）鍋は洗浄機に入らない', () => {
    const g = newGame();
    g.interact(potSlot(0));
    expect(g.planInteract(washer)).toBeNull();
  });

  it('鍋は捨てられない', () => {
    const g = newGame();
    g.interact(potSlot(0));
    g.discard();
    expect(g.state.hand?.kind).toBe('pot');
  });

  it('手に持てるのは1つだけ（鍋を持ったまま別の鍋は取れない）', () => {
    const g = newGame();
    g.interact(potSlot(0));
    expect(g.planInteract(potSlot(1))).toBeNull();
  });
});

describe('Game: ミートソースの加熱', () => {
  it('缶をクリックするたびにお玉1杯。手が埋まっていると取れない', () => {
    const g = newGame();
    g.interact(can);
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'meatSauce' });
    expect(g.planInteract(can)).toBeNull();
  });

  it('ミートソースをお玉2杯入れると、ボタンなしで加熱が始まり、時間が来たら自動で完了する', () => {
    const g = newGame();
    setPot(g, 0, 0, 1);
    const pot = g.state.ihBurners[0]!;
    expect(pot.heat).toBe('cold'); // 1杯ではまだ始まらない

    g.interact(can);
    g.interact(burner(0));
    expect(pot.contents).toEqual(['meatSauce', 'meatSauce']);
    expect(pot.heat).toBe('heating');
    expect(g.state.toast?.text).toContain('加熱開始');

    g.update(cfg.sauceHeatTime - 1);
    expect(pot.heat).toBe('heating');
    g.update(1.1);
    expect(pot.heat).toBe('ready');
  });

  it('パルマ風：トマトソースとパンチェッタは、どちらを先に入れても、そろったら加熱が始まる', () => {
    for (const order of [
      [tomatoSauce, pancetta],
      [pancetta, tomatoSauce],
    ]) {
      const g = newGame();
      putTopping(g, 'pancetta'); // パンチェッタのトレーとトマトソースのケースを、トッピングの置き場に置いておく
      putTopping(g, 'tomatoSauce', 1);
      g.interact(potSlot(0));
      g.interact(burner(0));
      g.interact(order[0]);
      g.interact(burner(0));
      expect(g.state.ihBurners[0]?.heat).toBe('cold'); // 片方だけではまだ
      g.interact(order[1]);
      g.interact(burner(0));
      expect(g.state.ihBurners[0]?.heat).toBe('heating');
    }
  });

  it('カルボナーラ：温まったパックを入れると加熱が始まる（冷たいままは入らない）', () => {
    const g = newGame();
    g.interact(potSlot(0));
    g.interact(burner(0));
    g.interact(carbonaraPack);
    g.interact(hotWater(0));
    g.update(cfg.carbonaraWarmTime + 0.1);
    g.interact(hotWater(0));
    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.heat).toBe('heating');
  });

  it('既定のソースにならない組み合わせでは、加熱が始まらない', () => {
    const g = newGame();
    putTopping(g, 'tomatoSauce', 1);
    setPot(g, 0, 0, 1);
    g.interact(tomatoSauce); // ミートソース + トマトソースは、どのソースでもない
    g.interact(burner(0));
    const pot = g.state.ihBurners[0]!;
    expect(pot.contents).toEqual(['meatSauce', 'tomatoSauce']);
    expect(pot.heat).toBe('cold');
    g.update(100);
    expect(pot.heat).toBe('cold');
  });

  it('空の鍋を置いただけでは加熱が始まらない', () => {
    const g = newGame();
    g.interact(potSlot(0));
    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.heat).toBe('cold');
  });

  it('加熱が進むのはIHに載っている間だけ', () => {
    const g = newGame();
    setPot(g, 0, 0, 2);
    const pot = g.state.ihBurners[0]!;
    g.update(10);
    g.interact(burner(0)); // 鍋を持ち上げる
    g.update(100);
    expect(pot.heat).toBe('heating');
    expect(pot.heatTimer).toBeCloseTo(cfg.sauceHeatTime - 10);
  });

  it('加熱前に麺は入らず、完了前に皿へかけられない', () => {
    const g = newGame();
    setPot(g, 0, 0, 1);
    g.interact(rack);
    g.interact(basket(0));
    g.interact(button(0));
    g.update(cfg.boilTime + 1);
    g.interact(basket(0)); // 茹で上がった麺を持つ
    expect(g.planInteract(burner(0))).toBeNull(); // 鍋が未加熱

    g.discard(); // 麺を捨てて手を空ける
    g.interact(burner(0)); // 鍋を持つ
    g.interact(plateStack); // 手が埋まっていて取れない
    expect(g.state.hand?.kind).toBe('pot');
  });
});

describe('Game: ミートパスタを1皿出す（Aパターン）', () => {
  it('ソースを加熱し、麺を鍋に入れ、皿にかけ、粉チーズとパセリを振って提供する', () => {
    const g = gameWithTicket('meat');
    setPot(g, 0, 0, 2);
    g.interact(plateStack);
    g.interact(slot(0)); // 皿を台に置く
    boilNoodle(g); // 麺が茹で上がる頃にはソースも完成している
    expect(g.state.ihBurners[0]?.heat).toBe('ready');

    g.interact(basket(0)); // 麺を取る
    g.interact(burner(0)); // 加熱済みの鍋に入れる
    mix(g, 0); // 混ぜる（クリック3回）
    g.interact(burner(0)); // 鍋を手に取る
    g.interact(slot(0)); // 皿にかける
    expect(g.state.plateSlots[0]).toEqual(['meatSauce', 'meatSauce', 'noodle']);

    g.interact(washer); // 使い終わった鍋を洗浄機へ
    expect(g.state.hand).toBeNull();
    g.interact(cheese);
    g.interact(slot(0));
    g.interact(parsley); // パセリのボトルを持ち、右クリックで皿に振って、左の台に戻す
    g.rightClick(slot(0));
    g.interact(table(-0.4, 0.95, 'left'));

    g.interact(slot(0)); // 皿を手に取る
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.score).toBeGreaterThan(0);
    expect(g.state.mistakes).toBe(0);
  });

  it('加熱済みのソースを皿にかけ、麺を載せない（Bパターン）形でも中身は同じように移る', () => {
    const g = newGame();
    setPot(g, 0, 0, 2);
    g.update(cfg.sauceHeatTime + 1);
    g.interact(plateStack);
    g.interact(slot(0));
    g.interact(burner(0));
    g.interact(slot(0));
    expect(g.state.plateSlots[0]).toEqual(['meatSauce', 'meatSauce']);
    expect(g.state.hand?.kind === 'pot' && g.state.hand.pot.contents).toEqual([]);
  });
});

const hotWater = (index: number): Target => ({ kind: 'hotWaterSlot', index });
const tomatoSauceCase: Target = { kind: 'fridgeTray', id: 'tomatoSauce' }; // 冷蔵庫の中のトマトソースのケース
const tomatoSauce = toppingSlot(1); // トマトソースのケースを、トッピングの1番の置き場に置いたあと
const pancetta = toppingSlot(0); // パンチェッタのトレーを、トッピングの0番の置き場に置いたあと
const carbonaraPack: Target = { kind: 'stock', id: 'carbonaraSauce', inFridge: true };
const blackPepper: Target = { kind: 'bottle', id: 'blackPepper' };

describe('Game: パルマ風パスタを1皿出す（Aパターン）', () => {
  it('トマトソースのパックとパンチェッタを鍋に入れて加熱し、麺と合わせ、粉チーズを振って提供する', () => {
    const g = gameWithTicket('parma');
    putTopping(g, 'pancetta'); // 冷蔵庫のトレー・ケースを、サラダ台のトッピングの置き場に置く
    putTopping(g, 'tomatoSauce', 1);
    g.interact(potSlot(0));
    g.interact(burner(0));
    g.interact(tomatoSauce); // 置いたケースからパックを取る
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'tomatoSauce' });
    g.interact(burner(0));
    g.interact(pancetta); // 置いたトレーからトングで1掴み
    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.contents).toEqual(['tomatoSauce', 'pancetta']);

    g.interact(plateStack);
    g.interact(slot(0));
    boilNoodle(g);
    expect(g.state.ihBurners[0]?.heat).toBe('ready');

    g.interact(basket(0));
    g.interact(burner(0)); // 麺を鍋へ
    mix(g, 0);
    g.interact(burner(0)); // 鍋を持つ
    g.interact(slot(0)); // 皿にかける
    g.interact(washer);
    g.interact(cheese);
    g.interact(slot(0));
    g.interact(slot(0));
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
  });
});

describe('Game: カルボナーラを1皿出す（Bパターン）', () => {
  it('パックは熱湯に浸けて温めるまで鍋に入れられない', () => {
    const g = newGame();
    g.interact(potSlot(0));
    g.interact(burner(0));

    g.interact(carbonaraPack);
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs[0].warm).toBe(false);
    expect(g.planInteract(burner(0))).toBeNull(); // 冷たいままは入れられない

    g.interact(hotWater(0));
    expect(g.state.hand).toBeNull();
    g.update(cfg.carbonaraWarmTime - 1);
    g.interact(hotWater(0)); // 早く出すと冷たいまま
    expect(g.planInteract(burner(0))).toBeNull();

    g.interact(hotWater(1)); // 別の場所に戻して続きを浸ける（累計で数える）
    g.update(1.1);
    g.interact(hotWater(1));
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs[0].warm).toBe(true);

    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.contents).toEqual(['carbonaraSauce']);
    expect(g.state.hand).toBeNull();
  });

  it('温めたパックを鍋で加熱し、麺を皿に盛ってソースをかけ、粉チーズとブラックペッパーを振って提供する', () => {
    const g = gameWithTicket('carbonara');
    g.interact(potSlot(0));
    g.interact(burner(0));
    g.interact(carbonaraPack);
    g.interact(hotWater(0));
    g.update(cfg.carbonaraWarmTime + 0.1);
    g.interact(hotWater(0));
    g.interact(burner(0));

    g.interact(plateStack);
    g.interact(slot(0));
    boilNoodle(g);
    expect(g.state.ihBurners[0]?.heat).toBe('ready');

    g.interact(basket(0));
    g.interact(slot(0)); // 先に麺を皿に盛る
    g.interact(burner(0)); // 鍋を持つ
    g.interact(slot(0)); // ソースをかける
    expect(g.state.plateSlots[0]).toEqual(['noodle', 'carbonaraSauce']);
    g.interact(washer);
    g.interact(cheese);
    g.interact(slot(0));
    g.interact(blackPepper); // ボトルを持ち、右クリックで皿に振って、左の台に戻す
    g.rightClick(slot(0));
    g.interact(table(-0.4, 1.45, 'left'));
    g.interact(slot(0));
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
  });

  it('熱湯の場所は1つずつ：埋まっている場所には置けない', () => {
    const g = newGame();
    g.interact(carbonaraPack);
    g.interact(hotWater(0));
    for (let i = 0; i < 3; i++) g.interact(carbonaraPack); // 手がいっぱい（3つ）になるまで持つ
    expect(g.planInteract(hotWater(0))).toBeNull(); // 埋まっている場所には置けず、手がいっぱいなので拾えもしない
    expect(g.planInteract(hotWater(1))).not.toBeNull();
  });
});

const saladBase: Target = { kind: 'stock', id: 'saladBase', inFridge: true };
const shrimp = toppingSlot(0); // 小エビのトレーを、トッピングの0番の置き場に置いたあと
const chicken = toppingSlot(1); // チキンのトレーを、トッピングの1番の置き場に置いたあと
const dressing: Target = { kind: 'bottle', id: 'dressing' };
const paprika: Target = { kind: 'bottle', id: 'paprika' };
// 台の天板の、視点が合っている点（台の中心からの相対）。既定はサラダ台
const table = (x: number, z: number, surface: 'salad' | 'left' = 'salad'): Target => ({ kind: 'tableTop', surface, x, z });
const saladSlot = (j: number): Target => ({ kind: 'plateSlot', index: cfg.plateSlotCount + j });

describe('Game: 冷蔵庫の扉', () => {
  it('最初は閉まっていて、中の物は取れない', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    expect(g.state.fridgeOpen[0]).toBe(false);
    expect(g.planInteract(can)).toBeNull();
    expect(g.planInteract(saladBase)).toBeNull();
    g.interact(saladBase);
    expect(g.state.hand).toBeNull();
  });

  it('冷蔵庫に視点が合っているときの右クリックで開閉する', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    g.rightClick(fridgeDoor);
    expect(g.state.fridgeOpen[0]).toBe(true);
    g.interact(can);
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'meatSauce' });

    g.rightClick(fridgeShelf(1, 0, 0)); // 棚・扉・本体への右クリックは、扉の開閉。手の物は捨てない
    expect(g.state.fridgeOpen[0]).toBe(false);
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'meatSauce' });
    g.rightClick(fridgeDoor);
    expect(g.state.fridgeOpen[0]).toBe(true);
  });

  it('扉が閉まっているとき、中の物への右クリックは、扉を開ける（持ち上げない）', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    g.rightClick(can);
    expect(g.state.fridgeOpen[0]).toBe(true);
    expect(g.state.moving).toBeNull();
  });

  it('冷蔵庫以外を狙った右クリックは、手に持っている物を捨てる', () => {
    const g = newGame();
    g.interact(can);
    g.rightClick(null);
    expect(g.state.hand).toBeNull();
    expect(g.state.fridgeOpen[0]).toBe(true); // 扉はそのまま
  });

  it('閉まっている冷蔵庫を左クリックしても開かない（案内だけ出る）', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    g.interact(fridgeDoor);
    expect(g.state.fridgeOpen[0]).toBe(false);
    expect(g.state.toast?.text).toContain('右クリック');
  });

  it('冷蔵庫の外の取り出し元は、扉が閉まっていても取れる', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    g.interact(garlic);
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'garlic' });
  });

  it('小エビ・チキン・パンチェッタ・ソテーソース・トマトソースは冷蔵庫の中にあり、扉が閉まっていると取れない', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    for (const id of ['shrimp', 'chicken', 'pancetta', 'sauteSauce', 'tomatoSauce'] as const) {
      expect(g.state.trays[id]).toBe('fridge');
      expect(g.planInteract(fridgeTray(id)), id).toBeNull();
    }
    g.rightClick(fridgeDoor);
    for (const id of ['shrimp', 'chicken', 'pancetta', 'sauteSauce', 'tomatoSauce'] as const) {
      expect(g.planInteract(fridgeTray(id)), id).not.toBeNull();
    }
  });
});

// ボトルを持ち、サラダの皿（サラダ台の j 番目）に右クリックでかけ、台の上に戻す
function useBottle(g: Game, bottle: Target, j: number, putBackAt = table(0.3, -0.5)) {
  g.interact(bottle);
  g.rightClick(saladSlot(j));
  g.interact(putBackAt);
}

describe('Game: サラダを作る', () => {
  it('冷蔵庫のサラダベースは「お皿にサラダが入ったもの」として手に取れる', () => {
    const g = newGame();
    g.interact(saladBase);
    expect(g.state.hand).toEqual({ kind: 'plate', contents: ['saladBase'] });
  });

  it('小エビのサラダ：サラダ台に置き、小エビ・ドレッシング・パプリカパウダーを載せて提供する', () => {
    const g = gameWithTicket('shrimpSalad');
    putTopping(g, 'shrimp'); // 冷蔵庫の小エビのトレーを、トレー置き場に置く
    g.interact(saladBase);
    g.interact(saladSlot(0)); // サラダを作る台に置く
    g.interact(shrimp);
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'shrimp' });
    g.interact(saladSlot(0));
    useBottle(g, dressing, 0);
    useBottle(g, paprika, 0, table(0.3, -0.95));
    expect(g.state.plateSlots[cfg.plateSlotCount]).toEqual(['saladBase', 'shrimp', 'dressing', 'paprika']);

    g.interact(saladSlot(0)); // 皿を持って提供台へ
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
    expect(g.state.score).toBeGreaterThan(0);
  });

  it('チキンのサラダ：小エビの代わりにチキンを載せる。小エビを載せると注文ミス', () => {
    const g = gameWithTicket('chickenSalad');
    putTopping(g, 'shrimp', 0);
    putTopping(g, 'chicken', 1);
    g.interact(saladBase);
    g.interact(saladSlot(1));
    g.interact(shrimp); // 間違い
    g.interact(saladSlot(1));
    useBottle(g, dressing, 1);
    useBottle(g, paprika, 1, table(0.3, -0.95));
    g.interact(saladSlot(1));
    g.interact(pass);
    expect(g.state.mistakes).toBe(1);
    expect(g.state.served).toBe(0);

    g.interact(saladBase);
    g.interact(saladSlot(1));
    g.interact(chicken);
    g.interact(saladSlot(1));
    useBottle(g, dressing, 1);
    useBottle(g, paprika, 1, table(0.3, -0.95));
    g.interact(saladSlot(1));
    g.interact(pass);
    expect(g.state.served).toBe(1);
  });

  it('サラダを作る場所は皿の置き場の続き（左の台とは別のスロット）', () => {
    const g = newGame();
    expect(g.state.plateSlots).toHaveLength(cfg.plateSlotCount + cfg.saladSlotCount);
  });
});

describe('Game: ボトル（ドレッシング・パプリカパウダー）', () => {
  it('最初はサラダ台の上にある。左クリックで持つと、台の上からなくなる', () => {
    const g = newGame();
    expect(g.state.bottles.dressing).not.toBeNull();
    g.interact(dressing);
    expect(g.state.hand).toEqual({ kind: 'bottle', id: 'dressing' });
    expect(g.state.bottles.dressing).toBeNull();
  });

  it('右クリックでサラダの皿にかけると、ボトルは手に残り、何度でもかけられる', () => {
    const g = newGame();
    g.interact(saladBase);
    g.interact(saladSlot(0));
    g.interact(dressing);
    g.rightClick(saladSlot(0));
    g.rightClick(saladSlot(0));
    expect(g.state.hand).toEqual({ kind: 'bottle', id: 'dressing' });
    expect(g.state.plateSlots[cfg.plateSlotCount]).toEqual(['saladBase', 'dressing', 'dressing']);
  });

  it('皿に振った時刻を記録する（振る動きの表示用）。振れなかったときは記録しない', () => {
    const g = newGame();
    g.interact(saladBase);
    g.interact(saladSlot(0));
    g.interact(dressing);
    g.rightClick(null); // 皿に向いていない
    expect(g.state.bottleShakeAt).toBeNull();
    g.update(1.5);
    g.rightClick(saladSlot(0));
    expect(g.state.bottleShakeAt).toBe(g.state.time);
  });

  it('サラダの皿以外への右クリックでは、かけない。ボトルは捨てられない', () => {
    const g = newGame();
    g.interact(dressing);
    g.rightClick(null);
    g.rightClick(saladSlot(0)); // 皿が置かれていない
    g.rightClick({ kind: 'plateSlot', index: 0 }); // 左の台の皿（サラダ台ではない）
    expect(g.state.hand).toEqual({ kind: 'bottle', id: 'dressing' });
    expect(g.state.plateSlots.every((p) => p === null)).toBe(true); // どの皿にも何も足されていない
  });

  it('サラダ台の天板の好きな場所に置ける', () => {
    const g = newGame();
    g.interact(paprika);
    g.interact(table(-0.4, 1.0));
    expect(g.state.hand).toBeNull();
    expect(g.state.bottles.paprika).toEqual({ surface: 'salad', x: -0.4, z: 1.0 });
  });

  it('置く前に、置こうとしている場所と、置けるかどうかが分かる', () => {
    const g = newGame();
    expect(g.previewBottle(table(0, 0))).toBeNull(); // ボトルを持っていない
    g.interact(paprika);
    expect(g.previewBottle(table(0.1, 0.2))).toEqual({ id: 'paprika', surface: 'salad', x: 0.1, z: 0.2, valid: true });
    expect(g.previewBottle({ kind: 'plateStack' })).toBeNull(); // サラダ台の天板以外
  });

  it('天板の縁を越える位置は、天板の内側に収める', () => {
    const g = newGame();
    g.interact(paprika);
    const p = g.previewBottle(table(9, -9))!;
    expect(p.x).toBeLessThan(0.75);
    expect(p.z).toBeGreaterThan(-1.5);
  });

  it('ほかのボトルに近すぎる場所には置けない', () => {
    const g = newGame();
    g.interact(paprika);
    const home = g.state.bottles.dressing!;
    expect(g.previewBottle(table(home.x + 0.05, home.z))?.valid).toBe(false);
    expect(g.planInteract(table(home.x + 0.05, home.z))).toBeNull();
    expect(g.previewBottle(table(home.x + 0.3, home.z))?.valid).toBe(true);
  });

  it('台の上のボトルは、手が空いていないと持てない', () => {
    const g = newGame();
    g.interact(can);
    expect(g.planInteract(dressing)).toBeNull();
  });
});

describe('Game: パセリのボトル', () => {
  it('最初は左の台の上にある。左クリックで持てる', () => {
    const g = newGame();
    expect(g.state.bottles.parsley?.surface).toBe('left');
    g.interact(parsley);
    expect(g.state.hand).toEqual({ kind: 'bottle', id: 'parsley' });
  });

  it('右クリックで、パスタの皿（左の台）に振る。サラダの皿には振れない', () => {
    const g = newGame();
    g.interact(plateStack);
    g.interact(slot(0)); // 左の台の皿
    g.interact(saladBase);
    g.interact(saladSlot(0)); // サラダ台の皿
    g.interact(parsley);

    g.rightClick(saladSlot(0));
    expect(g.state.plateSlots[cfg.plateSlotCount]).toEqual(['saladBase']);
    g.rightClick(slot(0));
    g.rightClick(slot(0));
    expect(g.state.plateSlots[0]).toEqual(['parsley', 'parsley']);
    expect(g.state.hand).toEqual({ kind: 'bottle', id: 'parsley' }); // ボトルは手に残る
  });

  it('ドレッシングとパプリカは、サラダの皿にだけかけられる', () => {
    const g = newGame();
    g.interact(plateStack);
    g.interact(slot(0));
    g.interact(dressing);
    g.rightClick(slot(0));
    expect(g.state.plateSlots[0]).toEqual([]);
  });

  it('パセリは、左の台にも、サラダ台にも置ける', () => {
    const g = newGame();
    g.interact(parsley);
    g.interact(table(0.0, 0.5, 'salad'));
    expect(g.state.bottles.parsley).toEqual({ surface: 'salad', x: 0, z: 0.5 });

    g.interact(parsley);
    g.interact(table(-0.2, 0.0, 'left'));
    expect(g.state.bottles.parsley).toEqual({ surface: 'left', x: -0.2, z: 0 });
  });

  it('ドレッシングとパプリカは、サラダ台にしか置けない（左の台は赤）', () => {
    const g = newGame();
    for (const [i, bottle] of [dressing, paprika].entries()) {
      g.interact(bottle);
      const p = g.previewBottle(table(0, 0, 'left'));
      expect(p?.valid).toBe(false);
      expect(p?.reason).toBe('surface');
      expect(g.planInteract(table(0, 0, 'left'))).toBeNull();
      expect(g.previewBottle(table(-0.4, i * 0.5, 'salad'))?.valid).toBe(true);
      g.interact(table(-0.4, i * 0.5, 'salad')); // 2本目は、1本目から離れた場所に置く
    }
  });

  it('ボトルどうしの間隔は、同じ台の上でだけ数える', () => {
    const g = newGame();
    g.interact(parsley);
    const dress = g.state.bottles.dressing!; // サラダ台の上
    expect(g.previewBottle(table(dress.x + 0.05, dress.z, 'salad'))?.reason).toBe('gap');
    expect(g.previewBottle(table(dress.x + 0.05, dress.z, 'left'))?.valid).toBe(true); // 左の台なら関係ない
  });

  it('左の台の上のどこに置いても、台の内側に収まる', () => {
    const g = newGame();
    g.interact(parsley);
    const p = g.previewBottle(table(9, 9, 'left'))!;
    expect(p.x).toBeLessThan(0.7);
    expect(p.z).toBeLessThan(1.8);
  });
});

describe('Game: ブラックペッパーのボトル（パセリと同じ）', () => {
  it('最初は左の台の上。パスタの皿に右クリックで振る。サラダの皿には振れない', () => {
    const g = newGame();
    expect(g.state.bottles.blackPepper?.surface).toBe('left');
    g.interact(plateStack);
    g.interact(slot(0));
    g.interact(saladBase);
    g.interact(saladSlot(0));
    g.interact(blackPepper);
    g.rightClick(saladSlot(0));
    expect(g.state.plateSlots[cfg.plateSlotCount]).toEqual(['saladBase']);
    g.rightClick(slot(0));
    expect(g.state.plateSlots[0]).toEqual(['blackPepper']);
    expect(g.state.hand).toEqual({ kind: 'bottle', id: 'blackPepper' });
  });

  it('左の台にも、サラダ台にも置ける', () => {
    const g = newGame();
    g.interact(blackPepper);
    g.interact(table(0.0, 0.5, 'salad'));
    expect(g.state.bottles.blackPepper?.surface).toBe('salad');
    g.interact(blackPepper);
    g.interact(table(-0.2, 0.0, 'left'));
    expect(g.state.bottles.blackPepper).toEqual({ surface: 'left', x: -0.2, z: 0 });
  });
});

describe('Game: 進行', () => {
  it('伝票が届き、制限時間でリザルトになる', () => {
    const g = newGame();
    g.update(cfg.firstTicketAt + 0.1);
    expect(g.state.tickets.length).toBe(1);
    g.update(cfg.gameDuration);
    expect(g.state.phase).toBe('result');
  });
  it('一時停止中は進まない', () => {
    const g = newGame();
    g.pause();
    g.update(10);
    expect(g.state.time).toBe(0);
    g.resume();
    g.update(10);
    expect(g.state.time).toBe(10);
  });
  it('伝票は上限を超えて並ばない', () => {
    const g = newGame();
    for (let i = 0; i < 200; i++) g.update(1);
    expect(g.state.tickets.length).toBeLessThanOrEqual(cfg.maxOpenTickets);
  });
});

// ---------- ペンネアラビアータ・ほうれん草のソテー・コーンスープ ----------

const penneStock: Target = { kind: 'stock', id: 'penne', inFridge: true };
const cornSoupStock: Target = { kind: 'stock', id: 'cornSoup', inFridge: true };
const garlic: Target = { kind: 'stock', id: 'garlic' };
const chili: Target = { kind: 'stock', id: 'chili' };
const sauteSauce = toppingSlot(1); // ソテーソースのケースを、トッピングの1番の置き場に置いたあと
const spinachTray: Target = { kind: 'fridgeTray', id: 'spinach' };
const saltOilCase: Target = { kind: 'fridgeTray', id: 'saltOil' };
const traySlot: Target = { kind: 'traySlot', id: 'spinach' };
const caseSlot: Target = { kind: 'traySlot', id: 'saltOil' };
// 麺を入れたIHの鍋を、クリック3回で混ぜる（Aパターンのパスタだけ）
function mix(g: Game, burnerIndex: number) {
  for (let i = 0; i < cfg.mixClicks; i++) g.interact(burner(burnerIndex));
}
const smallStack: Target = { kind: 'plateStack', style: 'small' };
const bowlStack: Target = { kind: 'plateStack', style: 'bowl' };

describe('Game: ペンネアラビアータを1皿出す（Aパターン）', () => {
  it('ペンネを茹で、トマトソース・ガーリック・唐辛子の鍋に入れ、皿にかけ、パセリを振って提供する', () => {
    const g = gameWithTicket('penne');
    putTopping(g, 'tomatoSauce', 1);
    g.interact(potSlot(0));
    g.interact(burner(0));
    for (const stock of [tomatoSauce, garlic, chili]) {
      g.interact(stock);
      g.interact(burner(0));
    }
    expect(g.state.ihBurners[0]?.heat).toBe('heating'); // そろったら、ボタンなしで加熱が始まる

    g.interact(plateStack);
    g.interact(slot(0));
    g.interact(penneStock); // 冷蔵庫のペンネを、麺と同じように茹で麺器へ
    expect(g.state.hand).toEqual({ kind: 'rawNoodle', id: 'penne' });
    g.interact(basket(0));
    g.interact(button(0));
    g.update(cfg.penneBoilTime + 1);
    g.interact(basket(0));
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'penne' });
    expect(g.state.ihBurners[0]?.heat).toBe('ready');

    g.interact(burner(0)); // 加熱した鍋にペンネを入れる
    mix(g, 0);
    g.interact(burner(0)); // 鍋を持つ
    g.interact(slot(0)); // 皿にかける
    expect(g.state.plateSlots[0]).toEqual(['tomatoSauce', 'garlic', 'chili', 'penne']);
    g.interact(washer);
    g.interact(parsley);
    g.rightClick(slot(0));
    g.interact(table(-0.4, 0.95, 'left'));

    g.interact(slot(0));
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
  });

  it('ペンネの茹で時間は、スパゲッティとは別に決められる', () => {
    const g = new Game({ ...cfg, penneBoilTime: 10 }, () => 0);
    g.start();
    g.rightClick(fridgeDoor);
    g.interact(penneStock);
    g.interact(basket(0));
    g.interact(button(0));
    g.update(10.1);
    expect(g.state.boilers[0].state).toBe('lifted');
  });
});

describe('Game: ほうれん草のソテーを1皿出す', () => {
  it('冷蔵庫のトレーをサラダ台に置き、トングでほうれん草を2掴み、パンチェッタとソテーソースで加熱し、小皿に盛る', () => {
    const g = gameWithTicket('spinach');
    g.interact(spinachTray);
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'spinach' });
    g.interact(traySlot); // サラダ台のトレー置き場に置く
    expect(g.state.trays.spinach).toBe('table');
    expect(g.state.hand).toBeNull();
    putTopping(g, 'pancetta', 0); // パンチェッタのトレーとソテーソースのケースも、トッピングの置き場へ
    putTopping(g, 'sauteSauce', 1);

    g.interact(potSlot(0));
    g.interact(burner(0));
    for (let i = 0; i < 2; i++) {
      g.interact(traySlot); // トングで1掴み
      expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'spinach' });
      g.interact(burner(0));
    }
    g.interact(pancetta);
    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.heat).toBe('cold'); // まだ（ソテーソースが足りない）
    g.interact(sauteSauce);
    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.heat).toBe('heating');

    g.update(cfg.sauceHeatTime + 1);
    g.interact(smallStack); // 小皿
    expect(g.state.hand).toEqual({ kind: 'plate', contents: [], style: 'small' });
    g.interact(slot(0));
    expect(g.state.plateStyles[0]).toBe('small');
    g.interact(burner(0));
    g.interact(slot(0)); // 小皿に盛る
    g.interact(washer);

    g.interact(slot(0));
    expect(g.state.hand).toMatchObject({ kind: 'plate', style: 'small' }); // 小皿のまま持てる
    g.interact(pass);
    expect(g.state.served).toBe(1);
  });

  it('トレーは冷蔵庫の扉が開いているときだけ取れ、置くまで持ち続ける。捨てられず、取り戻せない', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    expect(g.planInteract(spinachTray)).toBeNull(); // 扉が閉まっている
    g.rightClick(fridgeDoor);
    g.interact(spinachTray);
    g.discard();
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'spinach' });
    expect(g.planInteract(spinachTray)).toBeNull(); // もう冷蔵庫にはない
    expect(g.planInteract(traySlot)).not.toBeNull();
    g.interact(traySlot);
    expect(g.state.trays.spinach).toBe('table');
    expect(g.planInteract(spinachTray)).toBeNull();
  });

  it('トレーを置く前は、ほうれん草は取れない', () => {
    const g = newGame();
    expect(g.planInteract(traySlot)).toBeNull();
  });

  it('小皿は、置いた場所に種類が残る', () => {
    const g = newGame();
    g.interact(smallStack);
    g.interact(slot(1));
    g.interact(slot(1));
    expect(g.state.hand).toMatchObject({ kind: 'plate', style: 'small' });
    g.interact(slot(2));
    expect(g.state.plateStyles[2]).toBe('small');
    expect(g.state.plateStyles[1]).toBe('small'); // 古い値が残っていても、次に置いたとき上書きされる
  });
});

describe('Game: コーンスープを1杯出す', () => {
  it('パックを何度かクリックして持ち、熱湯の9か所に浸け、温まったらスープ皿に入れて提供する', () => {
    const g = gameWithTicket('cornSoup');
    for (let i = 0; i < 3; i++) g.interact(cornSoupStock); // クリックした回数だけ持てる
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs.length).toBe(3);

    for (const cell of [0, 4, 8]) g.interact(hotWater(cell)); // 3×3の好きな場所に1つずつ
    expect(g.state.hand).toBeNull();
    expect(g.state.hotWater.filter(Boolean)).toHaveLength(3);

    g.update(cfg.cornSoupWarmTime + 0.1);
    for (const cell of [0, 4, 8]) g.interact(hotWater(cell)); // 取って重ねて持つ
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs.every((p) => p.warm)).toBe(true);
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs.length).toBe(3);
  });

  it('スープ皿に、温まったパックを1つ入れて完成。冷たいパック・2つ目・普通の皿には入らない', () => {
    const g = gameWithTicket('cornSoup');
    g.interact(bowlStack);
    g.interact(saladSlot(0));
    expect(g.state.plateStyles[cfg.plateSlotCount]).toBe('bowl');
    g.interact(plateStack);
    g.interact(saladSlot(1)); // 普通の皿
    for (let i = 0; i < 2; i++) g.interact(cornSoupStock);
    expect(g.planInteract(saladSlot(0))).toBeNull(); // まだ冷たい

    g.interact(hotWater(0));
    g.interact(hotWater(1));
    g.update(cfg.cornSoupWarmTime + 0.1);
    g.interact(hotWater(0));
    g.interact(hotWater(1));
    expect(g.planInteract(saladSlot(1))).toBeNull(); // 普通の皿には入れない
    g.interact(saladSlot(0));
    expect(g.state.plateSlots[cfg.plateSlotCount]).toEqual(['cornSoup']);
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs.length).toBe(1);
    expect(g.planInteract(saladSlot(0))).toBeNull(); // 1皿に1つ

    g.interact(pass); // 手に残ったパックでは提供できない
    g.interact(saladSlot(0)); // 手がふさがっているので何も起きない
    expect(g.state.served).toBe(0);
  });

  it('パックを入れたスープ皿を提供台へ出すと、コーンスープの伝票が消える', () => {
    const g = gameWithTicket('cornSoup');
    g.interact(bowlStack);
    g.interact(saladSlot(0));
    g.interact(cornSoupStock);
    g.interact(hotWater(0));
    g.update(cfg.cornSoupWarmTime + 0.1);
    g.interact(hotWater(0));
    g.interact(saladSlot(0));
    expect(g.state.hand).toBeNull(); // パックを使い切った
    g.interact(saladSlot(0));
    expect(g.state.hand).toMatchObject({ kind: 'plate', style: 'bowl', contents: ['cornSoup'] });
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
  });

  it('コーンスープは5つ、カルボナーラは3つまで持てる', () => {
    const g = newGame();
    for (let i = 0; i < 8; i++) g.interact(cornSoupStock);
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs.length).toBe(5);

    const h = newGame();
    for (let i = 0; i < 6; i++) h.interact(carbonaraPack);
    expect(h.state.hand?.kind === 'pack' && h.state.hand.packs.length).toBe(3);
  });

  it('カルボナーラを3つ持って、熱湯の3か所に1つずつ浸け、温まったら重ねて取れる', () => {
    const g = newGame();
    for (let i = 0; i < 3; i++) g.interact(carbonaraPack);
    for (const i of [0, 1, 2]) g.interact(hotWater(i));
    expect(g.state.hand).toBeNull();
    expect(g.state.hotWater.filter((p) => p?.id === 'carbonaraSauce')).toHaveLength(3);

    g.update(cfg.carbonaraWarmTime + 0.1);
    for (const i of [0, 1, 2]) g.interact(hotWater(i)); // 手が空なら1つ取り、持ったままなら重ねる
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs.map((p) => p.warm)).toEqual([true, true, true]);
    expect(g.state.hotWater.every((p) => p === null)).toBe(true);
  });

  it('カルボナーラを3つ持っていても、鍋には1つずつ入る（残りは手に残り、別の鍋に使える）', () => {
    const g = newGame();
    for (const i of [0, 1]) {
      g.interact(potSlot(i));
      g.interact(burner(i));
    }
    for (let i = 0; i < 3; i++) g.interact(carbonaraPack);
    for (const i of [0, 1, 2]) g.interact(hotWater(i));
    g.update(cfg.carbonaraWarmTime + 0.1);
    for (const i of [0, 1, 2]) g.interact(hotWater(i)); // 温まった3つを重ねて持つ

    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.contents).toEqual(['carbonaraSauce']);
    expect(g.state.ihBurners[0]?.heat).toBe('heating');
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs).toHaveLength(2); // 1つ使い、残り2つは手に残る

    g.interact(burner(0)); // 加熱中の鍋には、もう入らない
    expect(g.state.ihBurners[0]?.contents).toEqual(['carbonaraSauce']);
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs).toHaveLength(2);

    g.interact(burner(1)); // 別の鍋に2つ目
    expect(g.state.ihBurners[1]?.heat).toBe('heating');
    expect(g.state.hand?.kind === 'pack' && g.state.hand.packs).toHaveLength(1);
  });

  it('熱湯は3×3の9か所。コーンスープとカルボナーラの両方を浸けられる', () => {
    const g = newGame();
    expect(g.state.hotWater).toHaveLength(9);
    g.interact(carbonaraPack);
    g.interact(hotWater(0));
    g.interact(cornSoupStock);
    g.interact(hotWater(8));
    expect(g.state.hotWater[0]?.id).toBe('carbonaraSauce');
    expect(g.state.hotWater[8]?.id).toBe('cornSoup');
  });

  it('持っているパックと違う種類は、いっしょに持てない', () => {
    const g = newGame();
    g.interact(cornSoupStock);
    g.interact(hotWater(0));
    g.interact(carbonaraPack);
    g.interact(hotWater(1));
    g.interact(cornSoupStock); // コーンスープを持つ
    expect(g.planInteract(hotWater(0))).not.toBeNull(); // 同じ種類（コーンスープ）なら、重ねて持てる
    expect(g.planInteract(hotWater(1))).toBeNull(); // 違う種類は持てない
  });
});

// ---------- 混ぜる動作・ペペロンチーノ ----------

describe('Game: 混ぜる（Aパターンのパスタだけ）', () => {
  // ミートソースを加熱し終えた鍋に、茹で上がった麺を入れたところまで
  function readyPotWithNoodle() {
    const g = gameWithTicket('meat');
    setPot(g, 0, 0, 2);
    g.interact(rack);
    g.interact(basket(0));
    g.interact(button(0));
    g.update(cfg.boilTime + 1);
    g.interact(basket(0));
    g.interact(burner(0)); // 加熱済みの鍋に麺を入れる
    return g;
  }

  it('麺を入れた鍋は、手が空のクリックで混ぜる。3回で混ざり、それまでは持ち上げられない', () => {
    const g = readyPotWithNoodle();
    const pot = g.state.ihBurners[0]!;
    expect(g.mixProgressAt(burner(0))).toEqual({ done: 0, need: 3 });

    g.interact(burner(0));
    expect(g.state.hand).toBeNull(); // 持ち上がらず、混ぜている
    expect(pot.mixCount).toBe(1);
    expect(g.state.toast?.text).toContain('1/3');
    g.interact(burner(0));
    expect(pot.mixCount).toBe(2);
    expect(g.state.ihBurners[0]).toBe(pot);

    g.interact(burner(0));
    expect(pot.mixCount).toBe(3);
    expect(g.state.toast?.text).toContain('混ざった');
    expect(g.mixProgressAt(burner(0))).toBeNull(); // もう混ぜない

    g.interact(burner(0)); // 4回目は、鍋を持ち上げる
    expect(g.state.hand?.kind).toBe('pot');
  });

  it('混ぜ終わるまでは、皿にかけられない（鍋を持てないので、かけようがない）', () => {
    const g = readyPotWithNoodle();
    g.interact(burner(0)); // 1回混ぜただけ
    expect(g.state.hand).toBeNull(); // 鍋は持ち上がらない（混ぜ終わるまで）
    g.interact(plateStack);
    g.interact(slot(0));
    expect(g.state.plateSlots[0]).toEqual([]);
    g.interact(burner(0));
    g.interact(burner(0)); // 3回で混ざった
    g.interact(burner(0)); // 鍋を持つ
    g.interact(slot(0)); // 皿にかける
    expect(g.state.plateSlots[0]).toEqual(['meatSauce', 'meatSauce', 'noodle']);
  });

  it('麺が入っていない鍋（ソースだけ）は、混ぜずに、そのまま持てる', () => {
    const g = newGame();
    setPot(g, 0, 0, 2);
    g.update(cfg.sauceHeatTime + 1);
    expect(g.mixProgressAt(burner(0))).toBeNull();
    g.interact(burner(0));
    expect(g.state.hand?.kind).toBe('pot');
  });

  it('加熱が終わる前や、手が空でないときは、混ぜられない', () => {
    const g = newGame();
    setPot(g, 0, 0, 2); // 加熱中
    expect(g.mixProgressAt(burner(0))).toBeNull();
    g.interact(can);
    expect(g.mixProgressAt(burner(0))).toBeNull();
  });

  it('皿にかけたあと、洗ったあとは、混ぜた回数がリセットされる', () => {
    const g = readyPotWithNoodle();
    mix(g, 0);
    g.interact(plateStack);
    g.discard();
    g.interact(burner(0));
    expect(g.state.hand?.kind === 'pot' && g.state.hand.pot.mixCount).toBe(3);
    g.interact(plateStack); // 手がふさがっている
    g.interact(washer);
    g.update(cfg.potWashTime + 0.1);
    g.interact(washer);
    expect(g.state.hand?.kind === 'pot' && g.state.hand.pot.mixCount).toBe(0);
  });
});

describe('Game: ケース置き場（塩オイルソースは3か所のどこにも置ける）', () => {
  const caseSlotAt = (spot: number): Target => ({ kind: 'traySlot', id: 'saltOil', spot });

  it('どの置き場にも置けて、置いた置き場からだけお玉1杯を取れる', () => {
    for (const spot of [0, 1, 2]) {
      const g = gameWithTicket('peperoncino');
      g.interact(saltOilCase);
      g.interact(caseSlotAt(spot));
      expect(g.state.trays.saltOil).toBe('table');
      expect(g.state.traySpot.saltOil).toBe(spot);
      for (const other of [0, 1, 2].filter((i) => i !== spot)) expect(g.planInteract(caseSlotAt(other))).toBeNull();
      g.interact(caseSlotAt(spot));
      expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'saltOilSauce' });
    }
  });

  it('番号を省略した置き場は、最初の置き場（0番）として扱う', () => {
    const g = gameWithTicket('peperoncino');
    g.interact(saltOilCase);
    g.interact(caseSlotAt(2));
    expect(g.planInteract(caseSlot)).toBeNull();
    g.interact(caseSlotAt(2));
    g.discard();
    expect(g.state.hand).toBeNull();
  });

  it('ほうれん草のトレーの置き場には、塩オイルソースのケースを置けない', () => {
    const g = gameWithTicket('peperoncino');
    g.interact(saltOilCase);
    expect(g.planInteract({ kind: 'traySlot', id: 'spinach', spot: 0 })).toBeNull();
  });
});

describe('Game: トッピングのトレー置き場（小エビ・チキン・パンチェッタ・ソテーソース・トマトソース）', () => {
  const TOPPINGS = [
    ['shrimp', 'shrimp'],
    ['chicken', 'chicken'],
    ['pancetta', 'pancetta'],
    ['sauteSauce', 'sauteSauce'],
    ['tomatoSauce', 'tomatoSauce'],
  ] as const;

  it('5種類とも冷蔵庫から左クリックで取れて、5か所のどこの置き場にも置ける。置いた置き場からだけ中身を取れる', () => {
    for (const [tray, content] of TOPPINGS) {
      for (const spot of [0, 1, 2, 3, 4]) {
        const g = newGame();
        g.interact(fridgeTray(tray));
        expect(g.state.hand).toEqual({ kind: 'tray', id: tray });
        expect(g.state.trays[tray]).toBe('hand');
        g.interact(toppingSlot(spot));
        expect(g.state.hand).toBeNull();
        expect(g.state.trays[tray]).toBe('table');
        expect(g.state.traySpot[tray]).toBe(spot);
        for (const other of [0, 1, 2, 3, 4].filter((i) => i !== spot)) expect(g.planInteract(toppingSlot(other))).toBeNull();
        g.interact(toppingSlot(spot));
        expect(g.state.hand, `${tray} を ${spot} 番に置いた`).toEqual({ kind: 'ingredient', id: content });
      }
    }
  });

  it('5種類を同時に置ける（置き場は1か所に1つ）。どれがどの置き場でもよい', () => {
    const g = newGame();
    putTopping(g, 'sauteSauce', 0);
    putTopping(g, 'chicken', 1);
    putTopping(g, 'shrimp', 2);
    putTopping(g, 'pancetta', 3);
    putTopping(g, 'tomatoSauce', 4);
    expect(g.state.trays).toMatchObject({ sauteSauce: 'table', chicken: 'table', shrimp: 'table', pancetta: 'table', tomatoSauce: 'table' });
    for (const [spot, content] of [[0, 'sauteSauce'], [1, 'chicken'], [2, 'shrimp'], [3, 'pancetta'], [4, 'tomatoSauce']] as const) {
      g.interact(toppingSlot(spot));
      expect(g.state.hand).toEqual({ kind: 'ingredient', id: content });
      g.discard();
    }
  });

  it('置いてある置き場には、ほかのトレーを置けない（空いている置き場にだけ置ける）', () => {
    const g = newGame();
    putTopping(g, 'shrimp', 0);
    g.interact(fridgeTray('chicken'));
    expect(g.planInteract(toppingSlot(0))).toBeNull();
    g.interact(toppingSlot(0));
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'chicken' }); // 置けず、手に持ったまま
    expect(g.state.trays.shrimp).toBe('table');
    expect(g.planInteract(toppingSlot(1))).not.toBeNull();
  });

  it('トッピングのトレーは、ほうれん草・塩オイルソースの専用の置き場には置けない。逆も置けない', () => {
    const g = newGame();
    g.interact(fridgeTray('shrimp'));
    expect(g.planInteract(traySlot)).toBeNull();
    expect(g.planInteract(caseSlot)).toBeNull();
    g.discard();
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'shrimp' }); // 捨てられない
    g.interact(toppingSlot(0));

    g.interact(spinachTray);
    expect(g.planInteract(toppingSlot(1))).toBeNull(); // ほうれん草のトレーは、トッピングの置き場には置けない
    g.interact(traySlot);
    g.interact(saltOilCase);
    expect(g.planInteract(toppingSlot(1))).toBeNull(); // 塩オイルソースのケースも
  });

  it('置く前は中身を取れない。冷蔵庫から取ったあとは、冷蔵庫に残らない', () => {
    const g = newGame();
    expect(g.planInteract(toppingSlot(0))).toBeNull();
    g.interact(fridgeTray('pancetta'));
    expect(g.planInteract(fridgeTray('pancetta'))).toBeNull();
    expect(g.planInteract(toppingSlot(0))).not.toBeNull(); // 手に持っていれば置ける
  });

  it('右クリックで置いたトレーを持ち上げて、別の置き場に置き直せる', () => {
    const g = newGame();
    putTopping(g, 'chicken', 0);
    g.rightClick(toppingSlot(0));
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'chicken' });
    expect(g.state.trays.chicken).toBe('hand');
    expect(g.planInteract(toppingSlot(0))).not.toBeNull(); // もとの置き場は空いた（置き直せる）
    g.interact(toppingSlot(3));
    expect(g.state.trays.chicken).toBe('table');
    expect(g.state.traySpot.chicken).toBe(3);
    expect(g.planInteract(toppingSlot(0))).toBeNull(); // もとの置き場からは取れない
    g.interact(toppingSlot(3));
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'chicken' });
  });

  it('持ち上げたトレーは、そのまま同じ置き場にも戻せる', () => {
    const g = newGame();
    putTopping(g, 'shrimp', 2);
    g.rightClick(toppingSlot(2));
    g.interact(toppingSlot(2));
    expect(g.state.traySpot.shrimp).toBe(2);
    expect(g.state.hand).toBeNull();
  });

  it('右クリックは、手が空で、トレーが置いてある置き場に向けたときだけ持ち上げる', () => {
    const g = newGame();
    g.rightClick(toppingSlot(0)); // 何も置いていない
    expect(g.state.hand).toBeNull();
    putTopping(g, 'shrimp', 0);
    g.interact(can); // 手がふさがっている：トレーは持ち上げない
    g.rightClick(toppingSlot(0));
    expect(g.state.trays.shrimp).toBe('table');
    expect(g.state.hand).toBeNull(); // 右クリックは、手の物を捨てる
  });

  it('塩オイルソースのケースも、右クリックで別のケース置き場に置き直せる', () => {
    const g = newGame();
    g.interact(saltOilCase);
    g.interact({ kind: 'traySlot', id: 'saltOil', spot: 0 });
    g.rightClick({ kind: 'traySlot', id: 'saltOil', spot: 0 });
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'saltOil' });
    g.interact({ kind: 'traySlot', id: 'saltOil', spot: 2 });
    expect(g.state.traySpot.saltOil).toBe(2);
  });

  it('次のゲームでも、置いたトレーは置き場に残る。手に持っていたトレーは冷蔵庫に戻る', () => {
    const g = newGame();
    putTopping(g, 'shrimp', 2);
    g.interact(fridgeTray('pancetta')); // 手に持ったまま
    g.start();
    expect(g.state.hand).toBeNull();
    expect(g.state.trays.shrimp).toBe('table');
    expect(g.state.traySpot.shrimp).toBe(2); // 置いた置き場も、そのまま
    for (const id of ['chicken', 'pancetta', 'sauteSauce', 'tomatoSauce'] as const) expect(g.state.trays[id]).toBe('fridge');
    g.interact(toppingSlot(2)); // 置き場から、そのまま中身を取れる
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'shrimp' });
    expect(g.planInteract(toppingSlot(0))).toBeNull(); // ほかの置き場は空のまま
  });
});

describe('Game: ペペロンチーノを1皿出す（Bパターン）', () => {
  it('塩オイルソースのケースをサラダ台に置き、1杯・ガーリック・唐辛子を鍋に入れて加熱し、麺を盛った皿にかけ、パセリを振る', () => {
    const g = gameWithTicket('peperoncino');
    g.interact(saltOilCase);
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'saltOil' });
    expect(g.planInteract(traySlot)).toBeNull(); // ほうれん草のトレーの置き場には置けない
    g.interact(caseSlot);
    expect(g.state.trays.saltOil).toBe('table');

    g.interact(potSlot(0));
    g.interact(burner(0));
    g.interact(caseSlot); // お玉で1杯
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'saltOilSauce' });
    g.interact(burner(0));
    for (const stock of [garlic, chili]) {
      g.interact(stock);
      g.interact(burner(0));
    }
    expect(g.state.ihBurners[0]?.contents.slice().sort()).toEqual(['chili', 'garlic', 'saltOilSauce']);
    expect(g.state.ihBurners[0]?.heat).toBe('heating');

    g.interact(plateStack);
    g.interact(slot(0));
    g.interact(rack);
    g.interact(basket(0));
    g.interact(button(0));
    g.update(cfg.boilTime + 1);
    expect(g.state.ihBurners[0]?.heat).toBe('ready');
    g.interact(basket(0));
    g.interact(slot(0)); // 麺を皿に盛る（Bパターン）
    expect(g.mixProgressAt(burner(0))).toBeNull(); // 鍋に麺は入れない。混ぜない
    g.interact(burner(0)); // 鍋を持つ
    g.interact(slot(0)); // ソースをかける
    expect(g.state.plateSlots[0]).toEqual(['noodle', 'saltOilSauce', 'garlic', 'chili']);
    g.interact(washer);

    g.interact(parsley);
    g.rightClick(slot(0));
    g.interact(table(-0.4, 0.95, 'left'));
    g.interact(slot(0));
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
  });

  it('ほうれん草のトレーと塩オイルのケースは、別々に取れて、別々の置き場に置く。ケースは冷蔵庫が開いているときだけ', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    expect(g.planInteract(saltOilCase)).toBeNull(); // 扉が閉まっている
    g.rightClick(fridgeDoor);
    g.interact(spinachTray);
    expect(g.state.trays).toMatchObject({ spinach: 'hand', saltOil: 'fridge' });
    g.interact(traySlot);
    g.interact(saltOilCase);
    g.interact(caseSlot);
    expect(g.state.trays).toMatchObject({ spinach: 'table', saltOil: 'table' });
    g.interact(caseSlot);
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'saltOilSauce' });
  });

  it('ケースを置く前は、塩オイルソースは取れない。ケースは捨てられない', () => {
    const g = newGame();
    expect(g.planInteract(caseSlot)).toBeNull();
    g.interact(saltOilCase);
    g.discard();
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'saltOil' });
  });
});

// ---------- 冷蔵庫の中の物の置き直し ----------

describe('Game: 冷蔵庫の中の物を、右クリックで持ち上げて置き直す', () => {
  it('扉が開いているとき、中の物を右クリックで持ち上げる。手は空いたまま、持ち上げた物は取れない', () => {
    const g = newGame();
    g.rightClick(can);
    expect(g.state.moving).toBe('meatSauce');
    expect(g.state.hand).toBeNull();
    expect(g.planInteract(can)).toBeNull(); // 持ち上げ中の物は、左クリックで取れない
    g.interact(tomatoSauceCase); // ほかの物は、いつもどおり取れる
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'tomatoSauce' });
  });

  it('棚に右クリックで、その場所に置く。ほかの棚にも置ける', () => {
    const g = newGame();
    g.rightClick(can);
    g.rightClick(fridgeShelf(3, 0.66, 0.0)); // 上段の右端の空き
    expect(g.state.moving).toBeNull();
    expect(g.state.fridgeItems.meatSauce).toEqual({ unit: 0, shelf: 3, x: 0.66, z: 0 });
    g.interact(can); // 置き直したあとも、取れる
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'meatSauce' });
  });

  describe('2台目の冷蔵庫', () => {
    const door2: Target = { kind: 'fridgeDoor', unit: 1 };
    const shelf2 = (shelf: 0 | 1 | 2 | 3, x: number, z: number): Target => ({ kind: 'fridgeShelf', unit: 1, shelf, x, z });

    it('最初は空で、扉は1台目と別々に開け閉めできる', () => {
      const g = newGame(); // 1台目は開けてある
      expect(g.state.fridgeOpen).toEqual([true, false]);
      expect(Object.values(g.state.fridgeItems).every((s) => s.unit === 0)).toBe(true);
      g.rightClick(door2);
      expect(g.state.fridgeOpen).toEqual([true, true]);
      g.rightClick(fridgeShelf(1, 0, 0)); // 棚板の unit 省略 = 1台目
      expect(g.state.fridgeOpen).toEqual([false, true]);
      g.rightClick(shelf2(2, 0.4, 0));
      expect(g.state.fridgeOpen).toEqual([false, false]);
    });

    it('1台目の物を持ち上げて、2台目の棚に置ける。同じ位置でも1台目の物とは重ならない', () => {
      const g = newGame();
      g.rightClick(door2);
      const home = { ...g.state.fridgeItems.meatSauce };
      g.rightClick(can);
      g.rightClick(shelf2(home.shelf, home.x, home.z));
      expect(g.state.moving).toBeNull();
      expect(g.state.fridgeItems.meatSauce).toEqual({ ...home, unit: 1 });
      // 1台目のトマトソースがあった位置にも、2台目なら置ける（1台目の中なら重なって置けない）
      g.rightClick(tomatoSauceCase);
      expect(g.previewFridge(fridgeShelf(home.shelf, home.x, home.z))).toMatchObject({ unit: 0, valid: true }); // 缶が出たあとの1台目の空き
      expect(g.previewFridge(shelf2(home.shelf, home.x, home.z))).toMatchObject({ unit: 1, valid: false }); // 2台目の缶と重なる
      expect(g.previewFridge(shelf2(3, 0.37, 0))).toMatchObject({ unit: 1, valid: true });
    });

    it('物を取れるのは、それが入っている冷蔵庫の扉が開いている間だけ', () => {
      const g = newGame();
      g.rightClick(door2);
      g.rightClick(can);
      g.rightClick(shelf2(2, 0.37, 0)); // ミートソース缶を2台目へ
      g.rightClick(fridgeDoor); // 1台目を閉める
      expect(g.state.fridgeOpen).toEqual([false, true]);
      expect(g.planInteract(can)).not.toBeNull(); // 缶は2台目にあり、2台目の扉は開いている
      expect(g.planInteract(tomatoSauceCase)).toBeNull(); // トマトソースは1台目で、扉が閉まっている
      g.rightClick(door2); // 2台目も閉める
      expect(g.planInteract(can)).toBeNull();
    });

    it('2台目の中の物を右クリックすると、持ち上げる。閉まっていれば、2台目の扉の開閉になる', () => {
      const g = newGame();
      g.rightClick(door2);
      g.rightClick(can);
      g.rightClick(shelf2(2, 0.37, 0));
      g.rightClick(can); // 開いている：持ち上げ
      expect(g.state.moving).toBe('meatSauce');
      g.rightClick(shelf2(2, 0.37, 0));
      g.rightClick(door2); // 2台目の扉を閉める
      g.rightClick(can); // 閉まっている：扉を開ける
      expect(g.state.moving).toBeNull();
      expect(g.state.fridgeOpen).toEqual([true, true]);
    });
  });

  it('置く前に、置こうとしている場所と、置けるかどうかが分かる', () => {
    const g = newGame();
    expect(g.previewFridge(fridgeShelf(1, 0.4, 0))).toBeNull(); // 持ち上げていない
    g.rightClick(can);
    expect(g.previewFridge(fridgeShelf(3, 0.66, 0))).toEqual({ item: 'meatSauce', unit: 0, shelf: 3, x: 0.66, z: 0, valid: true });
    expect(g.previewFridge(fridgeDoor)).toBeNull(); // 棚板以外
  });

  it('棚板の縁を越える位置は、棚板の内側に収める', () => {
    const g = newGame();
    g.rightClick(can);
    const p = g.previewFridge(fridgeShelf(1, 9, 9))!;
    expect(p.x).toBeLessThanOrEqual(0.78 - 0.1);
    expect(p.z).toBeLessThanOrEqual(0.96 - 0.1);
    const q = g.previewFridge(fridgeShelf(1, -9, -9))!;
    expect(q.x).toBeGreaterThanOrEqual(0.02 + 0.1);
    expect(q.z).toBeGreaterThanOrEqual(-0.96 + 0.1);
  });

  it('同じ棚のほかの物に重なる場所には置けない。別の棚なら同じ場所でも置ける', () => {
    const g = newGame();
    const tomato = g.state.fridgeItems.tomatoSauceCase; // 中段にある
    g.rightClick(can);
    expect(g.previewFridge(fridgeShelf(tomato.shelf, tomato.x, tomato.z))?.valid).toBe(false);
    g.rightClick(fridgeShelf(tomato.shelf, tomato.x, tomato.z));
    expect(g.state.moving).toBe('meatSauce'); // 置けず、持ち上げたまま
    expect(g.state.toast?.kind).toBe('bad');

    expect(g.previewFridge(fridgeShelf(3, 0.66, 0.0))?.valid).toBe(true); // 上段の空き
    expect(g.previewFridge(fridgeShelf(0, 0.66, 0.3))?.valid).toBe(true); // 最下段（空き）
    expect(g.previewFridge(fridgeShelf(1, 0.37, 0.9))?.valid).toBe(true); // 広くなった幅の端
  });

  it('自分自身のもとの場所には、置き直せる（重なりとは数えない）', () => {
    const g = newGame();
    const home = g.state.fridgeItems.meatSauce;
    g.rightClick(can);
    expect(g.previewFridge(fridgeShelf(home.shelf, home.x, home.z))?.valid).toBe(true);
  });

  it('ほかの物に視点が合っているときは、その物に重ねて置こうとした扱い（置けない）。やめるのではない', () => {
    const g = newGame();
    g.rightClick(can);
    expect(g.previewFridge(tomatoSauceCase)?.valid).toBe(false);
    expect(g.previewFridge(tomatoSauceCase)).toMatchObject({ shelf: 2 }); // 相手の物の位置
    g.rightClick(tomatoSauceCase);
    expect(g.state.moving).toBe('meatSauce');
    expect(g.state.toast?.kind).toBe('bad');
  });

  it('棚以外への右クリックで、置き直しをやめる（もとの場所に戻る）', () => {
    const g = newGame();
    const home = { ...g.state.fridgeItems.meatSauce };
    g.rightClick(can);
    g.rightClick(null);
    expect(g.state.moving).toBeNull();
    expect(g.state.fridgeItems.meatSauce).toEqual(home);
    expect(g.state.fridgeOpen[0]).toBe(true); // 扉は閉まらない
  });

  it('持ち上げている間の右クリックは、扉の開閉にも、手の物を捨てるのにも使われない', () => {
    const g = newGame();
    g.interact(garlic);
    g.rightClick(can);
    g.rightClick(fridgeDoor); // 棚以外：やめるだけ
    expect(g.state.fridgeOpen[0]).toBe(true);
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'garlic' });
  });

  it('トレー・ケースも置き直せる。取ったあと（冷蔵庫にないとき）は持ち上げられない', () => {
    const g = newGame();
    g.rightClick(spinachTray);
    expect(g.state.moving).toBe('spinachTray');
    g.rightClick(fridgeShelf(0, 0.7, 0.3)); // 下段の手前右の空き（棚の内側に収められる）
    expect(g.state.fridgeItems.spinachTray).toMatchObject({ shelf: 0 });

    g.interact(spinachTray); // 置き直した場所のまま、取れる
    expect(g.state.trays.spinach).toBe('hand');
    g.discard();
    g.interact(traySlot);
    g.rightClick(spinachTray); // 冷蔵庫にない
    expect(g.state.moving).toBeNull();
    expect(g.state.fridgeOpen[0]).toBe(false); // 扉の開閉になる
  });

  it('取ったトレーのあとの空きには、ほかの物を置ける', () => {
    const g = newGame();
    const t = g.state.fridgeItems.spinachTray;
    g.rightClick(can);
    expect(g.previewFridge(fridgeShelf(t.shelf, t.x, t.z))?.valid).toBe(false);
    g.rightClick(null);
    g.interact(spinachTray);
    g.interact(traySlot);
    g.rightClick(can);
    expect(g.previewFridge(fridgeShelf(t.shelf, t.x, t.z))?.valid).toBe(true);
  });

  it('扉が開いていなければ、持ち上げられない', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    g.rightClick(can); // 閉まっているので、扉を開けるだけ
    expect(g.state.moving).toBeNull();
  });
});

describe('Game: 練習キッチンと iPad', () => {
  const ipadWall: Target = { kind: 'ipadWall' };

  function practice() {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    return g;
  }

  it('練習は、時間が過ぎても終わらない（ゲームは終わる）', () => {
    const g = practice();
    expect(g.state.mode).toBe('practice');
    for (let i = 0; i < cfg.gameDuration + 60; i++) g.update(1);
    expect(g.state.phase).toBe('playing');

    const real = new Game(cfg, () => 0);
    real.start();
    expect(real.state.mode).toBe('game');
    for (let i = 0; i < cfg.gameDuration + 1; i++) real.update(1);
    expect(real.state.phase).toBe('result');
  });

  it('練習の伝票は、25秒ごとに1枚。最大5枚まで', () => {
    const g = practice();
    g.update(cfg.firstTicketAt); // 最初の1枚
    expect(g.state.tickets.length).toBe(1);
    g.update(cfg.practiceTicketInterval - 1);
    expect(g.state.tickets.length).toBe(1);
    g.update(1);
    expect(g.state.tickets.length).toBe(2);
    for (let i = 0; i < 20 * cfg.practiceTicketInterval; i++) g.update(1);
    expect(g.state.tickets.length).toBe(cfg.practiceMaxTickets); // 5枚で頭打ち
  });

  it('5枚に達していなければ、また届く', () => {
    const g = practice();
    for (let i = 0; i < 20 * cfg.practiceTicketInterval; i++) g.update(1);
    g.state.tickets.shift(); // 1枚さばいた
    expect(g.state.tickets.length).toBe(cfg.practiceMaxTickets - 1);
    for (let i = 0; i < cfg.practiceTicketInterval; i++) g.update(1);
    expect(g.state.tickets.length).toBe(cfg.practiceMaxTickets);
  });

  it('ゲームの伝票は、これまでどおり間隔が短くなっていく（練習の一定間隔ではない）', () => {
    const g = new Game({ ...cfg, ticketIntervalJitter: 0 }, () => 0);
    g.start();
    g.update(cfg.firstTicketAt);
    const first = g.state.nextTicketAt - g.state.time;
    expect(first).toBeCloseTo(cfg.ticketIntervalStart, 0);
    g.state.time = cfg.gameDuration - 1;
    g.state.nextTicketAt = 0;
    g.update(0.5);
    expect(g.state.nextTicketAt - g.state.time).toBeLessThan(cfg.ticketIntervalEnd + 0.5);
  });

  it('壁の iPad は、手が空のときだけ取れて、壁に戻せる', () => {
    const g = practice();
    g.interact(ipadWall);
    expect(g.state.hand).toEqual({ kind: 'ipad' });
    g.interact(ipadWall); // 持っているときに壁へ左クリックすると戻る
    expect(g.state.hand).toBeNull();

    g.state.hand = { kind: 'rawNoodle', id: 'noodle' };
    expect(g.planInteract(ipadWall)).toBeNull(); // 手がふさがっていると取れない
  });

  it('iPad は右クリックで画面を開く。捨てられない', () => {
    const g = practice();
    g.rightClick(null); // 持っていなければ何も起きない
    expect(g.state.ipadOpen).toBe(false);
    g.interact(ipadWall);
    g.rightClick(null);
    expect(g.state.ipadOpen).toBe(true);
    expect(g.state.hand).toEqual({ kind: 'ipad' }); // 開いても捨てられない
    g.closeIpad();
    expect(g.state.ipadOpen).toBe(false);
    expect(g.state.hand).toEqual({ kind: 'ipad' });
  });

  it('壁の iPad はゲーム中は使えない', () => {
    const g = new Game(cfg, () => 0);
    g.start();
    expect(g.planInteract(ipadWall)).toBeNull();
  });

  it('iPad からゲームを始めると、新しい状態になる（手の iPad・開いた画面も戻る）', () => {
    const g = practice();
    g.interact(ipadWall);
    g.rightClick(null);
    g.start();
    expect(g.state.mode).toBe('game');
    expect(g.state.hand).toBeNull();
    expect(g.state.ipadOpen).toBe(false);
    expect(g.state.time).toBe(0);
  });

  it('練習で置き直した冷蔵庫の配置は、ゲームにも反映される', () => {
    const g = practice();
    g.rightClick({ kind: 'fridgeDoor' }); // 扉を開ける
    g.rightClick(can);
    expect(g.state.moving).toBe('meatSauce');
    g.rightClick(fridgeShelf(3, 0.66, 0));
    expect(g.state.fridgeItems.meatSauce).toEqual({ unit: 0, shelf: 3, x: 0.66, z: 0 });

    g.start();
    expect(g.state.fridgeItems.meatSauce).toEqual({ unit: 0, shelf: 3, x: 0.66, z: 0 });
    expect(g.state.fridgeOpen[0]).toBe(false); // 扉の開け閉めは引き継がない
    expect(g.state.moving).toBeNull();
    expect(g.state.fridgeItems.tomatoSauceCase).toEqual(newGame().state.fridgeItems.tomatoSauceCase); // 動かしていない物はそのまま
  });

  it('ゲームのあと練習に戻っても、冷蔵庫の配置は残る', () => {
    const g = practice();
    g.rightClick({ kind: 'fridgeDoor' });
    g.rightClick(can);
    g.rightClick(fridgeShelf(3, 0.66, 0));
    g.start();
    g.startPractice();
    expect(g.state.fridgeItems.meatSauce).toEqual({ unit: 0, shelf: 3, x: 0.66, z: 0 });
  });

  it('動かしていなければ、最初の配置のまま', () => {
    const g = practice();
    g.start();
    expect(g.state.fridgeItems.meatSauce).toEqual({ unit: 0, shelf: 2, x: 0.37, z: 0.25 });
  });
});

describe('Game: iPad からのゲーム開始（操作説明つき）', () => {
  function practice() {
    const g = new Game(cfg, () => 0);
    g.startPractice();
    return g;
  }

  it('準備中は操作説明だけで、時間も伝票も進まない。begin() でゲームが始まる', () => {
    const g = practice();
    g.getReady();
    expect(g.state.phase).toBe('ready');
    expect(g.state.mode).toBe('game');
    g.update(cfg.firstTicketAt + 10);
    expect(g.state.time).toBe(0);
    expect(g.state.tickets).toHaveLength(0);

    g.begin();
    expect(g.state.phase).toBe('playing');
    g.update(1);
    expect(g.state.time).toBe(1);
  });

  it('begin() は、準備中でなければ何もしない（一時停止中を勝手に再開しない）', () => {
    const g = practice();
    g.pause();
    g.begin();
    expect(g.state.phase).toBe('paused');
  });

  it('冷蔵庫から取って具材コーナーに置いたトレーは、ゲームでも置いたまま（冷蔵庫には戻らない）', () => {
    const g = practice();
    g.rightClick({ kind: 'fridgeDoor' });
    g.interact(spinachTray);
    g.interact(traySlot);
    expect(g.state.trays.spinach).toBe('table');
    g.getReady();
    expect(g.state.trays.spinach).toBe('table');
    g.begin();
    expect(g.planInteract(traySlot)).not.toBeNull(); // 置き場から中身を取れる
    expect(g.state.fridgeItems.spinachTray).toEqual(newGame().state.fridgeItems.spinachTray); // 冷蔵庫の中の配置は、そのまま
  });

  it('練習で置いたトレー・ケースは、ゲーム（start・getReady）でも、チュートリアルでも、練習に戻っても残る', () => {
    const g = practice();
    g.rightClick({ kind: 'fridgeDoor' });
    putTopping(g, 'chicken', 3);
    putTopping(g, 'tomatoSauce', 1);
    for (const next of [() => g.getReady(), () => g.begin(), () => g.start(), () => g.startTutorial('tarako'), () => g.startPractice()]) {
      next();
      expect(g.state.trays, '置いたトレー').toMatchObject({ chicken: 'table', tomatoSauce: 'table', spinach: 'fridge' });
      expect(g.state.traySpot).toMatchObject({ chicken: 3, tomatoSauce: 1 });
    }
  });

  it('練習で置き直したボトルの位置は、ゲームにも反映される。ほかの設備（鍋・皿・パックなど）は最初に戻る', () => {
    const g = practice();
    g.interact({ kind: 'bottle', id: 'dressing' });
    g.interact({ kind: 'tableTop', surface: 'salad', x: 0.3, z: 0.6 }); // サラダ台の別の場所に置く
    const moved = g.state.bottles.dressing;
    expect(moved).toMatchObject({ surface: 'salad', x: 0.3, z: 0.6 });
    g.interact({ kind: 'plateStack' });
    g.interact({ kind: 'plateSlot', index: 0 }); // 皿を置いておく（これは引き継がれない）
    expect(g.state.plateSlots[0]).not.toBeNull();

    g.getReady();
    expect(g.state.bottles.dressing).toEqual(moved);
    expect(g.state.bottles.paprika).toEqual(newGame().state.bottles.paprika); // 動かしていないボトルは最初の位置
    expect(g.state.plateSlots[0]).toBeNull();
    g.begin();
    g.start();
    expect(g.state.bottles.dressing).toEqual(moved);
  });

  it('手に持っていたボトルは、もとの場所に戻る', () => {
    const g = practice();
    g.interact({ kind: 'bottle', id: 'parsley' });
    expect(g.state.bottles.parsley).toBeNull();
    g.getReady();
    expect(g.state.hand).toBeNull();
    expect(g.state.bottles.parsley).toEqual(newGame().state.bottles.parsley);
  });

  it('冷蔵庫の扉は閉まった状態から始まる（置いた物だけが引き継がれる）', () => {
    const g = practice();
    g.rightClick({ kind: 'fridgeDoor' });
    expect(g.state.fridgeOpen[0]).toBe(true);
    g.getReady();
    expect(g.state.fridgeOpen).toEqual([false, false]);
  });

  it('手に持っていたトレーのもとの場所に、ほかの物を置き直していたら、冷蔵庫の空いている場所に戻る', () => {
    const g = practice();
    g.rightClick({ kind: 'fridgeDoor' });
    g.interact(spinachTray); // ほうれん草のトレーを手に持つ（冷蔵庫の外）
    const home = { ...g.state.fridgeItems.spinachTray };
    g.rightClick(tomatoSauceCase); // トマトソースを持ち上げて
    g.rightClick(fridgeShelf(home.shelf, home.x, home.z)); // トレーのもとの場所に置く
    expect(g.state.fridgeItems.tomatoSauceCase.shelf).toBe(home.shelf);

    g.getReady();
    const items = g.state.fridgeItems;
    const all = FRIDGE_ITEM_IDS.map((id) => ({ id, spot: items[id] }));
    for (const { id, spot } of all) expect(fitsOnShelf(id, spot, all), id).toBe(true); // どれも重ならない
    expect(items.spinachTray).not.toEqual(home);
    expect(g.state.trays.spinach).toBe('fridge'); // 手に持っていたトレーは、冷蔵庫に戻る
  });

  it('手に持っていたトレーも、冷蔵庫に戻る', () => {
    const g = practice();
    g.rightClick({ kind: 'fridgeDoor' });
    g.interact(saltOilCase);
    expect(g.state.hand).toEqual({ kind: 'tray', id: 'saltOil' });
    g.getReady();
    expect(g.state.hand).toBeNull();
    expect(g.state.trays.saltOil).toBe('fridge');
  });
});

// ---------- 取り出した麺を茹で麺器に戻す ----------

describe('Game: 取り出した麺を茹で麺器のかごに戻す', () => {
  it('茹で上がりの麺を空のかごに戻すと、のびた麺と同じ扱い（のびかけ）になる', () => {
    const g = newGame();
    boilNoodle(g);
    g.interact(basket(0)); // 取り出す
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'noodle' });
    expect(g.state.boilers[0].state).toBe('empty');

    g.interact(basket(0)); // 戻す
    expect(g.state.hand).toBeNull();
    expect(g.state.boilers[0].state).toBe('overdue');
    expect(g.planInteract(button(0))).toBeNull(); // 最初から茹で直すことはできない
    g.interact(basket(0));
    expect(g.state.hand).toBeNull(); // すぐには取れない

    g.doubleClick(basket(0)); // ダブルクリックでショート茹で
    expect(g.state.boilers[0].state).toBe('shortBoil');
    g.update(cfg.shortBoilTime + 0.1);
    g.interact(basket(0));
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'noodle' });
  });

  it('ペンネも戻すとのびかけになる。かごが空いていなければ戻せない', () => {
    const g = newGame();
    g.state.boilers[0].noodle = 'penne';
    g.state.boilers[0].state = 'lifted';
    g.interact(basket(0));
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'penne' });
    g.interact(basket(0));
    expect(g.state.boilers[0]).toMatchObject({ state: 'overdue', noodle: 'penne' });

    g.state.hand = { kind: 'ingredient', id: 'noodle' };
    g.interact(basket(0)); // かごは使用中：麺は手に残り、かごも変わらない
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'noodle' });
    expect(g.state.boilers[0]).toMatchObject({ state: 'overdue', noodle: 'penne' });
  });
});
