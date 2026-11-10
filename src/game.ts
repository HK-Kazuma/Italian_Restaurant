import { createBoiler, pressButton, returnNoodle, setNoodle, startShortBoil, takeNoodle, updateBoiler } from './boiler';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { DEFAULT_DIFFICULTY, configFor, getDifficulty, type Difficulty } from './difficulty';
import { INGREDIENTS } from './ingredients';
import {
  addIngredient,
  canAddIngredient,
  canInsert,
  canPour,
  canMix,
  createPot,
  createWasher,
  insertPot,
  isWashing,
  mixPot,
  pourOnto,
  startHeating,
  takeWashedPot,
  updateHeat,
  updateWasher,
} from './pot';
import { BAKE_STATE_NAME, OVEN_DECK_NAME, bakeItem, bakeState, bakeTime, canTakeDish, createOven, peekDish, placeDish, resolvePlacement, stateOnExit, takeDish, timeToEmerge, updateOven } from './oven';
import { canStackPack, createPack, findWarmPack, soakPack, stockItem } from './pack';
import { MENU, findMatchingTicket, findSauceRecipe, getMenu } from './recipe';
import { PIZZA_TOPPING_NAME, addTopping, canAddTopping, emptyPan, isBuffalo, pizzaName, pizzaOf, whyNotTopping } from './pizza';
import { serveScore } from './score';
import { createTicket, nextTicketInterval, pickMenu } from './tickets';
import { tutorialSteps, type GuideAt, type TutorialStep, type TutorialView } from './tutorial';
import { BOTTLE_FRIDGE_ITEM, BOTTLE_IDS, BOTTLE_PLATE, BOTTLE_SURFACES, BOTTLE_VERB, bottleOfFridgeItem, isFridgeBottle } from './bottle';
import { FRIDGE_HOME, FRIDGE_ITEM_IDS, FRIDGE_ITEM_NAME, clampOnShelf, fitsOnShelf, fridgeItemOf, returnToFridge } from './fridge';
import { BAKE_DISHES, BOTTLE_HOME, FREE_TRAY_HOME, GETA, GETA_HOME, GETA_RANGE, PIZZA_PLATE_R, PIZZA_PLATE_STACK, SURFACES, overlapsPrepFixture, propRange } from './layout';
import { OPEN_WORLD, launchPot, stepThrownPot, type ThrowAim } from './throw';
import type { World } from './world';
import { FREE_TRAY_IDS, TRAY_CONTENT, TRAY_FRIDGE_ITEM, TRAY_IDS, TRAY_NAME, TRAY_ZONE, isFreeTray, trayAt, trayOfFridgeItem } from './tray';
import type { BottleId, BottlePreview, GetaPreview, OvenPreview, PropPreview, BottleSpot, FreeTrayId, FridgeItemId, FridgePreview, FridgeSpot, FridgeUnit, GameState, IngredientId, Item, Mode, Phase, Pot, TableSpot, Target, Toast, TrayId } from './types';

// クリックしたら起きること。null = 今の手持ちではこの設備に何もできない
type Action = () => void;

// 次の状態（練習 ⇄ ゲーム・チュートリアル）に引き継ぐ配置
type CarriedLayout = {
  fridge: GameState['fridgeItems']; // 冷蔵庫の中の物の置き場所
  trays: GameState['trays']; // トレー・ケースの場所（冷蔵庫 / サラダ台）。手に持っていたものは冷蔵庫に戻してある
  traySpot: GameState['traySpot']; // サラダ台に置いたトレー・ケースの置き場の番号
  freeTraySpot: GameState['freeTraySpot']; // 台の上のどこにでも置ける容器（ガーリック・唐辛子）の置き場所
  bottles: GameState['bottles']; // ボトルの置き場所
  getaSpot: GameState['getaSpot']; // 下駄の山の置き場所
};

const TOAST_SECONDS = 2.5;

// 焼き上がったドリア系の皿か（下駄に乗せられる物）
type BakedDoria = Extract<Item, { kind: 'bakeDish' }> & { style: 'doria'; state: 'baked' };
const isBakedDoria = (item: Item): item is BakedDoria => item.kind === 'bakeDish' && item.style === 'doria' && item.state === 'baked';

// 空の鉄板（スタックから取った物も、ピザを皿に移したあとの物も、同じ）
const newPan = (cfg: GameConfig) => bakeItem('pizza', 0, cfg, emptyPan());

// 生地がのっていない、空の鉄板か（ピザ系の焼き皿のうち、pizza を持ち、焼く前のもの）
const isEmptyPan = (item: Item): item is Extract<Item, { kind: 'bakeDish' }> =>
  item.kind === 'bakeDish' && item.style === 'pizza' && item.state === 'raw' && item.pizza !== undefined && !item.pizza.dough;

const copySpot = (spot: BottleSpot): BottleSpot => (spot ? { ...spot } : null);

// ボトルをサラダ台の上に置くときの決まり
const BOTTLE_EDGE = 0.06; // 天板の縁から、これだけ内側までしか置けない
const BOTTLE_GAP = 0.14; // ボトルどうしの最小の間隔

// ガーリック・唐辛子の容器（半径 0.17 の丸い容器）を台の上に置くときの決まり
const FREE_TRAY_EDGE = 0.2; // 天板の縁から、これだけ内側までしか置けない（容器が台からはみ出さない）
const FREE_TRAY_GAP = 0.4; // 容器どうしの最小の間隔（中心どうし）
const FREE_TRAY_BOTTLE_GAP = 0.26; // 容器とボトルの最小の間隔（中心どうし）

export class Game {
  state: GameState;
  // 投げた鍋が当たる床・台・壁。厨房を作ったら main.ts が渡す（なければ、床だけの広い空間）
  world: World = OPEN_WORLD;
  private nextThrownId = 1;
  private nextPlateId = 1;

  constructor(
    readonly cfg: GameConfig = DEFAULT_CONFIG,
    private rng: () => number = Math.random,
  ) {
    this.state = this.initialState('title', 'practice');
  }

  // layout: 引き継ぐ食材・ボトルなどの配置（練習で置き直した配置を、ゲームにも反映する）。省略 = 最初の配置
  private initialState(phase: Phase, mode: Mode, layout?: CarriedLayout, difficulty: Difficulty | null = null): GameState {
    const fridge = layout?.fridge;
    return {
      phase,
      mode,
      difficulty,
      ipadOpen: false,
      tutorial: null,
      time: 0,
      hand: null,
      boilers: Array.from({ length: this.cfg.boilerCount }, createBoiler),
      plateSlots: Array.from({ length: this.cfg.plateSlotCount + this.cfg.saladSlotCount }, () => null),
      plateStyles: Array.from({ length: this.cfg.plateSlotCount + this.cfg.saladSlotCount }, () => 'plate' as const),
      trays: Object.fromEntries(TRAY_IDS.map((id) => [id, layout?.trays[id] ?? 'fridge'])) as GameState['trays'],
      traySpot: Object.fromEntries(TRAY_IDS.map((id) => [id, layout?.traySpot[id] ?? 0])) as GameState['traySpot'],
      freeTraySpot: Object.fromEntries(FREE_TRAY_IDS.map((id) => [id, { ...(layout?.freeTraySpot[id] ?? FREE_TRAY_HOME[id]) }])) as Record<FreeTrayId, TableSpot>,
      fridgeOpen: [false, false, false],
      fridgeItems: Object.fromEntries(FRIDGE_ITEM_IDS.map((id) => [id, { ...(fridge ?? FRIDGE_HOME)[id] }])) as Record<FridgeItemId, FridgeSpot>,
      moving: null,
      pizzaPanStock: this.cfg.pizzaPanCount,
      panPile: null,
      pizzaPlates: [],
      pizzaSlots: Array.from({ length: this.cfg.pizzaSlotCount }, () => null),
      getaSpot: { ...(layout?.getaSpot ?? GETA_HOME) },
      getaMoving: false,
      // 引き継ぎがなければ、冷蔵庫にしまってあるボトル（null）以外は、もとの場所の台の上
      bottles: Object.fromEntries(
        BOTTLE_IDS.map((id) => [id, layout ? copySpot(layout.bottles[id]) : isFridgeBottle(id) ? null : { ...BOTTLE_HOME[id] }]),
      ) as Record<BottleId, BottleSpot>,
      bottleShakeAt: null,
      hotWater: Array.from({ length: this.cfg.hotWaterSlotCount }, () => null),
      potSlots: Array.from({ length: this.cfg.potCount }, () => createPot(this.cfg.mixClicks)),
      ihBurners: Array.from({ length: this.cfg.ihBurnerCount }, () => null),
      thrownPots: [],
      washer: createWasher(),
      oven: createOven(),
      tickets: [],
      nextTicketAt: configFor(this.cfg, difficulty).firstTicketAt,
      nextTicketId: 1,
      score: 0,
      combo: 0,
      maxCombo: 0,
      served: 0,
      mistakes: 0,
      toast: null,
    };
  }

  // 次の状態に引き継ぐ配置。練習で置き直した、冷蔵庫の中の物・サラダ台に置いたトレー・ケース・ボトルの位置を残す
  // （鍋・皿・熱湯のパック・伝票などは、毎回最初に戻る。冷蔵庫の扉も閉まる）。
  //  - 手に持っていたトレー・ケースは冷蔵庫に戻る。もとの場所にほかの物が置かれていたら、冷蔵庫の中の空いている場所に置く
  //  - 手に持っていたボトルは、もとの場所（layout.ts）に戻る。冷蔵庫にしまってあるボトル（ドレッシング・パプリカ）は、冷蔵庫に戻る
  // 最初（引き継ぐ物がない）は undefined
  private carriedLayout(): CarriedLayout | undefined {
    const prev = this.state;
    if (!prev) return undefined;
    const inHand = TRAY_IDS.filter((id) => prev.trays[id] === 'hand');
    return {
      fridge: returnToFridge(prev.fridgeItems, inHand.map((id) => TRAY_FRIDGE_ITEM[id])),
      trays: Object.fromEntries(TRAY_IDS.map((id) => [id, prev.trays[id] === 'hand' ? 'fridge' : prev.trays[id]])) as GameState['trays'],
      traySpot: { ...prev.traySpot },
      freeTraySpot: Object.fromEntries(FREE_TRAY_IDS.map((id) => [id, { ...prev.freeTraySpot[id] }])) as Record<FreeTrayId, TableSpot>,
      bottles: Object.fromEntries(
        BOTTLE_IDS.map((id) => [id, prev.bottles[id] ? { ...prev.bottles[id] } : isFridgeBottle(id) ? null : { ...BOTTLE_HOME[id] }]),
      ) as Record<BottleId, BottleSpot>,
      getaSpot: { ...prev.getaSpot },
    };
  }

  // 練習キッチンを始める（時間制限なし）。練習で置いた食材・ボトル・冷蔵庫の中の配置は引き継ぐ
  startPractice(): void {
    this.state = this.initialState('playing', 'practice', this.carriedLayout());
  }

  // ゲーム（5分間のタイムアタック）を始める。練習で置いた食材・ボトル・冷蔵庫の中の配置は、そのまま引き継ぐ。それ以外は最初から
  start(difficulty: Difficulty = DEFAULT_DIFFICULTY): void {
    this.state = this.initialState('playing', 'game', this.carriedLayout(), difficulty);
  }

  // ゲームの準備（iPad から）：状態を最初に戻して、操作説明を出す。時間は進まず、begin() で始まる。
  // difficulty で伝票の量と出てくる料理が決まる
  getReady(difficulty: Difficulty = DEFAULT_DIFFICULTY): void {
    this.state = this.initialState('ready', 'game', this.carriedLayout(), difficulty);
  }

  // 操作説明を読み終えて、ゲームを始める
  begin(): void {
    if (this.state.phase === 'ready') this.state.phase = 'playing';
  }

  // iPad の画面を閉じる（手には iPad を持ったまま）
  closeIpad(): void {
    this.state.ipadOpen = false;
  }

  // --- チュートリアル（練習キッチンで、選んだメニューを案内つきで作る）---

  // チュートリアルを最後までやり遂げたときに呼ばれる（途中でやめたときは呼ばれない）。ミッションの達成の記録に使う
  onTutorialComplete: ((menuId: string) => void) | null = null;

  private tutorialCache = new Map<string, TutorialStep[] | null>();

  private stepsOf(menuId: string): TutorialStep[] | null {
    if (!this.tutorialCache.has(menuId)) this.tutorialCache.set(menuId, tutorialSteps(menuId, this.cfg));
    return this.tutorialCache.get(menuId) ?? null;
  }

  // チュートリアルを始める。鍋・皿などは最初の状態に戻り（置いた食材・ボトル・冷蔵庫の配置は引き継ぐ）、伝票はこのメニューの1枚だけ届いている。
  // 手に持っていた iPad も壁に戻る。チュートリアルがないメニューなら何もせず false
  startTutorial(menuId: string): boolean {
    const steps = this.stepsOf(menuId);
    if (!steps) return false;
    this.state = this.initialState('playing', 'practice', this.carriedLayout());
    const s = this.state;
    s.tickets = [createTicket(s.nextTicketId++, getMenu(menuId), s.time)];
    s.nextTicketAt = Infinity; // ほかの伝票は届かない
    s.tutorial = { menuId, step: 0, total: steps.length };
    return true;
  }

  // チュートリアルをやめる（最後まで終わったときも、これで終わる）。厨房はそのまま、練習キッチンに戻る（伝票も、また届くようになる）
  stopTutorial(): void {
    const s = this.state;
    if (!s.tutorial) return;
    s.tutorial = null;
    s.nextTicketAt = s.time + this.cfg.practiceTicketInterval;
  }

  // 終わった工程から次へ進める（戻らない）。いくつか続けて終わっていれば、まとめて進む。
  // 最後の工程まで終わったら、「完了」と知らせて、チュートリアルを自動で終える（矢印と工程の一覧は消える）
  private advanceTutorial(): void {
    const t = this.state.tutorial;
    const steps = t && this.stepsOf(t.menuId);
    if (!t || !steps) return;
    while (t.step < steps.length && steps[t.step].done(this.state)) t.step++;
    if (t.step < steps.length) return;
    this.say(`${getMenu(t.menuId).name}のチュートリアル完了！`, 'good');
    this.stopTutorial();
    this.onTutorialComplete?.(t.menuId);
  }

  // 3D の矢印が指す先と、その一言（なければ null）。iPad を持っているときは、まず壁に戻すよう案内する
  tutorialGuide(): { at: GuideAt; text: string } | null {
    const s = this.state;
    const t = s.tutorial;
    const steps = t && this.stepsOf(t.menuId);
    if (!t || !steps || s.phase !== 'playing') return null;
    if (s.hand?.kind === 'ipad') return { at: { kind: 'ipadWall' }, text: 'iPadを壁に戻す（壁に向けて左クリック）' };
    const step = steps[t.step];
    const at = step.at(s);
    if (!at) return null;
    const progress = step.progress?.(s);
    return { at, text: step.hint?.(s) || (progress ? `${step.label}（${progress}）` : step.label) };
  }

  // HUD の工程の一覧に出す内容（チュートリアル中でなければ null）
  tutorialView(): TutorialView | null {
    const s = this.state;
    const t = s.tutorial;
    const steps = t && this.stepsOf(t.menuId);
    if (!t || !steps) return null;
    const hint = s.hand?.kind === 'ipad' ? 'iPadを壁に戻す（壁に向けて左クリック）' : (steps[t.step].hint?.(s) ?? null);
    const progress = steps[t.step].progress?.(s) ?? null;
    return { menuName: getMenu(t.menuId).name, labels: steps.map((x) => x.label), step: t.step, hint, progress };
  }

  pause(): void {
    if (this.state.phase === 'playing') this.state.phase = 'paused';
  }

  resume(): void {
    if (this.state.phase === 'paused') this.state.phase = 'playing';
  }

  update(dt: number): void {
    const s = this.state;
    if (s.phase !== 'playing') return;

    s.time += dt;
    for (const b of s.boilers) updateBoiler(b, dt, this.cfg);
    updateWasher(s.washer, dt);
    updateOven(s.oven, dt, this.cfg);
    for (const pack of s.hotWater) if (pack) soakPack(pack, dt, this.cfg); // 熱湯に浸かっている間だけ温まる
    for (const pot of s.ihBurners) if (pot) updateHeat(pot, dt); // 加熱が進むのはIHに載っている間だけ
    for (const thrown of s.thrownPots) stepThrownPot(thrown, dt, this.world);
    this.spawnTickets();
    this.advanceTutorial();

    if (s.mode === 'game' && s.time >= this.cfg.gameDuration) {
      s.time = this.cfg.gameDuration;
      s.phase = 'result';
    }
  }

  private spawnTickets(): void {
    const s = this.state;
    if (s.time < s.nextTicketAt) return;
    // 練習キッチン：一定の間隔で、上限（5枚）に達していない間だけ届く。ゲーム：だんだん間隔が短くなる
    // （間隔・上限・出てくる料理は、選んだ難易度で変わる）
    const practice = s.mode === 'practice';
    const cfg = configFor(this.cfg, s.difficulty);
    const weights = s.difficulty ? getDifficulty(s.difficulty).menuWeights : undefined;
    const max = practice ? cfg.practiceMaxTickets : cfg.maxOpenTickets;
    if (s.tickets.length < max) {
      s.tickets.push(createTicket(s.nextTicketId++, pickMenu(MENU, this.rng, weights), s.time));
    }
    const progress = s.time / cfg.gameDuration;
    s.nextTicketAt = s.time + (practice ? cfg.practiceTicketInterval : nextTicketInterval(progress, cfg, this.rng));
  }

  // --- 操作 ---

  // 視点の先の設備を左クリック
  interact(target: Target): void {
    this.planInteract(target)?.();
  }

  // 茹で麺器をダブルクリック（のびかけ → ショート茹で）
  doubleClick(target: Target): void {
    this.planDoubleClick(target)?.();
  }

  // 右クリック：
  //  - 冷蔵庫の中の物を持ち上げている最中：棚に視点が合っていればそこに置く。それ以外ならやめる
  //  - 手が空で、サラダ台のトレー置き場に置いたトレー・ケース（台の上に置いたガーリック・唐辛子の容器も）に視点が合っていれば、それを手に持ち上げる（左クリックで別の置き場・場所に置き直せる）
  //  - 下駄の山を持ち上げている最中：台に視点が合っていればそこに置く。それ以外ならやめる
  //  - 手が空で、下駄の山に視点が合っていれば、山ごと持ち上げる
  //  - 扉が開いていて、冷蔵庫の中の物に視点が合っていれば、その物を持ち上げる（棚の好きな場所に置き直せる）
  //  - 冷蔵庫の扉・棚・本体に視点が合っていれば、扉を開閉する
  //  - iPad を持っていれば、画面を開く（ゲーム開始・レシピ）
  //  - 鍋を持っていれば、視線の向きに投げる（aim があるとき）。落ちた鍋は左クリックで拾える
  //  - ボトルを持っていれば、皿にかける。それ以外は、手に持っている物を捨てる
  // aim: 視点の位置と向き（投げる向き）。省略すると、鍋は投げられない
  rightClick(target: Target | null, aim: ThrowAim | null = null): void {
    const s = this.state;
    if (s.phase !== 'playing') return;
    if (s.moving) {
      this.placeMoving(target);
      return;
    }
    if (s.getaMoving) {
      this.placeGeta(target);
      return;
    }
    if (s.hand?.kind === 'ipad') {
      s.ipadOpen = true;
      return;
    }
    if (s.hand?.kind === 'pot' && aim) {
      s.thrownPots.push(launchPot(this.nextThrownId++, s.hand.pot, aim));
      s.hand = null;
      return;
    }
    // サラダ台に置いたトレー・ケースを、手が空なら持ち上げる（別の置き場に置き直せる）
    const placed = this.placedTrayOf(target);
    if (!s.hand && placed) {
      s.hand = { kind: 'tray', id: placed };
      s.trays[placed] = 'hand';
      const where = isFreeTray(placed) ? '台の上に視点を合わせて左クリックで置く' : '置き場に視点を合わせて左クリックで置く';
      this.say(`${TRAY_NAME[placed]}を持ち上げた（${where}）`, 'info');
      return;
    }
    // 手が空で、使い終わった鉄板の山に視点が合っていれば、山ごと持ち上げる（台に置き直す・ストックが0のとき作業台の鉄板のスタックに戻す）
    if (!s.hand && target?.kind === 'panPile' && s.panPile) {
      s.hand = { kind: 'panPile', count: s.panPile.count };
      s.panPile = null;
      this.say(`使い終わった鉄板を${s.hand.count}枚持ち上げた（台に置く／鉄板のスタックが0枚なら、戻して再利用できる）`, 'info');
      return;
    }
    // 手が空で、下駄の山に視点が合っていれば、山ごと持ち上げる（台に右クリックで置き直せる）
    if (!s.hand && target?.kind === 'getaStack') {
      s.getaMoving = true;
      this.say('下駄を持ち上げた（台に視点を合わせて右クリックで置く）', 'info');
      return;
    }
    const item = fridgeItemOf(target);
    if (item && this.isInFridge(item) && s.fridgeOpen[s.fridgeItems[item].unit]) {
      s.moving = item;
      this.say(`${FRIDGE_ITEM_NAME[item]}を持ち上げた（棚に視点を合わせて右クリックで置く）`, 'info');
      return;
    }
    const unit = this.fridgeUnitOf(target);
    if (unit !== null) {
      s.fridgeOpen[unit] = !s.fridgeOpen[unit];
      return;
    }
    if (this.state.hand?.kind === 'bottle') {
      this.useBottle(target);
      return;
    }
    this.discard();
  }

  // 視点が合っているものが、どちらの冷蔵庫か（扉・棚板・中の物。冷蔵庫でなければ null）。扉の開閉の対象を決める
  fridgeUnitOf(target: Target | null): FridgeUnit | null {
    if (!target) return null;
    if (target.kind === 'fridgeDoor' || target.kind === 'fridgeShelf') return target.unit ?? 0;
    const item = fridgeItemOf(target);
    return item ? this.state.fridgeItems[item].unit : null; // 取ったトレー・ケースは、最後にあった冷蔵庫
  }

  // 冷蔵庫の中の物（stock / fridgeTray）が入っている冷蔵庫の扉が開いているか
  private fridgeDoorOpenFor(target: Target): boolean {
    const item = fridgeItemOf(target);
    return item ? this.state.fridgeOpen[this.state.fridgeItems[item].unit] : false;
  }

  // 冷蔵庫の中にある物か（トレー・ケースは、取ったあとは冷蔵庫にない）
  private isInFridge(id: FridgeItemId): boolean {
    const tray = trayOfFridgeItem(id);
    if (tray) return this.state.trays[tray] === 'fridge';
    const bottle = bottleOfFridgeItem(id);
    return bottle ? this.bottleInFridge(bottle) : true;
  }

  // 冷蔵庫にしまってあるボトルが、いま冷蔵庫の中にあるか（台の上にも、手の中にもない）
  private bottleInFridge(id: BottleId): boolean {
    const { hand, bottles } = this.state;
    return id in BOTTLE_FRIDGE_ITEM && bottles[id] === null && !(hand?.kind === 'bottle' && hand.id === id);
  }

  // 視点が合っているトレー置き場に置いてあるトレー・ケース（なければ null。HUD の案内に使う）
  trayAtSlot(target: Target | null): TrayId | null {
    return target?.kind === 'traySlot' ? trayAt(this.state, target.id, target.spot ?? 0) : null;
  }

  // 視点が合っている、台に置いてあるトレー・ケース（置き場に置いた物も、台の上のどこかに置いた容器も。なければ null）
  placedTrayOf(target: Target | null): TrayId | null {
    if (target?.kind === 'tableTray') return this.state.trays[target.id] === 'table' ? target.id : null;
    return this.trayAtSlot(target);
  }

  // 持ち上げた物を、視点が合っている棚に置くとしたら、どこにどう置かれるか。
  // 位置は棚板の内側に収める。同じ棚のほかの物に重なると valid = false
  previewFridge(target: Target | null): FridgePreview | null {
    const s = this.state;
    if (s.phase !== 'playing' || !s.moving) return null;
    const at = this.shelfPointOf(target);
    if (!at) return null;
    const item = s.moving;
    const { x, z } = clampOnShelf(item, at.x, at.z);
    const spot: FridgeSpot = { unit: at.unit, shelf: at.shelf, x, z };
    const others = FRIDGE_ITEM_IDS.filter((id) => this.isInFridge(id)).map((id) => ({ id, spot: s.fridgeItems[id] }));
    return { item, unit: at.unit, shelf: at.shelf, x, z, valid: fitsOnShelf(item, spot, others) };
  }

  // 視点が合っている物を、棚の上の点として読む。棚板ならその点、別の物ならその物の位置（＝重なるので置けない）。それ以外は null
  private shelfPointOf(target: Target | null): FridgeSpot | null {
    if (target?.kind === 'fridgeShelf') return { unit: target.unit ?? 0, shelf: target.shelf, x: target.x, z: target.z };
    const other = fridgeItemOf(target);
    return other && other !== this.state.moving && this.isInFridge(other) ? this.state.fridgeItems[other] : null;
  }

  // 持ち上げている物を置く（棚に視点が合っていて、置ける場所のとき）。それ以外の右クリックは、置き直しをやめる
  private placeMoving(target: Target | null): void {
    const s = this.state;
    const item = s.moving;
    if (!item) return;
    if (this.shelfPointOf(target)) {
      const p = this.previewFridge(target);
      if (p?.valid) {
        s.fridgeItems[item] = { unit: p.unit, shelf: p.shelf, x: p.x, z: p.z };
        s.moving = null;
        this.say(`${FRIDGE_ITEM_NAME[item]}を置いた`, 'info');
      } else {
        this.say('ここには置けない（ほかの物に重なる）', 'bad');
      }
      return;
    }
    s.moving = null; // 棚以外への右クリック：もとの場所に戻す
    this.say('置き直しをやめた', 'info');
  }

  // 下駄の山（台の上）が、点（surface, x, z）から pad だけ離れた範囲にかかっているか。持ち上げている間は、台の上にないので false
  private getaNear(surface: string, x: number, z: number, pad: number): boolean {
    const { getaSpot, getaMoving } = this.state;
    if (getaMoving || getaSpot.surface !== surface) return false;
    return Math.abs(getaSpot.x - x) < GETA.d / 2 + pad && Math.abs(getaSpot.z - z) < GETA.w / 2 + pad;
  }

  // ピザのお皿・使い終わった鉄板の山・ピザのお皿の山（丸い物。半径 PIZZA_PLATE_R）が、点（surface, x, z）から r だけ離れた範囲にかかっているか
  private propNear(surface: string, x: number, z: number, r: number): boolean {
    const s = this.state;
    const spots = [...s.pizzaPlates.map((p) => p.spot), ...(s.panPile ? [s.panPile.spot] : []), PIZZA_PLATE_STACK];
    return spots.some((c) => c.surface === surface && Math.hypot(c.x - x, c.z - z) < PIZZA_PLATE_R + r);
  }

  // 同じく、中心が (x, z)、半分の大きさが (hx, hz) の長方形（下駄の山）にかかっているか
  private propNearRect(surface: string, x: number, z: number, hx: number, hz: number): boolean {
    const s = this.state;
    const spots = [...s.pizzaPlates.map((p) => p.spot), ...(s.panPile ? [s.panPile.spot] : []), PIZZA_PLATE_STACK];
    return spots.some((c) => c.surface === surface && Math.abs(c.x - x) < PIZZA_PLATE_R + hx && Math.abs(c.z - z) < PIZZA_PLATE_R + hz);
  }

  // 手に持ったピザのお皿・空の鉄板（またはその山）を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。
  // 置けるのは、左の台の、提供台の左のあき地と、作業台（具材台の天板。layout.ts の propRange）。位置はその範囲に収める。
  // ほかの物（作業台にもとから置いてある物も）に近すぎる場所では valid = false。鉄板の山は1つだけ（もうあるときは、その山に積む）
  previewProp(target: Target | null): PropPreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || target?.kind !== 'tableTop') return null;
    const what = hand?.kind === 'pizzaPlate' ? 'plate' : hand && isEmptyPan(hand) && !hand.pizza?.dough ? 'pan' : hand?.kind === 'panPile' ? 'panPile' : null;
    if (!what) return null;
    const r = PIZZA_PLATE_R;
    const { surface } = target;
    const range = propRange(surface);
    if (!range) return { what, surface, x: target.x, z: target.z, r, valid: false, reason: 'surface' };
    const x = Math.min(range.maxX, Math.max(range.minX, target.x));
    const z = Math.min(range.maxZ, Math.max(range.minZ, target.z));
    if (what === 'pan' && s.panPile) return { what, surface, x, z, r, valid: false, reason: 'pile' };
    const blocked =
      BOTTLE_IDS.some((id) => {
        const spot = s.bottles[id];
        return spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < r + 0.07;
      }) ||
      FREE_TRAY_IDS.some((id) => {
        const spot = s.freeTraySpot[id];
        return s.trays[id] === 'table' && spot.surface === surface && Math.hypot(spot.x - x, spot.z - z) < r + 0.17;
      }) ||
      this.getaNear(surface, x, z, r) ||
      this.propNear(surface, x, z, r) ||
      (surface === 'prep' && overlapsPrepFixture(x, z, r));
    return { what, surface, x, z, r, valid: !blocked, ...(blocked ? { reason: 'gap' as const } : {}) };
  }

  // 持ち上げた下駄の山を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。
  // 位置は置ける範囲（layout.ts の GETA_RANGE）に収める。左の台以外や、ボトル・容器に近すぎる場所では valid = false
  previewGeta(target: Target | null): GetaPreview | null {
    const s = this.state;
    if (s.phase !== 'playing' || !s.getaMoving || target?.kind !== 'tableTop') return null;
    const { surface } = target;
    const x = Math.min(GETA_RANGE.maxX, Math.max(GETA_RANGE.minX, target.x));
    const z = Math.min(GETA_RANGE.maxZ, Math.max(GETA_RANGE.minZ, target.z));
    if (surface !== GETA_HOME.surface) return { surface, x, z, valid: false, reason: 'surface' };
    const hx = GETA.d / 2;
    const hz = GETA.w / 2;
    const blocked =
      BOTTLE_IDS.some((id) => {
        const spot = s.bottles[id];
        return spot?.surface === surface && Math.abs(spot.x - x) < hx + 0.06 && Math.abs(spot.z - z) < hz + 0.06;
      }) ||
      this.propNearRect(surface, x, z, hx, hz) ||
      FREE_TRAY_IDS.some((id) => {
        const spot = s.freeTraySpot[id];
        return s.trays[id] === 'table' && spot.surface === surface && Math.abs(spot.x - x) < hx + 0.19 && Math.abs(spot.z - z) < hz + 0.19;
      });
    return blocked ? { surface, x, z, valid: false, reason: 'gap' } : { surface, x, z, valid: true };
  }

  // 持ち上げている下駄の山を置く（台に視点が合っていて、置ける場所のとき）。それ以外の右クリックは、置き直しをやめる
  private placeGeta(target: Target | null): void {
    const s = this.state;
    if (target?.kind === 'tableTop') {
      const p = this.previewGeta(target);
      if (p?.valid) {
        s.getaSpot = { surface: p.surface, x: p.x, z: p.z };
        s.getaMoving = false;
        this.say('下駄を置いた', 'info');
      } else {
        this.say(p?.reason === 'surface' ? 'ここには置けない（提供台の左の台にだけ置ける）' : 'ここには置けない（ボトル・容器に近すぎる）', 'bad');
      }
      return;
    }
    s.getaMoving = false;
    this.say('置き直しをやめた', 'info');
  }

  // ピザの材料・鉄板・組み立て台に視点が合っているときの案内（HUD 用）。関係なければ null
  pizzaHint(target: Target | null): string | null {
    const { hand, pizzaSlots } = this.state;
    switch (target?.kind) {
      case 'pizzaDoughStack':
        if (!hand) return '左クリック：ピザ生地を取る';
        if (hand.kind === 'pizzaDough') return '左クリック：ピザ生地を戻す（鉄板のスタックに生地をのせてもよい）';
        if (isEmptyPan(hand)) return '左クリック：鉄板にピザ生地をセットする';
        return null;
      case 'pizzaPanStack': {
        const left = this.state.pizzaPanStock;
        if (!hand) return left > 0 ? `左クリック：ピザの鉄板を取る（残り${left}枚）` : '鉄板がない（積んだ鉄板の山を右クリックで持ち上げて、ここに戻す）';
        if (hand.kind === 'pizzaDough') return left > 0 ? `左クリック：鉄板の上にピザ生地をセットする（鉄板 残り${left}枚）` : '鉄板がない（積んだ鉄板を戻す）';
        if (isEmptyPan(hand) && !hand.pizza?.dough) return left < this.cfg.pizzaPanCount ? '左クリック：鉄板を戻す' : null;
        if (hand.kind === 'panPile') return left < this.cfg.pizzaPanCount ? `左クリック：鉄板を戻す（再利用。残り${left}枚 → 最大${this.cfg.pizzaPanCount}枚）` : `スタックはいっぱい（${this.cfg.pizzaPanCount}枚）`;
        return null;
      }
      case 'pizzaPlateStack':
        if (!hand) return '左クリック：ピザのお皿を1枚取る（台のどこかに置く）';
        if (hand.kind === 'pizzaPlate' && !hand.dish) return '左クリック：お皿を戻す';
        return null;
      case 'pizzaPlate': {
        const plate = this.state.pizzaPlates.find((p) => p.id === target.id);
        if (!plate) return null;
        if (!hand) return plate.dish ? `ピザのお皿（${pizzaName(plate.dish.pizza)}）　左クリック：持ち上げる（提供台へ）` : 'ピザのお皿（空）　左クリック：持ち上げる';
        if (hand.kind === 'bakeDish' && hand.style === 'pizza') {
          if (plate.dish) return 'もうピザが入っている';
          if (hand.state === 'baked') return '左クリック：焼き上がったピザをお皿に入れる（鉄板は手に残る）';
          return hand.state === 'burnt' ? '焦げているので、お皿には入れられない（右クリックで捨てる）' : '焼き上がったピザだけ、お皿に入れられる';
        }
        return null;
      }
      case 'panPile':
        if (hand && isEmptyPan(hand) && !hand.pizza?.dough) return '左クリック：鉄板を積む';
        if (!hand) return `積んだ鉄板（${this.state.panPile?.count ?? 0}枚）　右クリック：山ごと持ち上げる`;
        return null;
      case 'tableTop': {
        const p = this.previewProp(target);
        if (!p) return null;
        const name = p.what === 'plate' ? 'お皿' : p.what === 'pan' ? '鉄板' : '鉄板の山';
        if (p.valid) return p.what === 'pan' ? '左クリック：ここに置く（鉄板の山になる）' : `左クリック：${name}をここに置く`;
        if (p.reason === 'surface') return 'ここには置けない（提供台の左の台か、作業台の上にだけ置ける）';
        if (p.reason === 'pile') return '鉄板の山がもうある（山に視点を合わせて積む）';
        return 'ここには置けない（ほかの物に近すぎる）';
      }
      case 'pizzaSource': {
        const name = PIZZA_TOPPING_NAME[target.id];
        const unit = target.id === 'mozzarella' ? '1個' : '1杯';
        if (!hand) return `左クリック：${name}を${unit}取る`;
        if (hand.kind === 'pizzaTopping' && hand.id === target.id) return `左クリック：${name}を戻す`;
        return null;
      }
      case 'pizzaSlot': {
        const slot = pizzaSlots[target.index];
        if (slot === undefined) return null;
        if (!slot) {
          if (hand?.kind === 'bakeDish' && hand.style === 'pizza' && hand.state === 'raw') return '左クリック：鉄板をここに置く';
          return hand ? 'ピザ組み立て台（空き。焼く前の鉄板を置く）' : 'ピザ組み立て台（空き）。鉄板を取って、ここに置く';
        }
        const p = pizzaOf(slot);
        if (hand?.kind === 'pizzaDough') return p.dough ? 'もう生地がのっている' : '左クリック：ピザ生地をのせる';
        if (hand?.kind === 'pizzaTopping') {
          const why = whyNotTopping(p, hand.id);
          if (why) return `のせられない（${why}）`;
          return hand.id === 'mozzarella' ? '左クリック：モッツァレラを3つ分に分けて、周囲にのせる' : hand.id === 'sauce' ? '左クリック：ピザソースを塗る' : '左クリック：ピザチーズを広げる';
        }
        if (!hand) return `${pizzaName(p)}　左クリック：持ち上げる`;
        return null;
      }
    }
    return null;
  }

  // 下駄・焼き上がったドリアに関する案内（HUD 用）。関係なければ null
  getaHint(target: Target | null): string | null {
    const { hand, getaMoving } = this.state;
    if (getaMoving) {
      const p = this.previewGeta(target);
      if (p?.valid) return '右クリック：ここに置く';
      if (p?.reason === 'surface') return 'ここには置けない（提供台の左の台にだけ置ける）';
      if (p) return 'ここには置けない（ボトル・容器に近すぎる）';
      return '台の上に視点を合わせて右クリックで置く（それ以外で右クリックすると、やめる）';
    }
    if (target?.kind === 'getaStack') {
      if (!hand) return '左クリック：下駄を取る　右クリック：持ち上げて、置き直す';
      if (hand.kind === 'geta') return '左クリック：下駄を戻す';
      if (isBakedDoria(hand) && !hand.geta) return '左クリック：ドリアを下駄に乗せる';
      return null;
    }
    if (target?.kind === 'servePass' && hand?.kind === 'pizzaPlate') {
      if (!hand.dish) return 'ピザが入っていないお皿は出せない';
      if (hand.dish.state === 'baked' && isBuffalo(hand.dish.pizza)) return '左クリック：バッファローピザを提供台に出す（ピザのメニューは未実装のため採点なし）';
      return 'バッファローピザの材料がそろっていない（モッツァレラ6つまでのせる）';
    }
    if (target?.kind === 'servePass' && hand?.kind === 'bakeDish') {
      if (isBakedDoria(hand) && hand.geta) return '左クリック：ドリアを提供台に出す（ドリアのメニューは未実装のため採点なし）';
      if (isBakedDoria(hand)) return '下駄に乗せてから出す（提供台の左の下駄の山をクリック）';
      if (hand.style === 'pizza' && hand.state === 'baked') return 'お皿に入れてから出す（提供台の左のピザのお皿を台に置いて、ピザを入れる）';
      if (hand.state === 'burnt') return '焦げていて提供できない（右クリックで捨てる）';
      if (hand.state === 'half') return '生焼けで提供できない（もう一度、入口に流して焼く）';
      if (hand.state === 'raw') return '焼き上がっていない皿は出せない';
    }
    return null;
  }

  // ボトルを持っているとき、右クリックでサラダの皿にかける・振る。ボトルは手に残る
  private useBottle(target: Target | null): void {
    const hand = this.state.hand;
    if (hand?.kind !== 'bottle') return;
    const plate = this.plateForBottle(hand.id, target);
    if (!plate) {
      this.say(BOTTLE_PLATE[hand.id] === 'salad' ? 'サラダの皿に視点を合わせて右クリック' : 'パスタの皿に視点を合わせて右クリック', 'info');
      return;
    }
    plate.push(hand.id);
    this.state.bottleShakeAt = this.state.time;
    this.say(`${INGREDIENTS[hand.id].name}を${BOTTLE_VERB[hand.id]}`, 'info');
  }

  // 視点が合っている皿のうち、このボトルをかけられるもの（サラダの皿 / パスタの皿。中身を増やせる間だけ）。なければ null
  private plateForBottle(id: BottleId, target: Target | null): IngredientId[] | null {
    if (target?.kind !== 'plateSlot') return null;
    const isSaladSlot = target.index >= this.cfg.plateSlotCount;
    if (isSaladSlot !== (BOTTLE_PLATE[id] === 'salad')) return null;
    const plate = this.state.plateSlots[target.index];
    return plate && plate.length < this.cfg.maxPlateContents ? plate : null;
  }

  // IHの鍋に視点が合っていて、いま混ぜられるなら、その進み具合（HUD の案内に使う）。なければ null
  mixProgressAt(target: Target | null): { done: number; need: number } | null {
    const s = this.state;
    if (s.phase !== 'playing' || s.hand || target?.kind !== 'ihBurner') return null;
    const pot = s.ihBurners[target.index];
    return pot && canMix(pot) ? { done: pot.mixCount, need: pot.mixNeed } : null;
  }

  // 手に持ったボトルを右クリックでかけられる場所か（HUD の案内に使う）
  canUseBottleAt(target: Target | null): boolean {
    const hand = this.state.hand;
    return this.state.phase === 'playing' && hand?.kind === 'bottle' && this.plateForBottle(hand.id, target) !== null;
  }

  // 手に持ったボトルを、視点が合っている台の天板に置くとしたら、どこにどう置かれるか。
  // 位置は天板の内側に収める。置けない台や、ほかのボトルに近すぎる場所では valid = false（reason に理由）
  previewBottle(target: Target | null): BottlePreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || hand?.kind !== 'bottle' || target?.kind !== 'tableTop') return null;
    const { surface } = target;
    const size = SURFACES[surface];
    const halfW = size.width / 2 - BOTTLE_EDGE;
    const halfD = size.depth / 2 - BOTTLE_EDGE;
    const x = Math.min(halfW, Math.max(-halfW, target.x));
    const z = Math.min(halfD, Math.max(-halfD, target.z));

    if (!BOTTLE_SURFACES[hand.id].includes(surface)) return { id: hand.id, surface, x, z, valid: false, reason: 'surface' };
    const tooClose =
      BOTTLE_IDS.some((id) => {
        const spot = s.bottles[id];
        return id !== hand.id && spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < BOTTLE_GAP;
      }) ||
      FREE_TRAY_IDS.some((id) => {
        const spot = s.freeTraySpot[id];
        return s.trays[id] === 'table' && spot.surface === surface && Math.hypot(spot.x - x, spot.z - z) < FREE_TRAY_BOTTLE_GAP;
      }) ||
      this.getaNear(surface, x, z, 0.06) || // 下駄の山の上には置かない
      this.propNear(surface, x, z, 0.06); // ピザのお皿・鉄板の山の上にも置かない
    return tooClose
      ? { id: hand.id, surface, x, z, valid: false, reason: 'gap' }
      : { id: hand.id, surface, x, z, valid: true };
  }

  // 手に持ったガーリック・唐辛子の容器を、視点が合っている台の天板に置くとしたら、どこにどう置かれるか（ボトルと同じ。どの台にも置ける）。
  // 位置は天板の内側に収める。ほかの容器・ボトルに近すぎる場所では valid = false（reason = 'gap'）
  previewFreeTray(target: Target | null): BottlePreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || hand?.kind !== 'tray' || !isFreeTray(hand.id) || target?.kind !== 'tableTop') return null;
    const id = hand.id;
    const { surface } = target;
    const size = SURFACES[surface];
    const halfW = size.width / 2 - FREE_TRAY_EDGE;
    const halfD = size.depth / 2 - FREE_TRAY_EDGE;
    const x = Math.min(halfW, Math.max(-halfW, target.x));
    const z = Math.min(halfD, Math.max(-halfD, target.z));
    if (surface === 'prep') return { id, surface, x, z, valid: false, reason: 'surface' }; // 作業台には、ピザの置き物がある。容器はほかの台に置く
    const tooClose =
      FREE_TRAY_IDS.some((other) => {
        const spot = s.freeTraySpot[other];
        return other !== id && s.trays[other] === 'table' && spot.surface === surface && Math.hypot(spot.x - x, spot.z - z) < FREE_TRAY_GAP;
      }) ||
      BOTTLE_IDS.some((b) => {
        const spot = s.bottles[b];
        return spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < FREE_TRAY_BOTTLE_GAP;
      }) ||
      this.getaNear(surface, x, z, 0.19) || // 下駄の山の上には置かない（容器の半径ぶん離す）
      this.propNear(surface, x, z, 0.17); // ピザのお皿・鉄板の山の上にも置かない
    return tooClose ? { id, surface, x, z, valid: false, reason: 'gap' } : { id, surface, x, z, valid: true };
  }

  // 手に持った物（ボトル、またはガーリック・唐辛子の容器）を台の上に置くとしたときの様子（置く前の見せ方に使う）。どちらでもなければ null
  previewPlacement(target: Target | null): BottlePreview | null {
    return this.previewBottle(target) ?? this.previewFreeTray(target);
  }

  // 手に持った焼き皿を、視点が合っている入口のベルトに置くとしたら、どこに置かれるか（縦は好きな位置、横は近い置き場にそろう）。
  // 重なるときは valid = false。焼く前か生焼けの焼き皿（もう一度焼ける皿）を持っていて、入口に視点が合っているとき以外は null
  previewOven(target: Target | null): OvenPreview | null {
    const s = this.state;
    const hand = s.hand;
    if (s.phase !== 'playing' || hand?.kind !== 'bakeDish' || !(hand.state === 'raw' || hand.state === 'half') || target?.kind !== 'ovenInlet') return null;
    if (hand.style === 'pizza' && !pizzaOf(hand).dough) return null; // 生地のない鉄板は焼けない
    const p = resolvePlacement(s.oven, target.deck, hand.style, target);
    return { deck: target.deck, style: hand.style, x: p.x, s: p.s, valid: p.valid };
  }

  // ジェットオーブンに視点が合っているときの案内（HUD 用）。オーブンに関係なければ null
  ovenHint(target: Target | null): string | null {
    const { hand, oven } = this.state;
    if (target?.kind === 'ovenStock') return hand ? null : `左クリック：焼き皿（${BAKE_DISHES[target.style].name}・テスト）を取る`;
    if (target?.kind === 'ovenInlet') {
      const name = `${OVEN_DECK_NAME[target.deck]}（${bakeTime(target.deck, this.cfg)}秒）`;
      if (hand?.kind !== 'bakeDish') return `ジェットオーブンの入口：${name}（ジェットに入る手前に置いた皿が、この秒数で出てくる）`;
      if (hand.state === 'baked') return 'もう焼けている（入口には流せない）';
      if (hand.state === 'burnt') return '焦げている（入口には流せない。右クリックで捨てる）';
      if (hand.style === 'pizza' && !pizzaOf(hand).dough) return 'ピザ生地をのせてから流す（生地のない鉄板は焼けない）';
      const p = this.previewOven(target);
      if (!p?.valid) return 'ここには置けない（ほかの皿に重なる）';
      const result = BAKE_STATE_NAME[bakeState(hand.style, hand.cooked + bakeTime(target.deck, this.cfg), this.cfg)]; // この1周で出てきたときの焼け具合
      return `左クリック：ここに流す（${name}。約${Math.ceil(timeToEmerge(p.deck, p.style, p.s, this.cfg))}秒で出てくる → ${result}）`;
    }
    if (target?.kind === 'ovenOutlet') {
      if (hand?.kind === 'geta') {
        const dish = peekDish(oven, target.deck, target.lane);
        if (!dish) return 'ジェットオーブンの出口：まだ出てきていない';
        if (dish.style !== 'doria') return '下駄に乗せられるのは、ドリア系だけ';
        const st = stateOnExit(dish, target.deck, this.cfg);
        if (st === 'baked') return '左クリック：焼けたドリアを下駄に乗せる';
        return st === 'burnt' ? '焦げている（下駄に乗せても提供できない）' : '生焼け（もう一度焼いてから、下駄に乗せる）';
      }
      if (hand) return '手がふさがっている';
      const front = peekDish(oven, target.deck, target.lane);
      if (!front) return 'ジェットオーブンの出口：まだ出てきていない';
      return `左クリック：皿を取る（${BAKE_STATE_NAME[stateOnExit(front, target.deck, this.cfg)]}）`;
    }
    return null;
  }

  // 手に持っている物を捨てる
  discard(): void {
    const s = this.state;
    if (s.phase !== 'playing' || !s.hand) return;
    if (s.hand.kind === 'bottle') {
      this.say('ボトルは捨てられない（台の上に置く）', 'info');
      return;
    }
    if (s.hand.kind === 'tray') {
      this.say(isFreeTray(s.hand.id) ? '容器は捨てられない（台の上に置く）' : 'トレー・ケースは捨てられない（サラダ台の置き場に置く）', 'info');
      return;
    }
    if (s.hand.kind === 'ipad') {
      this.say('iPadは捨てられない（壁に向けて左クリックで戻す）', 'info');
      return;
    }
    if (s.hand.kind === 'pot') {
      // 鍋は総数が決まっているので、捨てると循環から消えてしまう
      this.say('鍋は捨てられない', 'info');
      return;
    }
    if (s.hand.kind === 'panPile') {
      this.say('鉄板の山は捨てられない（台の上に置く）', 'info');
      return;
    }
    // 鉄板は枚数が決まっているので、ピザを捨てても鉄板は残る。焼く前の鉄板（まだ使っていない）はスタックに戻り、焼いたあとの鉄板は手に残る
    if (s.hand.kind === 'bakeDish' && s.hand.style === 'pizza') {
      if (s.hand.state === 'raw') {
        s.pizzaPanStock = Math.min(this.cfg.pizzaPanCount, s.pizzaPanStock + 1);
        s.hand = null;
        this.say('ピザを捨てた（鉄板はスタックに戻した）', 'info');
      } else {
        s.hand = newPan(this.cfg);
        this.say('ピザを捨てた（鉄板は手に残る。台に積むか、そのまま使う）', 'info');
      }
      return;
    }
    s.hand = null;
    this.say('捨てた', 'info');
  }

  // 実行せずに「できるか」を知るため、操作はクロージャとして返す（ハイライトにも使う）
  planInteract(target: Target): Action | null {
    const s = this.state;
    if (s.phase !== 'playing') return null;
    const hand = s.hand;

    switch (target.kind) {
      case 'noodleRack':
        if (hand) return null;
        return () => (s.hand = { kind: 'rawNoodle', id: 'noodle' });

      case 'plateStack':
        if (hand) return null;
        return () => (s.hand = { kind: 'plate', contents: [], style: target.style ?? 'plate' });

      case 'stock':
        if (target.inFridge && !this.fridgeDoorOpenFor(target)) return null; // 扉が閉まっていると取れない
        if (s.moving && fridgeItemOf(target) === s.moving) return null; // 持ち上げ中の物は取れない
        if (!hand) return () => (s.hand = stockItem(target.id, this.cfg)); // お玉1杯・パック1つ・1掴みなど
        // コーンスープのパックだけ、クリックした回数だけ重ねて持てる（最大5つ）
        if (canStackPack(hand, target.id, this.cfg)) return () => hand.packs.push(createPack(target.id));
        return null;

      case 'fridgeTray':
        // 冷蔵庫の中のトレー・ケース。取って、サラダ台の置き場に置く
        if (hand || !this.fridgeDoorOpenFor(target) || s.trays[target.id] !== 'fridge') return null;
        if (s.moving && fridgeItemOf(target) === s.moving) return null; // 持ち上げ中の物は取れない
        return () => {
          s.hand = { kind: 'tray', id: target.id };
          s.trays[target.id] = 'hand';
        };

      case 'fridgeBottle':
        // 冷蔵庫の中のボトル。取り出して、サラダ台の上に置く
        if (hand || !this.fridgeDoorOpenFor(target) || !this.bottleInFridge(target.id)) return null;
        if (s.moving && fridgeItemOf(target) === s.moving) return null; // 持ち上げ中の物は取れない
        return () => (s.hand = { kind: 'bottle', id: target.id });

      case 'traySlot': {
        const spot = target.spot ?? 0;
        const here = trayAt(s, target.id, spot);
        // 同じ区画の、空いている置き場にだけ置ける（トッピングの区画は、4種類のどれでもよい）
        if (hand?.kind === 'tray' && TRAY_ZONE[hand.id] === target.id && !here) {
          return () => {
            s.trays[hand.id] = 'table';
            s.traySpot[hand.id] = spot;
            s.hand = null;
          };
        }
        // 置いたものから1回分を取る：ほうれん草・チキン・パンチェッタ（トングで1掴み）、塩オイルソース・小エビ（お玉1杯）、ソテーソース（パック1つ）。
        // 置いた置き場からだけ取れる。置き直すときは右クリックで持ち上げる
        if (!hand && here) {
          return () => (s.hand = { kind: 'ingredient', id: TRAY_CONTENT[here] });
        }
        return null;
      }

      case 'tableTray':
        // 台の上に置いた容器（ガーリック・唐辛子）から、お玉1杯をすくう。置き直すときは右クリックで持ち上げる
        if (hand || s.trays[target.id] !== 'table') return null;
        return () => (s.hand = { kind: 'ingredient', id: TRAY_CONTENT[target.id] });

      case 'ipadWall':
        // 練習キッチンだけ。手が空なら取る、iPad を持っていれば壁に戻す
        if (s.mode !== 'practice') return null;
        if (!hand) return () => (s.hand = { kind: 'ipad' });
        if (hand.kind === 'ipad') return () => (s.hand = null);
        return null;

      case 'fridgeShelf':
        return null; // 棚板は、右クリックで持ち上げた物を置く場所（左クリックでは何も起きない）

      case 'fridgeDoor':
        // 左クリックでは開かない（右クリックで開閉）。閉まっている間だけ案内を出す
        if (s.fridgeOpen[target.unit ?? 0]) return null;
        return () => this.say('右クリックで冷蔵庫を開ける', 'info');

      case 'bottle': {
        if (hand || !s.bottles[target.id]) return null;
        return () => {
          s.hand = { kind: 'bottle', id: target.id };
          s.bottles[target.id] = null;
        };
      }

      case 'tableTop': {
        // ピザのお皿・使い終わった鉄板（の山）を、台の上に置く
        const prop = this.previewProp(target);
        if (prop) {
          if (!prop.valid || !hand) return null;
          return () => {
            const spot: TableSpot = { surface: prop.surface, x: prop.x, z: prop.z };
            if (hand.kind === 'pizzaPlate') s.pizzaPlates.push({ id: this.nextPlateId++, spot, dish: hand.dish ?? null });
            else if (hand.kind === 'bakeDish') s.panPile = { spot, count: 1 };
            else if (hand.kind === 'panPile') s.panPile = { spot, count: hand.count };
            s.hand = null;
          };
        }
        const p = this.previewPlacement(target);
        if (!p?.valid) return null;
        return () => {
          const spot: TableSpot = { surface: p.surface, x: p.x, z: p.z };
          if (isFreeTray(p.id)) {
            s.trays[p.id] = 'table';
            s.freeTraySpot[p.id] = spot;
          } else {
            s.bottles[p.id] = spot;
          }
          s.hand = null;
        };
      }

      case 'boilerBasket': {
        const b = s.boilers[target.index];
        if (b.state === 'empty' && hand?.kind === 'rawNoodle') {
          return () => {
            setNoodle(b, hand.id);
            s.hand = null;
          };
        }
        // 取り出した茹で上がりの麺は、空のかごに戻せる。戻した麺は、のびた麺と同じ扱い（ダブルクリックでショート茹で）
        if (b.state === 'empty' && hand?.kind === 'ingredient' && (hand.id === 'noodle' || hand.id === 'penne')) {
          const noodle = hand.id;
          return () => {
            returnNoodle(b, noodle);
            s.hand = null;
            this.say('のびかけ！ダブルクリックでショート茹で', 'info');
          };
        }
        if (b.state === 'lifted' && !hand) {
          return () => {
            const noodle = takeNoodle(b);
            if (noodle) s.hand = { kind: 'ingredient', id: noodle };
          };
        }
        if (b.state === 'overdue') {
          return () => this.say('のびかけ！ダブルクリックでショート茹で', 'info');
        }
        return null;
      }

      case 'boilerButton': {
        const b = s.boilers[target.index];
        if (b.state !== 'set') return null;
        return () => pressButton(b, this.cfg);
      }

      case 'plateSlot': {
        const slot = s.plateSlots[target.index];
        if (!hand && slot) {
          return () => {
            s.hand = { kind: 'plate', contents: slot, style: s.plateStyles[target.index] };
            s.plateSlots[target.index] = null;
          };
        }
        if (hand?.kind === 'plate' && !slot) {
          return () => {
            s.plateSlots[target.index] = hand.contents;
            s.plateStyles[target.index] = hand.style ?? 'plate';
            s.hand = null;
          };
        }
        // 温まったコーンスープのパックを、空のスープ皿に入れる（1皿に1つ）
        if (hand?.kind === 'pack' && slot && s.plateStyles[target.index] === 'bowl' && slot.length === 0) {
          const i = findWarmPack(hand.packs, 'cornSoup');
          if (i >= 0) {
            return () => {
              slot.push('cornSoup');
              hand.packs.splice(i, 1);
              if (hand.packs.length === 0) s.hand = null;
            };
          }
        }
        if (hand?.kind === 'ingredient' && slot && slot.length < this.cfg.maxPlateContents) {
          return () => {
            slot.push(hand.id);
            s.hand = null;
          };
        }
        // 加熱し終えた鍋の中身（ソース、または麺とソース）を皿にかける。鍋は手に残る
        if (hand?.kind === 'pot' && slot && canPour(hand.pot, slot, this.cfg.maxPlateContents)) {
          return () => pourOnto(hand.pot, slot);
        }
        return null;
      }

      case 'servePass':
        // 下駄に乗せた焼き上がりのドリア。ドリアのメニューはまだないので、出すだけ（採点なし）
        if (hand?.kind === 'bakeDish' && isBakedDoria(hand) && hand.geta) {
          return () => {
            s.hand = null;
            this.say('ドリアを提供台に出した（ドリアのメニューは未実装のため採点なし）', 'info');
          };
        }
        // 焼き上がったバッファローピザが入ったお皿（ピザのメニューもまだないので、出すだけ。採点なし）
        if (hand?.kind === 'pizzaPlate' && hand.dish && hand.dish.state === 'baked' && isBuffalo(hand.dish.pizza)) {
          return () => {
            s.hand = null;
            this.say('バッファローピザを提供台に出した（ピザのメニューは未実装のため採点なし）', 'info');
          };
        }
        if (hand?.kind !== 'plate') return null;
        return () => this.serve(hand);

      case 'potSlot': {
        const pot = s.potSlots[target.index];
        if (!hand && pot) {
          return () => {
            s.hand = { kind: 'pot', pot };
            s.potSlots[target.index] = null;
          };
        }
        // 戻せるのは洗い済みの鍋だけ
        if (hand?.kind === 'pot' && !hand.pot.dirty && !pot) {
          return () => {
            s.potSlots[target.index] = hand.pot;
            s.hand = null;
          };
        }
        return null;
      }

      case 'thrownPot': {
        // 投げた鍋は、手が空なら拾える（飛んでいる最中でも受け止められる）
        const thrown = s.thrownPots.find((t) => t.id === target.id);
        if (hand || !thrown) return null;
        return () => {
          s.hand = { kind: 'pot', pot: thrown.pot };
          s.thrownPots = s.thrownPots.filter((t) => t !== thrown);
        };
      }

      case 'ihBurner': {
        const pot = s.ihBurners[target.index];
        // 麺を入れた鍋は、混ぜ終わるまで持ち上げられない。手が空のクリックで混ぜる（3回）
        if (!hand && pot && canMix(pot)) {
          return () => {
            mixPot(pot);
            this.say(pot.mixCount >= pot.mixNeed ? 'よく混ざった！' : `混ぜる ${pot.mixCount}/${pot.mixNeed}`, 'info');
          };
        }
        if (!hand && pot) {
          return () => {
            s.hand = { kind: 'pot', pot };
            s.ihBurners[target.index] = null;
          };
        }
        if (hand?.kind === 'pot' && !pot) {
          return () => {
            s.ihBurners[target.index] = hand.pot;
            s.hand = null;
            this.tryAutoHeat(hand.pot);
          };
        }
        // 載せた鍋に、ソース（加熱前）や麺（加熱完了後）を入れる
        if (hand?.kind === 'ingredient' && pot && canAddIngredient(pot, hand.id, this.cfg.maxPotContents)) {
          return () => {
            addIngredient(pot, hand.id);
            s.hand = null;
            this.tryAutoHeat(pot);
          };
        }
        // 熱湯で温まったパック（カルボナーラ）は、加熱前の鍋に入れられる
        if (hand?.kind === 'pack' && pot) {
          const i = hand.packs.findIndex((p) => p.warm && canAddIngredient(pot, p.id, this.cfg.maxPotContents));
          if (i >= 0) {
            return () => {
              addIngredient(pot, hand.packs[i].id);
              hand.packs.splice(i, 1);
              if (hand.packs.length === 0) s.hand = null;
              this.tryAutoHeat(pot);
            };
          }
        }
        return null;
      }

      case 'hotWaterSlot': {
        const cell = s.hotWater[target.index];
        // 手に持っているパックを、空いている場所に1つ浸ける
        if (hand?.kind === 'pack' && !cell) {
          return () => {
            s.hotWater[target.index] = hand.packs.pop()!;
            if (hand.packs.length === 0) s.hand = null;
          };
        }
        // 浸けているパックを取る。手が空いているか、同じ種類のパックを持っていて、まだ持てるときだけ
        if (cell && (!hand || canStackPack(hand, cell.id, this.cfg))) {
          return () => {
            if (hand) hand.packs.push(cell);
            else s.hand = { kind: 'pack', packs: [cell] };
            s.hotWater[target.index] = null;
          };
        }
        return null;
      }

      case 'ovenStock':
        // 具材台のテスト用の焼き皿。手が空なら1枚取る
        if (hand) return null;
        return () => (s.hand = bakeItem(target.style, 0, this.cfg));

      case 'pizzaDoughStack':
        // ピザ生地のスタック。手が空なら1枚取る。鉄板を持っていれば、生地をセットする。生地を持っていれば戻す
        if (!hand) return () => (s.hand = { kind: 'pizzaDough' });
        if (hand.kind === 'pizzaDough') return () => (s.hand = null);
        if (isEmptyPan(hand)) return () => (s.hand = { ...hand, pizza: { ...emptyPan(), dough: true } });
        return null;

      case 'pizzaPanStack':
        // ピザの鉄板のスタック（枚数は決まっていて、取ると減る）。手が空なら1枚取る。生地を持っていれば、鉄板の上に生地をセットする。空の鉄板（使い終わった鉄板も同じ）を持っていれば戻す。
        // 積んだ鉄板の山を持っていれば、スタックに空きがあるぶんだけ戻して、再利用できる（入りきらない分は手に残る）
        if (!hand) {
          if (s.pizzaPanStock <= 0) return null;
          return () => {
            s.pizzaPanStock--;
            s.hand = bakeItem('pizza', 0, this.cfg, emptyPan());
          };
        }
        if (hand.kind === 'pizzaDough') {
          if (s.pizzaPanStock <= 0) return null;
          return () => {
            s.pizzaPanStock--;
            s.hand = bakeItem('pizza', 0, this.cfg, { ...emptyPan(), dough: true });
          };
        }
        if (isEmptyPan(hand) && !hand.pizza?.dough && s.pizzaPanStock < this.cfg.pizzaPanCount) {
          return () => {
            s.pizzaPanStock++;
            s.hand = null;
          };
        }
        if (hand.kind === 'panPile' && s.pizzaPanStock < this.cfg.pizzaPanCount) {
          return () => {
            const back = Math.min(hand.count, this.cfg.pizzaPanCount - s.pizzaPanStock);
            s.pizzaPanStock += back;
            s.hand = hand.count > back ? { kind: 'panPile', count: hand.count - back } : null;
            this.say(`鉄板を${back}枚、スタックに戻した（また使える）`, 'info');
          };
        }
        return null;

      case 'pizzaPlateStack':
        // 提供台の左のピザのお皿の山（なくならない）。手が空なら1枚取る。空のお皿を持っていれば戻す
        if (!hand) return () => (s.hand = { kind: 'pizzaPlate' });
        if (hand.kind === 'pizzaPlate' && !hand.dish) return () => (s.hand = null);
        return null;

      case 'pizzaPlate': {
        // 台の上のピザのお皿。焼き上がったピザを持っていれば、お皿に入れる（鉄板だけが手に残る）。手が空なら、お皿を持ち上げる（ピザが入っていれば、そのまま提供台へ）
        const plate = s.pizzaPlates.find((p) => p.id === target.id);
        if (!plate) return null;
        if (!hand) {
          return () => {
            s.hand = plate.dish ? { kind: 'pizzaPlate', dish: plate.dish } : { kind: 'pizzaPlate' };
            s.pizzaPlates = s.pizzaPlates.filter((p) => p !== plate);
          };
        }
        if (hand.kind === 'bakeDish' && hand.style === 'pizza' && hand.state === 'baked' && !plate.dish) {
          return () => {
            plate.dish = { pizza: pizzaOf(hand), state: 'baked' };
            s.hand = newPan(this.cfg);
            this.say('ピザをお皿に入れた（鉄板は、台に積むか、そのままピザに使える）', 'info');
          };
        }
        return null;
      }

      case 'panPile':
        // 台の上の、鉄板の山。空の鉄板を持っていれば、積む（右クリックで山ごと持ち上げる）
        if (!s.panPile || !hand || !isEmptyPan(hand) || hand.pizza?.dough || s.panPile.count >= this.cfg.pizzaPanCount) return null;
        return () => {
          if (s.panPile) s.panPile.count++;
          s.hand = null;
        };

      case 'pizzaSource':
        // ピザソース・ピザチーズ（レードル1杯）、モッツァレラチーズ（1個）の容器。手が空なら取る。同じ物を持っていれば戻す
        if (!hand) return () => (s.hand = { kind: 'pizzaTopping', id: target.id });
        if (hand.kind === 'pizzaTopping' && hand.id === target.id) return () => (s.hand = null);
        return null;

      case 'pizzaSlot': {
        // ピザ組み立て台。焼く前の鉄板（ピザ系）を置く／持ち上げる。置いた鉄板に、生地 → ソース → チーズ → モッツァレラ の順にのせる
        const slot = s.pizzaSlots[target.index];
        if (slot === undefined) return null;
        if (!hand && slot) {
          return () => {
            s.hand = slot;
            s.pizzaSlots[target.index] = null;
          };
        }
        if (hand?.kind === 'bakeDish' && hand.style === 'pizza' && hand.state === 'raw' && !slot) {
          return () => {
            s.pizzaSlots[target.index] = hand;
            s.hand = null;
          };
        }
        if (!slot) return null;
        if (hand?.kind === 'pizzaDough' && !pizzaOf(slot).dough) {
          return () => {
            s.pizzaSlots[target.index] = { ...slot, pizza: { ...pizzaOf(slot), dough: true } };
            s.hand = null;
          };
        }
        if (hand?.kind === 'pizzaTopping' && canAddTopping(pizzaOf(slot), hand.id)) {
          const id = hand.id;
          return () => {
            s.pizzaSlots[target.index] = { ...slot, pizza: addTopping(pizzaOf(slot), id) };
            s.hand = null;
          };
        }
        return null;
      }

      case 'getaStack':
        // 下駄の山（持ち上げている間は取れない）。手が空なら1枚取る。下駄を持っていれば戻す。焼き上がったドリアを持っていれば、下駄に乗せる
        if (s.getaMoving) return null;
        if (!hand) return () => (s.hand = { kind: 'geta' });
        if (hand.kind === 'geta') return () => (s.hand = null);
        if (isBakedDoria(hand) && !hand.geta) return () => (s.hand = { ...hand, geta: true });
        return null;

      case 'ovenInlet': {
        // 焼く前の皿を、入口のベルトの視点が合っている場所に置く（ほかの皿に重ならないとき）。置くと、ベルトで流れていく
        const p = this.previewOven(target);
        if (hand?.kind !== 'bakeDish' || !p?.valid) return null;
        return () => {
          placeDish(s.oven, target.deck, hand.style, p, hand.cooked, hand.pizza);
          s.hand = null;
          this.say(`${OVEN_DECK_NAME[target.deck]}に流した（ジェットに入る手前から ${bakeTime(target.deck, this.cfg)}秒）`, 'info');
        };
      }

      case 'ovenOutlet':
        // 下駄を持っていれば、出てきた焼き上がりのドリアを下駄に乗せて取る（ドリア系で、ちょうど焼き上がっているときだけ。生焼け・焦げは乗せられない）
        if (hand?.kind === 'geta') {
          const front = peekDish(s.oven, target.deck, target.lane);
          if (front?.style !== 'doria' || stateOnExit(front, target.deck, this.cfg) !== 'baked') return null;
          return () => {
            const dish = takeDish(s.oven, target.deck, target.lane);
            if (dish) s.hand = { ...bakeItem('doria', (dish.cooked ?? 0) + bakeTime(target.deck, this.cfg), this.cfg), geta: true };
          };
        }
        // 出口に出てきた皿を、いちばん先のものから1枚取る。この1周ぶんを足した、焼け具合の皿になる（生焼け・焦げもある）
        if (hand || !canTakeDish(s.oven, target.deck, target.lane)) return null;
        return () => {
          const dish = takeDish(s.oven, target.deck, target.lane);
          if (!dish) return;
          s.hand = bakeItem(dish.style, (dish.cooked ?? 0) + bakeTime(target.deck, this.cfg), this.cfg, dish.pizza);
          if (s.hand.state === 'burnt') this.say('焦げた！ 提供できない（右クリックで捨てる）', 'bad');
          else if (s.hand.state === 'half') this.say('生焼け（もう一度、入口に流して焼く）', 'info');
        };

      case 'washer': {
        const w = s.washer;
        if (hand?.kind === 'pot' && canInsert(w, hand.pot)) {
          return () => {
            insertPot(w, hand.pot, this.cfg);
            s.hand = null;
          };
        }
        if (!hand && w.pot && !isWashing(w)) {
          return () => {
            const pot = takeWashedPot(w);
            if (pot) s.hand = { kind: 'pot', pot };
          };
        }
        return null;
      }
    }
  }

  planDoubleClick(target: Target): Action | null {
    if (this.state.phase !== 'playing') return null;
    if (target.kind !== 'boilerBasket' && target.kind !== 'boilerButton') return null;
    const b = this.state.boilers[target.index];
    if (b.state !== 'overdue') return null;
    return () => startShortBoil(b, this.cfg);
  }

  // IHに載っている鍋の中身が既定のソース（recipe.ts の sauce）になったら、ボタンなしで加熱を始める
  private tryAutoHeat(pot: Pot): void {
    if (pot.heat !== 'cold') return;
    const recipe = findSauceRecipe(pot.contents);
    if (recipe && startHeating(pot, this.cfg)) this.say(`${recipe.name}のソース 加熱開始`, 'info');
  }

  // 提供：皿の中身と一致する最も古い伝票を消してスコア加算。なければ注文ミス
  private serve(plate: Extract<Item, { kind: 'plate' }>): void {
    const s = this.state;
    s.hand = null;

    if (plate.contents.length === 0) {
      this.say('空の皿は出せない', 'info');
      return;
    }

    const ticket = findMatchingTicket(plate.contents, s.tickets);
    if (!ticket) {
      s.score = Math.max(0, s.score - this.cfg.orderMissPenalty);
      s.combo = 0;
      s.mistakes++;
      this.say(`注文ミス！ −${this.cfg.orderMissPenalty}`, 'bad');
      return;
    }

    const menu = getMenu(ticket.menuId);
    const result = serveScore(menu, s.time - ticket.arrivedAt, s.combo, this.cfg);
    s.tickets = s.tickets.filter((t) => t.id !== ticket.id);
    s.score += result.total;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.served++;
    this.say(`${menu.name} +${result.total}（×${result.multiplier.toFixed(1)}）`, 'good');
  }

  private say(text: string, kind: Toast['kind']): void {
    this.state.toast = { text, kind, expiresAt: this.state.time + TOAST_SECONDS };
  }
}

export function describeItem(item: Item | null): string {
  if (!item) return '';
  switch (item.kind) {
    case 'rawNoodle':
      return item.id === 'penne' ? 'ペンネ' : '生麺';
    case 'ingredient':
      return INGREDIENTS[item.id].name;
    case 'pack': {
      const name = INGREDIENTS[item.packs[0].id].name;
      const warm = item.packs.filter((p) => p.warm).length;
      if (item.packs.length === 1) return `${name}パック（${warm ? '温まった' : '冷たい'}）`;
      return `${name}パック×${item.packs.length}（温まった ${warm}）`;
    }
    case 'tray':
      return TRAY_NAME[item.id];
    case 'bottle':
      return `${INGREDIENTS[item.id].name}（ボトル）`;
    case 'ipad':
      return 'iPad';
    case 'geta':
      return '下駄';
    case 'pizzaDough':
      return 'ピザ生地';
    case 'pizzaPlate':
      return item.dish ? `ピザのお皿（${pizzaName(item.dish.pizza)}）` : 'ピザのお皿（空）';
    case 'panPile':
      return `使い終わった鉄板（${item.count}枚）`;
    case 'pizzaTopping':
      return item.id === 'mozzarella' ? 'モッツァレラチーズ（1個）' : `${PIZZA_TOPPING_NAME[item.id]}（1杯）`;
    case 'bakeDish':
      if (item.geta) return `${BAKE_DISHES[item.style].name}（${BAKE_STATE_NAME[item.state]}・下駄つき）`;
      if (item.style === 'pizza') return `${pizzaName(pizzaOf(item))}（${BAKE_STATE_NAME[item.state]}）`;
      return `焼き皿（${BAKE_DISHES[item.style].name}・${BAKE_STATE_NAME[item.state]}）`;
    case 'pot': {
      const { pot } = item;
      if (pot.contents.length === 0) return pot.dirty ? '鍋（使用済み）' : '鍋';
      const heat = { cold: '未加熱', heating: '加熱中', ready: '完成' }[pot.heat];
      return `鍋（${heat}：${pot.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
    case 'plate': {
      const kind = { plate: '皿', small: '小皿', bowl: 'スープ皿', rim: 'リム小皿' }[item.style ?? 'plate'];
      return item.contents.length === 0
        ? `${kind}（空）`
        : `${kind}（${item.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
  }
}
