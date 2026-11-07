import { BOTTLE_ACTION, BOTTLE_FRIDGE_ITEM, BOTTLE_PLATE, isFridgeBottle } from './bottle';
import type { GameConfig } from './config';
import { FRIDGE_ITEM_IDS } from './fridge';
import { INGREDIENTS } from './ingredients';
import { BOTTLE_HOME, FREE_TRAY_HOME } from './layout';
import { warmTime } from './pack';
import { isNoodle } from './pot';
import { getMenu, type MenuItem } from './recipe';
import { TRAY_FRIDGE_ITEM, TRAY_NAME, TRAY_ZONE, freeTraySpots, isFreeTray } from './tray';
import type { BottleId, FridgeBottleId, FridgeItemId, FridgeUnit, GameState, IngredientId, NoodleKind, Pot, SurfaceId, Target, TrayId } from './types';

// チュートリアル：練習キッチンで、選んだメニューを「次はここ」と案内されながら作る。
//
// 1つのメニューは、順番に並んだ「工程」。それぞれの工程が
//   - label … 一覧に出す短い言い方
//   - at    … 3D の矢印が指す先（設備、または台の上の位置）。いまの状態で変わる（手に持った物で行き先が切り替わる）
//   - done  … その工程が終わったか。ゲームの状態（GameState）だけで決まる
//   - hint  … いまの状況に合わせた一言（待ち時間の残り、手がふさがっている、など）
//   - progress … 何回かくり返す工程の進み具合（「1/2」など）。工程の言い方に添えて見せる
// を持つ。Game が毎フレーム done を見て、終わった工程から次へ進める（戻らない）。
//
// 新しいメニューを足すときは、recipe.ts の MENU に加えたあと、このファイルの RECIPES に工程の並びを足す
// （足し忘れると tutorial.test.ts が失敗する）。工程の部品は makeKit の中にある。

// 台の上の位置を指す（ボトルを元の場所に戻すときなど、設備がない場所）
export type GuideSpot = { kind: 'surfaceSpot'; surface: SurfaceId; x: number; z: number };
// 矢印の指す先。Target は一部の項目だけ書いてよい（書かなかった項目は問わない。例：{ kind: 'stock', id: 'cheese' }）
export type GuideAt = Target | GuideSpot;

export type TutorialStep = {
  label: string;
  at: (s: GameState) => GuideAt | null;
  done: (s: GameState) => boolean;
  hint?: (s: GameState) => string | null;
  progress?: (s: GameState) => string | null;
};

// HUD に出す、いまのチュートリアルの様子
export type TutorialView = {
  menuName: string;
  labels: string[]; // 全工程の言い方
  step: number; // いまの工程の番号（最後まで終わると、チュートリアルごと終わるので、見えなくなる）
  hint: string | null; // いまの工程への一言
  progress: string | null; // いまの工程の進み具合（「1/2」など）
};

// 実際の設備（Target）が、矢印の指定（spec）に当てはまるか。spec に書いた項目だけ比べる
export function matchesTarget(actual: Target, spec: GuideAt): boolean {
  if (spec.kind === 'surfaceSpot' || actual.kind !== spec.kind) return false;
  if (actual.kind === 'plateStack' && spec.kind === 'plateStack') {
    return (actual.style ?? 'plate') === (spec.style ?? 'plate'); // 省略 = ふつうの皿
  }
  if (actual.kind === 'traySlot' && spec.kind === 'traySlot') {
    // 同じ種類の置き場が複数ある。番号を省略したものは 0 番（spec が番号を書かなければ、どの置き場でもよい）
    return actual.id === spec.id && (spec.spot === undefined || (actual.spot ?? 0) === spec.spot);
  }
  if (actual.kind === 'fridgeDoor' && spec.kind === 'fridgeDoor') {
    // 冷蔵庫は2台ある。unit を省略した設備は 0 番（spec が unit を書かなければ、どちらの冷蔵庫でもよい）
    return spec.unit === undefined || (actual.unit ?? 0) === spec.unit;
  }
  const a = actual as Record<string, unknown>;
  const b = spec as Record<string, unknown>;
  return Object.keys(b).every((k) => a[k] === b[k]);
}

// --- 状態の読み取り ---

function allPots(s: GameState): Pot[] {
  const pots: (Pot | null)[] = [
    ...s.ihBurners,
    ...s.potSlots,
    s.washer.pot,
    ...s.thrownPots.map((t) => t.pot),
    s.hand?.kind === 'pot' ? s.hand.pot : null,
  ];
  return pots.filter((p): p is Pot => p !== null);
}

// 皿の中身の一覧（台の上の皿と、手に持っている皿）
function allPlates(s: GameState): IngredientId[][] {
  const plates = s.plateSlots.filter((p): p is IngredientId[] => p !== null);
  if (s.hand?.kind === 'plate') plates.push(s.hand.contents);
  return plates;
}

const count = (list: readonly IngredientId[], id: IngredientId) => list.filter((x) => x === id).length;
const plateHasAny = (s: GameState, ids: readonly IngredientId[]) => allPlates(s).some((p) => p.some((id) => ids.includes(id)));
const noodleIds: readonly IngredientId[] = ['noodle', 'penne'];

// 鍋が載っているIHの口（なければ -1）
const burnerWithPot = (s: GameState) => s.ihBurners.findIndex((p) => p !== null);

// --- 矢印の指す先 ---

// 冷蔵庫は2台ある。矢印が冷蔵庫の中の物を指すとき、その物がいま入っている冷蔵庫（どちらでもなければ 0）
function fridgeUnitFor(s: GameState, at: GuideAt | null): FridgeUnit {
  if (!at || at.kind === 'surfaceSpot') return 0;
  let item: FridgeItemId | null = null;
  if (at.kind === 'fridgeTray') item = TRAY_FRIDGE_ITEM[at.id];
  else if (at.kind === 'fridgeBottle') item = BOTTLE_FRIDGE_ITEM[at.id];
  else if (at.kind === 'stock' && (FRIDGE_ITEM_IDS as string[]).includes(at.id)) item = at.id as FridgeItemId;
  return item ? s.fridgeItems[item].unit : 0;
}
const fridgeDoorOf = (unit: FridgeUnit): Target => ({ kind: 'fridgeDoor', unit });
const fridgeName = (unit: FridgeUnit) => (unit === 1 ? '右側の冷蔵庫' : '冷蔵庫');
const where = {
  burnerWithPot: (s: GameState): Target | null => {
    const i = burnerWithPot(s);
    return i >= 0 ? { kind: 'ihBurner', index: i } : null;
  },
  emptyBurner: (s: GameState): Target | null => {
    const i = s.ihBurners.findIndex((p) => p === null);
    return i >= 0 ? { kind: 'ihBurner', index: i } : null;
  },
  hotWaterFree: (s: GameState): Target => ({ kind: 'hotWaterSlot', index: Math.max(0, s.hotWater.findIndex((p) => p === null)) }),
  hotWaterWith: (s: GameState, id: IngredientId, warm: boolean): Target => ({
    kind: 'hotWaterSlot',
    index: Math.max(0, s.hotWater.findIndex((p) => p?.id === id && (!warm || p.warm))),
  }),
};

type Range = { from: number; to: number }; // 皿の置き場の番号の範囲 [from, to)

type CarrySpec = {
  label: string;
  from: (s: GameState) => GuideAt | null; // 手が空のとき、取りに行く先
  fridge?: boolean; // from が冷蔵庫の中（その冷蔵庫の扉が閉まっていれば、先に扉を指す）
  holding: (s: GameState) => boolean; // 手に持っているのが、この工程の物か
  to: (s: GameState) => GuideAt | null; // 持っているとき、運ぶ先
  done: (s: GameState) => boolean;
  hint?: (s: GameState, holding: boolean) => string | null;
  progress?: (s: GameState) => string | null;
};

// 「取って、運ぶ」工程。矢印は、手が空なら取る場所、持っていれば置く場所を指す
function carry(c: CarrySpec): TutorialStep {
  return {
    label: c.label,
    done: c.done,
    progress: c.progress,
    at: (s) => {
      if (c.holding(s)) return c.to(s);
      const from = c.from(s);
      if (c.fridge) {
        const unit = fridgeUnitFor(s, from);
        if (!s.fridgeOpen[unit]) return fridgeDoorOf(unit);
      }
      return from;
    },
    hint: (s) => {
      const holding = c.holding(s);
      if (holding) return c.hint?.(s, true) ?? null;
      if (c.fridge) {
        const unit = fridgeUnitFor(s, c.from(s));
        if (!s.fridgeOpen[unit]) return `${fridgeName(unit)}の扉を右クリックで開ける`;
      }
      if (s.hand) return '手がふさがっています（置くか、右クリックで捨てる）';
      return c.hint?.(s, false) ?? null;
    },
  };
}

function makeKit(menu: MenuItem, cfg: GameConfig) {
  const pasta: Range = { from: 0, to: cfg.plateSlotCount };
  const salad: Range = { from: cfg.plateSlotCount, to: cfg.plateSlotCount + cfg.saladSlotCount };
  const home = menu.station === 'pasta' ? pasta : salad; // このメニューを盛り付ける台
  const sauce = menu.sauce ?? [];
  const served = (s: GameState) => s.served > 0; // 提供まで済んでいれば、それ以前の工程はすべて終わっている

  // 盛り付け中の皿の置き場（なければ -1）と、空いている置き場
  const plateIndex = (s: GameState): number => {
    for (let i = home.from; i < home.to; i++) if (s.plateSlots[i]) return i;
    return s.plateSlots.findIndex((p) => p !== null);
  };
  const freeSlot = (s: GameState): number => {
    for (let i = home.from; i < home.to; i++) if (!s.plateSlots[i]) return i;
    return s.plateSlots.findIndex((p) => p === null);
  };
  const slotAt = (i: number): Target | null => (i >= 0 ? { kind: 'plateSlot', index: i } : null);
  const plateAt = (s: GameState) => slotAt(plateIndex(s));
  const freeSlotAt = (s: GameState) => slotAt(freeSlot(s));

  // 熱湯で温めたパックが、もう熱湯の外（手・鍋・皿）にあるか
  const packBeyond = (s: GameState, id: IngredientId) =>
    (s.hand?.kind === 'pack' && s.hand.packs.some((p) => p.id === id && p.warm)) ||
    allPots(s).some((p) => p.contents.includes(id)) ||
    plateHasAny(s, [id]) ||
    served(s);

  // 冷蔵庫の扉を開ける（unit: 0 = 最初の冷蔵庫、1 = 右側の冷蔵庫）
  const openFridge = (unit: FridgeUnit = 0): TutorialStep => ({
    label: `${fridgeName(unit)}の扉を右クリックで開ける`,
    at: () => fridgeDoorOf(unit),
    done: (s) => s.fridgeOpen[unit],
    hint: () => `${fridgeName(unit)}に視点を合わせて、右クリック`,
  });

  // 茹で麺器：生麺（またはペンネ）を取って、かごにセットする
  const noodleToBasket = (kind: NoodleKind = 'noodle') =>
    carry({
      label: kind === 'penne' ? 'ペンネを取って、茹で麺器のかごに入れる' : '生麺を取って、茹で麺器のかごに入れる',
      from: () => (kind === 'penne' ? { kind: 'stock', id: 'penne' } : { kind: 'noodleRack' }),
      fridge: kind === 'penne',
      holding: (s) => s.hand?.kind === 'rawNoodle' && s.hand.id === kind,
      to: (s) => ({ kind: 'boilerBasket', index: Math.max(0, s.boilers.findIndex((b) => b.state === 'empty')) }),
      done: (s) => s.boilers.some((b) => b.state !== 'empty') || served(s),
    });

  const press: TutorialStep = {
    label: 'ボタンを押して、茹で始める',
    at: (s) => ({ kind: 'boilerButton', index: Math.max(0, s.boilers.findIndex((b) => b.state === 'set')) }),
    done: (s) => s.boilers.some((b) => b.state !== 'empty' && b.state !== 'set') || served(s),
    hint: () => 'かごの手前の赤いボタンを左クリック。茹でている間に、ほかの準備を進めよう',
  };

  // 茹で上がった麺を取って、加熱した鍋（Aパターン）か、皿（Bパターン）へ
  const noodleOut = (dest: 'pot' | 'plate') =>
    carry({
      label: dest === 'pot' ? '茹で上がった麺を、加熱した鍋に入れる' : '茹で上がった麺を、皿に盛る',
      from: (s) => {
        const pick = (state: string) => s.boilers.findIndex((b) => b.state === state);
        const i = [pick('lifted'), pick('overdue'), pick('shortBoil'), pick('boiling')].find((x) => x >= 0) ?? 0;
        return { kind: 'boilerBasket', index: i };
      },
      holding: (s) => s.hand?.kind === 'ingredient' && isNoodle(s.hand.id),
      to: (s) => (dest === 'pot' ? where.burnerWithPot(s) : plateAt(s)),
      done: (s) =>
        (dest === 'pot' && allPots(s).some((p) => p.contents.some(isNoodle))) || plateHasAny(s, noodleIds) || served(s),
      hint: (s, holding) => {
        if (holding) return dest === 'pot' && !allPots(s).some((p) => p.heat === 'ready') ? 'ソースの加熱が終わってから入れる' : null;
        const b = (state: string) => s.boilers.find((x) => x.state === state);
        if (b('lifted')) return '麺が上がりました。かごを左クリックで取る';
        if (b('overdue')) return 'のびかけ！かごをダブルクリックでショート茹で（3秒）';
        const short = b('shortBoil');
        if (short) return `ショート茹で中… あと${Math.ceil(short.timer)}秒`;
        const boiling = b('boiling');
        return boiling ? `茹で上がるまで待つ… あと${Math.ceil(boiling.timer)}秒` : null;
      },
    });

  // 皿・小皿・スープ皿・リム小皿・サラダベースを取って、台に置く
  const plate = (style: 'plate' | 'small' | 'bowl' | 'rim' | 'saladBase' = 'plate') => {
    const names = { plate: '皿', small: '小皿', bowl: 'スープ皿', rim: 'リム小皿', saladBase: 'サラダベース' };
    const place = menu.station === 'pasta' ? '左の台' : 'サラダ台';
    return carry({
      label: `${names[style]}を取って、${place}に置く`,
      from: () =>
        style === 'saladBase'
          ? { kind: 'stock', id: 'saladBase' }
          : { kind: 'plateStack', style: style === 'plate' ? undefined : style },
      fridge: style === 'saladBase',
      holding: (s) => s.hand?.kind === 'plate',
      to: freeSlotAt,
      done: (s) => s.plateSlots.some((p) => p !== null) || served(s),
    });
  };

  // 鍋を取って、IHに置く
  const potToBurner = carry({
    label: '鍋を取って、IHに置く',
    from: (s) => ({ kind: 'potSlot', index: Math.max(0, s.potSlots.findIndex((p) => p !== null)) }),
    holding: (s) => s.hand?.kind === 'pot',
    to: where.emptyBurner,
    done: (s) => s.ihBurners.some((p) => p !== null) || served(s),
  });

  // 冷蔵庫のケース・トレーを、サラダ台の置き場に置く（矢印は、その種類を置ける空いている置き場を指す）。
  // ガーリック・唐辛子の容器は置き場がなく、台の上のどこに置いてもよい（矢印は標準の場所を指す）
  const trayToTable = (id: TrayId) =>
    carry({
      label: isFreeTray(id) ? `${TRAY_NAME[id]}を取って、台の上に置く` : `${TRAY_NAME[id]}を取って、サラダ台の置き場に置く`,
      from: () => ({ kind: 'fridgeTray', id }),
      fridge: true,
      holding: (s) => s.hand?.kind === 'tray' && s.hand.id === id,
      to: (s): GuideAt => {
        const zone = TRAY_ZONE[id];
        if (zone === null) return { kind: 'surfaceSpot', ...FREE_TRAY_HOME[id as keyof typeof FREE_TRAY_HOME] };
        return { kind: 'traySlot', id: zone, spot: freeTraySpots(s, zone)[0] };
      },
      done: (s) => s.trays[id] === 'table' || served(s),
    });

  // 置き場に置いたトレー・ケース（置いた置き場を指す。台の上に置いた容器は、その容器を指す）
  const trayPlaced = (id: TrayId) => (s: GameState): GuideAt => {
    const zone = TRAY_ZONE[id];
    return zone === null ? { kind: 'tableTray', id: id as 'garlic' | 'chili' } : { kind: 'traySlot', id: zone, spot: s.traySpot[id] };
  };

  // ソースの材料を、IHの鍋に入れる（n 回）。そろうと自動で加熱が始まる
  const sauceToPot = (id: IngredientId, n: number, from: GuideAt | ((s: GameState) => GuideAt), opts: { fridge?: boolean } = {}) => {
    const have = (s: GameState) => Math.max(0, ...allPots(s).map((p) => count(p.contents, id)));
    return carry({
      label: n > 1 ? `${INGREDIENTS[id].name}を${n}回、鍋に入れる` : `${INGREDIENTS[id].name}を鍋に入れる`,
      from: (s) => (typeof from === 'function' ? from(s) : from),
      fridge: opts.fridge,
      holding: (s) => s.hand?.kind === 'ingredient' && s.hand.id === id,
      to: where.burnerWithPot,
      done: (s) => have(s) >= n || allPots(s).some((p) => p.heat !== 'cold') || plateHasAny(s, [id]) || served(s),
      progress: (s) => (n > 1 ? `${Math.min(have(s), n)}/${n}` : null),
    });
  };

  const waitHeat: TutorialStep = {
    label: 'ソースの加熱が終わるまで待つ',
    at: where.burnerWithPot,
    done: (s) => allPots(s).some((p) => p.heat === 'ready') || plateHasAny(s, sauce) || served(s),
    hint: (s) => {
      const pot = s.ihBurners.find((p) => p !== null);
      if (!pot) return null;
      if (pot.heat === 'heating') return `加熱中… あと${Math.ceil(pot.heatTimer)}秒（焦げの心配はまだありません）`;
      return pot.heat === 'cold' ? 'ソースの材料がそろうと、自動で加熱が始まります' : null;
    },
  };

  const mix: TutorialStep = {
    label: `鍋を${cfg.mixClicks}回クリックして混ぜる`,
    at: where.burnerWithPot,
    done: (s) =>
      allPots(s).some((p) => p.contents.some(isNoodle) && p.mixCount >= p.mixNeed) || plateHasAny(s, noodleIds) || served(s),
    hint: (s) => (s.hand ? '手を空にしてから、鍋をクリック' : null),
    progress: (s) => {
      const pot = s.ihBurners.find((p) => p !== null);
      return pot ? `${pot.mixCount}/${pot.mixNeed}` : null;
    },
  };

  // 加熱した鍋を持って、皿にかける
  const pour = carry({
    label: '鍋を持って、皿にかける',
    from: where.burnerWithPot,
    holding: (s) => s.hand?.kind === 'pot',
    to: (s) => plateAt(s) ?? freeSlotAt(s),
    done: (s) => plateHasAny(s, sauce) || served(s),
  });

  // 使い終わった鍋を洗浄機へ。洗い終わったら、鍋置き場へ戻す
  const wash = carry({
    label: '使い終わった鍋を、洗浄機に入れる',
    from: where.burnerWithPot,
    holding: (s) => s.hand?.kind === 'pot',
    to: () => ({ kind: 'washer' }),
    done: (s) => s.washer.pot !== null || served(s),
  });
  const returnPot = carry({
    label: '洗い終わった鍋を、鍋置き場に戻す',
    from: (s) => where.burnerWithPot(s) ?? { kind: 'washer' },
    holding: (s) => s.hand?.kind === 'pot',
    to: (s) =>
      s.hand?.kind === 'pot' && s.hand.pot.dirty
        ? { kind: 'washer' }
        : { kind: 'potSlot', index: Math.max(0, s.potSlots.findIndex((p) => p === null)) },
    done: (s) => s.potSlots.every((p) => p !== null),
    hint: (s, holding) => {
      if (!holding && s.washer.pot?.dirty) return `洗浄中… あと${Math.ceil(s.washer.timer)}秒`;
      return holding && s.hand?.kind === 'pot' && s.hand.pot.dirty ? '使い終わった鍋は、先に洗浄機へ' : null;
    },
  });

  // 具材・トッピングを取って、皿にのせる（n 回くり返す工程は、進み具合が出る）
  const top = (id: IngredientId, from?: GuideAt | ((s: GameState) => GuideAt), n = 1) => {
    const onPlate = (s: GameState) => Math.max(0, ...allPlates(s).map((p) => count(p, id)));
    return carry({
      label:
        n > 1
          ? `${INGREDIENTS[id].name}を${n}回、${menu.station === 'pasta' ? '皿' : 'サラダ'}にのせる`
          : `${INGREDIENTS[id].name}を取って、${menu.station === 'pasta' ? '皿' : 'サラダ'}にのせる`,
      from: (s) => (typeof from === 'function' ? from(s) : (from ?? { kind: 'stock', id })),
      holding: (s) => s.hand?.kind === 'ingredient' && s.hand.id === id,
      to: plateAt,
      done: (s) => onPlate(s) >= n || served(s),
      progress: (s) => (n > 1 ? `${Math.min(onPlate(s), n)}/${n}` : null),
    });
  };

  // ボトル：取って、皿に右クリックでかけ（振り）、元の場所に戻す。手を空けないと、皿を持てない。
  // ドレッシング・パプリカパウダー・ガルムソースは、冷蔵庫から取り出す（元の場所は、サラダ台の上）
  const bottle = (id: BottleId): TutorialStep => {
    const onPlate = (s: GameState) => plateHasAny(s, [id]);
    const holding = (s: GameState) => s.hand?.kind === 'bottle' && s.hand.id === id;
    const spot = BOTTLE_HOME[id];
    const plateTarget = (s: GameState) => (BOTTLE_PLATE[id] === 'salad' ? slotAt(plateIndex(s)) : plateAt(s));
    const inFridge = (s: GameState) => isFridgeBottle(id) && s.bottles[id] === null && !holding(s);
    return {
      label: BOTTLE_ACTION[id],
      at: (s) => {
        if (inFridge(s)) {
          const unit = s.fridgeItems[BOTTLE_FRIDGE_ITEM[id as FridgeBottleId]].unit;
          return s.fridgeOpen[unit] ? { kind: 'fridgeBottle', id: id as FridgeBottleId } : fridgeDoorOf(unit);
        }
        if (!holding(s)) return { kind: 'bottle', id };
        return onPlate(s) ? { kind: 'surfaceSpot', surface: spot.surface, x: spot.x, z: spot.z } : plateTarget(s);
      },
      done: (s) => (onPlate(s) && s.bottles[id] !== null) || served(s),
      hint: (s) => {
        if (!holding(s)) {
          if (s.hand) return '手がふさがっています（置くか、右クリックで捨てる）';
          if (inFridge(s)) {
            const unit = s.fridgeItems[BOTTLE_FRIDGE_ITEM[id as FridgeBottleId]].unit;
            if (!s.fridgeOpen[unit]) return `${fridgeName(unit)}の扉を右クリックで開ける`;
          }
          return 'ボトルを左クリックで取る';
        }
        return onPlate(s) ? '元の場所に置く（台の上を左クリック）' : `皿に視点を合わせて、右クリック（${BOTTLE_ACTION[id]}）`;
      },
    };
  };

  // 熱湯に浸けて温めるパック（カルボナーラ・コーンスープ）
  const packToHotWater = (id: 'carbonaraSauce' | 'cornSoup') =>
    carry({
      label: `${INGREDIENTS[id].name}のパックを取って、熱湯に浸ける`,
      from: () => ({ kind: 'stock', id }),
      fridge: true,
      holding: (s) => s.hand?.kind === 'pack' && s.hand.packs.some((p) => p.id === id),
      to: where.hotWaterFree,
      done: (s) => s.hotWater.some((p) => p?.id === id) || packBeyond(s, id),
    });
  const warmUp = (id: 'carbonaraSauce' | 'cornSoup'): TutorialStep => {
    const need = warmTime(id, cfg) ?? 0;
    return {
      label: `パックが温まるまで待つ（${need}秒以上）`,
      at: (s) => where.hotWaterWith(s, id, false),
      done: (s) => s.hotWater.some((p) => p?.id === id && p.warm) || packBeyond(s, id),
      hint: (s) => {
        const pack = s.hotWater.find((p) => p?.id === id);
        return pack ? `浸けた時間 ${Math.floor(pack.soak)}/${need}秒` : null;
      },
    };
  };
  const warmPackTo = (id: 'carbonaraSauce' | 'cornSoup', dest: 'pot' | 'bowl') =>
    carry({
      label: dest === 'pot' ? '温まったパックを取って、鍋に入れる' : '温まったパックを取って、スープ皿に入れる',
      from: (s) => where.hotWaterWith(s, id, true),
      holding: (s) => s.hand?.kind === 'pack' && s.hand.packs.some((p) => p.id === id && p.warm),
      to: (s) => (dest === 'pot' ? where.burnerWithPot(s) : plateAt(s)),
      done: (s) => allPots(s).some((p) => p.contents.includes(id) || p.heat !== 'cold') || plateHasAny(s, [id]) || served(s),
    });

  // 完成した料理を取って、提供台へ
  const serve = carry({
    label: '完成した料理を取って、提供台に置く',
    from: plateAt,
    holding: (s) => s.hand?.kind === 'plate',
    to: () => ({ kind: 'servePass' }),
    done: served,
    hint: (s) => (s.mistakes > 0 ? '中身が伝票と違います… iPad のチュートリアルから、最初からやり直せます' : null),
  });

  return {
    openFridge,
    noodleToBasket,
    press,
    noodleOut,
    plate,
    potToBurner,
    trayToTable,
    trayPlaced,
    sauceToPot,
    waitHeat,
    mix,
    pour,
    wash,
    returnPot,
    top,
    bottle,
    packToHotWater,
    warmUp,
    warmPackTo,
    serve,
  };
}

type Kit = ReturnType<typeof makeKit>;

const stock = (id: IngredientId): GuideAt => ({ kind: 'stock', id });

// メニューごとの工程の並び（recipe.ts の MENU の id と同じキー）。
// 長く待つ作業（麺を茹でる）を先に始めて、待ち時間にソースや皿の準備をする、という段取りの順に並べる
const RECIPES: Record<string, (k: Kit) => TutorialStep[]> = {
  tarako: (k) => [k.noodleToBasket(), k.press, k.plate(), k.noodleOut('plate'), k.top('tarakoSauce'), k.top('nori'), k.serve],
  meat: (k) => [
    k.noodleToBasket(),
    k.press,
    k.openFridge(),
    k.potToBurner,
    k.sauceToPot('meatSauce', 2, stock('meatSauce'), { fridge: true }),
    k.plate(),
    k.waitHeat,
    k.noodleOut('pot'),
    k.mix,
    k.pour,
    k.wash,
    k.top('cheese'),
    k.bottle('parsley'),
    k.serve,
    k.returnPot,
  ],
  parma: (k) => [
    k.noodleToBasket(),
    k.press,
    k.openFridge(),
    k.trayToTable('tomatoSauce'),
    k.trayToTable('pancetta'),
    k.potToBurner,
    k.sauceToPot('tomatoSauce', 1, k.trayPlaced('tomatoSauce')),
    k.sauceToPot('pancetta', 1, k.trayPlaced('pancetta')),
    k.plate(),
    k.waitHeat,
    k.noodleOut('pot'),
    k.mix,
    k.pour,
    k.wash,
    k.top('cheese'),
    k.serve,
    k.returnPot,
  ],
  peperoncino: (k) => [
    k.noodleToBasket(),
    k.press,
    k.openFridge(),
    k.trayToTable('saltOil'),
    k.trayToTable('garlic'),
    k.trayToTable('chili'),
    k.potToBurner,
    k.sauceToPot('saltOilSauce', 1, k.trayPlaced('saltOil')), // 置いた置き場を指す
    k.sauceToPot('garlic', 1, k.trayPlaced('garlic')),
    k.sauceToPot('chili', 1, k.trayPlaced('chili')),
    k.plate(),
    k.waitHeat,
    k.noodleOut('plate'),
    k.pour,
    k.wash,
    k.bottle('parsley'),
    k.serve,
    k.returnPot,
  ],
  carbonara: (k) => [
    k.noodleToBasket(),
    k.press,
    k.openFridge(),
    k.packToHotWater('carbonaraSauce'),
    k.potToBurner,
    k.warmUp('carbonaraSauce'),
    k.warmPackTo('carbonaraSauce', 'pot'),
    k.plate(),
    k.waitHeat,
    k.noodleOut('plate'),
    k.pour,
    k.wash,
    k.top('cheese'),
    k.bottle('blackPepper'),
    k.serve,
    k.returnPot,
  ],
  penne: (k) => [
    k.openFridge(),
    k.trayToTable('tomatoSauce'),
    k.trayToTable('garlic'),
    k.trayToTable('chili'),
    k.noodleToBasket('penne'),
    k.press,
    k.potToBurner,
    k.sauceToPot('tomatoSauce', 1, k.trayPlaced('tomatoSauce')),
    k.sauceToPot('garlic', 1, k.trayPlaced('garlic')),
    k.sauceToPot('chili', 1, k.trayPlaced('chili')),
    k.plate(),
    k.waitHeat,
    k.noodleOut('pot'),
    k.mix,
    k.pour,
    k.wash,
    k.bottle('parsley'),
    k.serve,
    k.returnPot,
  ],
  squidInk: (k) => [
    k.noodleToBasket(),
    k.press,
    k.openFridge(1), // イカ墨ソースとイカは、右側の冷蔵庫の中から直接取る
    k.potToBurner,
    k.sauceToPot('squidInkSauce', 1, stock('squidInkSauce'), { fridge: true }),
    k.sauceToPot('squid', 1, stock('squid'), { fridge: true }),
    k.plate(),
    k.waitHeat,
    k.noodleOut('pot'),
    k.mix,
    k.pour,
    k.wash,
    k.bottle('parsley'),
    k.serve,
    k.returnPot,
  ],
  mushroomCream: (k) => [
    k.noodleToBasket(),
    k.press,
    k.openFridge(1), // ホワイトソース缶ときのこは、右側の冷蔵庫
    k.trayToTable('mushroom'),
    k.trayToTable('spinach'),
    k.trayToTable('pancetta'),
    k.trayToTable('saltOil'),
    k.potToBurner,
    k.sauceToPot('whiteSauce', 1, stock('whiteSauce'), { fridge: true }),
    k.sauceToPot('spinach', 1, k.trayPlaced('spinach')),
    k.sauceToPot('pancetta', 1, k.trayPlaced('pancetta')),
    k.sauceToPot('mushroom', 1, k.trayPlaced('mushroom')),
    k.sauceToPot('saltOilSauce', 1, k.trayPlaced('saltOil')),
    k.plate(),
    k.waitHeat,
    k.noodleOut('plate'),
    k.pour,
    k.wash,
    k.top('cheese'),
    k.bottle('blackPepper'),
    k.serve,
    k.returnPot,
  ],
  spinach: (k) => [
    k.openFridge(),
    k.trayToTable('spinach'),
    k.trayToTable('pancetta'),
    k.trayToTable('sauteSauce'),
    k.potToBurner,
    k.sauceToPot('spinach', 2, k.trayPlaced('spinach')),
    k.sauceToPot('pancetta', 1, k.trayPlaced('pancetta')),
    k.sauceToPot('sauteSauce', 1, k.trayPlaced('sauteSauce')),
    k.plate('small'),
    k.waitHeat,
    k.pour,
    k.wash,
    k.serve,
    k.returnPot,
  ],
  shrimpSalad: (k) => [
    k.openFridge(),
    k.trayToTable('shrimp'),
    k.plate('saladBase'),
    k.top('shrimp', k.trayPlaced('shrimp')),
    k.bottle('dressing'),
    k.bottle('paprika'),
    k.serve,
  ],
  chickenSalad: (k) => [
    k.openFridge(),
    k.trayToTable('chicken'),
    k.plate('saladBase'),
    k.top('chicken', k.trayPlaced('chicken')),
    k.bottle('dressing'),
    k.bottle('paprika'),
    k.serve,
  ],
  wakameSalad: (k) => [
    k.openFridge(1), // わかめは、右側の冷蔵庫
    k.trayToTable('wakame'),
    k.plate('saladBase'),
    k.top('wakame', k.trayPlaced('wakame'), 2),
    k.bottle('dressing'),
    k.bottle('paprika'),
    k.serve,
  ],
  shrimpCocktail: (k) => [
    k.openFridge(1),
    k.trayToTable('wakame'),
    k.trayToTable('shrimp'),
    k.plate('rim'),
    k.top('wakame', k.trayPlaced('wakame')),
    k.top('shrimp', k.trayPlaced('shrimp'), 2),
    k.bottle('dressing'),
    k.bottle('paprika'),
    k.serve,
  ],
  steamedChicken: (k) => [
    k.openFridge(1), // わかめ・野菜ペースト・ガルムソースは、右側の冷蔵庫
    k.trayToTable('wakame'),
    k.trayToTable('vegPaste'),
    k.trayToTable('chicken'),
    k.plate('rim'),
    k.top('wakame', k.trayPlaced('wakame')),
    k.top('chicken', k.trayPlaced('chicken'), 2),
    k.top('vegetablePaste', k.trayPlaced('vegPaste')),
    k.bottle('garum'),
    k.serve,
  ],
  cornSoup: (k) => [
    k.openFridge(),
    k.packToHotWater('cornSoup'),
    k.plate('bowl'),
    k.warmUp('cornSoup'),
    k.warmPackTo('cornSoup', 'bowl'),
    k.serve,
  ],
};

// このメニューのチュートリアルがあるか（iPad のメニュー一覧で、選べるかどうかに使う）
export function hasTutorial(menuId: string): boolean {
  return menuId in RECIPES;
}

// メニューの工程の並び。チュートリアルがなければ null
export function tutorialSteps(menuId: string, cfg: GameConfig): TutorialStep[] | null {
  const recipe = RECIPES[menuId];
  return recipe ? recipe(makeKit(getMenu(menuId), cfg)) : null;
}
