import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Game } from './game';
import type { Target } from './types';

const rack: Target = { kind: 'noodleRack' };
const basket = (index: number): Target => ({ kind: 'boilerBasket', index });
const button = (index: number): Target => ({ kind: 'boilerButton', index });
const slot = (index: number): Target => ({ kind: 'plateSlot', index });
const tarakoSauce: Target = { kind: 'stock', id: 'tarakoSauce' };
const nori: Target = { kind: 'stock', id: 'nori' };
const plateStack: Target = { kind: 'plateStack' };
const pass: Target = { kind: 'servePass' };

function newGame() {
  const g = new Game(cfg, () => 0); // 伝票は先頭のメニュー（たらこ）になる
  g.start();
  return g;
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
    expect(g.state.hand).toEqual({ kind: 'rawNoodle' });
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
const ihButton = (index: number): Target => ({ kind: 'ihButton', index });
const washer: Target = { kind: 'washer' };
const can: Target = { kind: 'stock', id: 'meatSauce' };
const cheese: Target = { kind: 'stock', id: 'cheese' };
const parsley: Target = { kind: 'stock', id: 'parsley' };

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

  it('2杯入れてボタンを押すと加熱が始まり、40秒で自動で完了する', () => {
    const g = newGame();
    setPot(g, 0, 0, 2);
    const pot = g.state.ihBurners[0]!;
    expect(pot.contents).toEqual(['meatSauce', 'meatSauce']);

    g.interact(ihButton(0));
    expect(pot.heat).toBe('heating');
    g.update(cfg.sauceHeatTime - 1);
    expect(pot.heat).toBe('heating');
    g.update(1.1);
    expect(pot.heat).toBe('ready');
  });

  it('空の鍋や、鍋のない口ではボタンが効かない', () => {
    const g = newGame();
    expect(g.planInteract(ihButton(0))).toBeNull();
    g.interact(potSlot(0));
    g.interact(burner(0));
    expect(g.planInteract(ihButton(0))).toBeNull();
  });

  it('加熱が進むのはIHに載っている間だけ', () => {
    const g = newGame();
    setPot(g, 0, 0, 2);
    g.interact(ihButton(0));
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
    const g = new Game(cfg, () => 0.3); // 伝票はミートパスタ（有効なメニューの2番目）
    g.start();
    setPot(g, 0, 0, 2);
    g.interact(ihButton(0));
    g.interact(plateStack);
    g.interact(slot(0)); // 皿を台に置く
    boilNoodle(g); // 麺が茹で上がる頃にはソースも完成している
    expect(g.state.ihBurners[0]?.heat).toBe('ready');
    expect(g.state.tickets.some((t) => t.menuId === 'meat')).toBe(true);

    g.interact(basket(0)); // 麺を取る
    g.interact(burner(0)); // 加熱済みの鍋に入れる
    g.interact(burner(0)); // 鍋を手に取る
    g.interact(slot(0)); // 皿にかける
    expect(g.state.plateSlots[0]).toEqual(['meatSauce', 'meatSauce', 'noodle']);

    g.interact(washer); // 使い終わった鍋を洗浄機へ
    expect(g.state.hand).toBeNull();
    g.interact(cheese);
    g.interact(slot(0));
    g.interact(parsley);
    g.interact(slot(0));

    g.interact(slot(0)); // 皿を手に取る
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.score).toBeGreaterThan(0);
    expect(g.state.mistakes).toBe(0);
  });

  it('加熱済みのソースを皿にかけ、麺を載せない（Bパターン）形でも中身は同じように移る', () => {
    const g = newGame();
    setPot(g, 0, 0, 2);
    g.interact(ihButton(0));
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
const tomatoSauce: Target = { kind: 'stock', id: 'tomatoSauce' };
const pancetta: Target = { kind: 'stock', id: 'pancetta' };
const carbonaraPack: Target = { kind: 'stock', id: 'carbonaraSauce' };
const blackPepper: Target = { kind: 'stock', id: 'blackPepper' };

describe('Game: パルマ風パスタを1皿出す（Aパターン）', () => {
  it('トマトソースのパックとパンチェッタを鍋に入れて加熱し、麺と合わせ、粉チーズを振って提供する', () => {
    const g = new Game(cfg, () => 0.6); // 伝票はパルマ風（有効なメニューの3番目）
    g.start();
    g.interact(potSlot(0));
    g.interact(burner(0));
    g.interact(tomatoSauce); // 冷蔵庫の容器からパックを取る
    expect(g.state.hand).toEqual({ kind: 'ingredient', id: 'tomatoSauce' });
    g.interact(burner(0));
    g.interact(pancetta); // サラダ台の具材コーナーからトングで1掴み
    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.contents).toEqual(['tomatoSauce', 'pancetta']);

    g.interact(ihButton(0));
    g.interact(plateStack);
    g.interact(slot(0));
    boilNoodle(g);
    expect(g.state.ihBurners[0]?.heat).toBe('ready');
    expect(g.state.tickets.some((t) => t.menuId === 'parma')).toBe(true);

    g.interact(basket(0));
    g.interact(burner(0)); // 麺を鍋へ
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
    expect(g.state.hand?.kind === 'pack' && g.state.hand.pack.warm).toBe(false);
    expect(g.planInteract(burner(0))).toBeNull(); // 冷たいままは入れられない

    g.interact(hotWater(0));
    expect(g.state.hand).toBeNull();
    g.update(cfg.carbonaraWarmTime - 1);
    g.interact(hotWater(0)); // 早く出すと冷たいまま
    expect(g.planInteract(burner(0))).toBeNull();

    g.interact(hotWater(1)); // 別の場所に戻して続きを浸ける（累計で数える）
    g.update(1.1);
    g.interact(hotWater(1));
    expect(g.state.hand?.kind === 'pack' && g.state.hand.pack.warm).toBe(true);

    g.interact(burner(0));
    expect(g.state.ihBurners[0]?.contents).toEqual(['carbonaraSauce']);
    expect(g.state.hand).toBeNull();
  });

  it('温めたパックを鍋で加熱し、麺を皿に盛ってソースをかけ、粉チーズとブラックペッパーを振って提供する', () => {
    const g = new Game(cfg, () => 0.99); // 伝票はカルボナーラ（有効なメニューの4番目）
    g.start();
    g.interact(potSlot(0));
    g.interact(burner(0));
    g.interact(carbonaraPack);
    g.interact(hotWater(0));
    g.update(cfg.carbonaraWarmTime + 0.1);
    g.interact(hotWater(0));
    g.interact(burner(0));
    g.interact(ihButton(0));

    g.interact(plateStack);
    g.interact(slot(0));
    boilNoodle(g);
    expect(g.state.ihBurners[0]?.heat).toBe('ready');
    expect(g.state.tickets.some((t) => t.menuId === 'carbonara')).toBe(true);

    g.interact(basket(0));
    g.interact(slot(0)); // 先に麺を皿に盛る
    g.interact(burner(0)); // 鍋を持つ
    g.interact(slot(0)); // ソースをかける
    expect(g.state.plateSlots[0]).toEqual(['noodle', 'carbonaraSauce']);
    g.interact(washer);
    g.interact(cheese);
    g.interact(slot(0));
    g.interact(blackPepper);
    g.interact(slot(0));
    g.interact(slot(0));
    g.interact(pass);
    expect(g.state.served).toBe(1);
    expect(g.state.mistakes).toBe(0);
  });

  it('熱湯の場所は1つずつ：埋まっている場所には置けない', () => {
    const g = newGame();
    g.interact(carbonaraPack);
    g.interact(hotWater(0));
    g.interact(carbonaraPack);
    expect(g.planInteract(hotWater(0))).toBeNull();
    expect(g.planInteract(hotWater(1))).not.toBeNull();
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
