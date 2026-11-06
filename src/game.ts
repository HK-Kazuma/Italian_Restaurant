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
import { canStackPack, createPack, findWarmPack, soakPack, stockItem } from './pack';
import { MENU, findMatchingTicket, findSauceRecipe, getMenu } from './recipe';
import { serveScore } from './score';
import { createTicket, nextTicketInterval, pickMenu } from './tickets';
import { tutorialSteps, type GuideAt, type TutorialStep, type TutorialView } from './tutorial';
import { BOTTLE_IDS, BOTTLE_PLATE, BOTTLE_SURFACES, BOTTLE_VERB } from './bottle';
import { FRIDGE_HOME, FRIDGE_ITEM_IDS, FRIDGE_ITEM_NAME, clampOnShelf, fitsOnShelf, fridgeItemOf, returnToFridge } from './fridge';
import { BOTTLE_HOME, SURFACES } from './layout';
import { OPEN_WORLD, launchPot, stepThrownPot, type ThrowAim } from './throw';
import type { World } from './world';
import { TRAY_CONTENT, TRAY_FRIDGE_ITEM, TRAY_IDS, TRAY_NAME, TRAY_ZONE, trayAt, trayOfFridgeItem } from './tray';
import type { BottleId, BottlePreview, BottleSpot, FridgeItemId, FridgePreview, FridgeSpot, FridgeUnit, GameState, IngredientId, Item, Mode, Phase, Pot, Target, Toast, TrayId } from './types';

// クリックしたら起きること。null = 今の手持ちではこの設備に何もできない
type Action = () => void;

// 次の状態（練習 ⇄ ゲーム・チュートリアル）に引き継ぐ配置
type CarriedLayout = {
  fridge: GameState['fridgeItems']; // 冷蔵庫の中の物の置き場所
  trays: GameState['trays']; // トレー・ケースの場所（冷蔵庫 / サラダ台）。手に持っていたものは冷蔵庫に戻してある
  traySpot: GameState['traySpot']; // サラダ台に置いたトレー・ケースの置き場の番号
  bottles: GameState['bottles']; // ボトルの置き場所
};

const TOAST_SECONDS = 2.5;

// ボトルをサラダ台の上に置くときの決まり
const BOTTLE_EDGE = 0.06; // 天板の縁から、これだけ内側までしか置けない
const BOTTLE_GAP = 0.14; // ボトルどうしの最小の間隔

export class Game {
  state: GameState;
  // 投げた鍋が当たる床・台・壁。厨房を作ったら main.ts が渡す（なければ、床だけの広い空間）
  world: World = OPEN_WORLD;
  private nextThrownId = 1;

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
      fridgeOpen: [false, false],
      fridgeItems: Object.fromEntries(FRIDGE_ITEM_IDS.map((id) => [id, { ...(fridge ?? FRIDGE_HOME)[id] }])) as Record<FridgeItemId, FridgeSpot>,
      moving: null,
      bottles: Object.fromEntries(BOTTLE_IDS.map((id) => [id, { ...(layout?.bottles[id] ?? BOTTLE_HOME[id]) }])) as Record<BottleId, BottleSpot>,
      bottleShakeAt: null,
      hotWater: Array.from({ length: this.cfg.hotWaterSlotCount }, () => null),
      potSlots: Array.from({ length: this.cfg.potCount }, () => createPot(this.cfg.mixClicks)),
      ihBurners: Array.from({ length: this.cfg.ihBurnerCount }, () => null),
      thrownPots: [],
      washer: createWasher(),
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
  //  - 手に持っていたボトルは、もとの場所（layout.ts）に戻る
  // 最初（引き継ぐ物がない）は undefined
  private carriedLayout(): CarriedLayout | undefined {
    const prev = this.state;
    if (!prev) return undefined;
    const inHand = TRAY_IDS.filter((id) => prev.trays[id] === 'hand');
    return {
      fridge: returnToFridge(prev.fridgeItems, inHand.map((id) => TRAY_FRIDGE_ITEM[id])),
      trays: Object.fromEntries(TRAY_IDS.map((id) => [id, prev.trays[id] === 'hand' ? 'fridge' : prev.trays[id]])) as GameState['trays'],
      traySpot: { ...prev.traySpot },
      bottles: Object.fromEntries(BOTTLE_IDS.map((id) => [id, { ...(prev.bottles[id] ?? BOTTLE_HOME[id]) }])) as Record<BottleId, BottleSpot>,
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
  //  - 手が空で、サラダ台のトレー置き場に置いたトレー・ケースに視点が合っていれば、それを手に持ち上げる（左クリックで別の置き場に置き直せる）
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
    const placed = this.trayAtSlot(target);
    if (!s.hand && placed) {
      s.hand = { kind: 'tray', id: placed };
      s.trays[placed] = 'hand';
      this.say(`${TRAY_NAME[placed]}を持ち上げた（置き場に視点を合わせて左クリックで置く）`, 'info');
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
    return tray ? this.state.trays[tray] === 'fridge' : true;
  }

  // 視点が合っているトレー置き場に置いてあるトレー・ケース（なければ null。HUD の案内に使う）
  trayAtSlot(target: Target | null): TrayId | null {
    return target?.kind === 'traySlot' ? trayAt(this.state, target.id, target.spot ?? 0) : null;
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
    const tooClose = BOTTLE_IDS.some((id) => {
      const spot = s.bottles[id];
      return id !== hand.id && spot?.surface === surface && Math.hypot(spot.x - x, spot.z - z) < BOTTLE_GAP;
    });
    return tooClose
      ? { id: hand.id, surface, x, z, valid: false, reason: 'gap' }
      : { id: hand.id, surface, x, z, valid: true };
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
      this.say('トレー・ケースは捨てられない（サラダ台の置き場に置く）', 'info');
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
        const p = this.previewBottle(target);
        if (!p?.valid) return null;
        return () => {
          s.bottles[p.id] = { surface: p.surface, x: p.x, z: p.z };
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
    case 'pot': {
      const { pot } = item;
      if (pot.contents.length === 0) return pot.dirty ? '鍋（使用済み）' : '鍋';
      const heat = { cold: '未加熱', heating: '加熱中', ready: '完成' }[pot.heat];
      return `鍋（${heat}：${pot.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
    case 'plate': {
      const kind = { plate: '皿', small: '小皿', bowl: 'スープ皿' }[item.style ?? 'plate'];
      return item.contents.length === 0
        ? `${kind}（空）`
        : `${kind}（${item.contents.map((id) => INGREDIENTS[id].name).join('・')}）`;
    }
  }
}
