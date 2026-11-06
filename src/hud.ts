import type { GameConfig } from './config';
import { DIFFICULTIES, getDifficulty, isDifficulty, type Difficulty } from './difficulty';
import { describeItem } from './game';
import { INGREDIENTS } from './ingredients';
import { MENU, getMenu } from './recipe';
import { hasTutorial, tutorialSteps, type TutorialView } from './tutorial';
import type { GameState, Phase } from './types';

const CONTROLS_HTML = `
  <table class="controls">
    <tr><th>マウス</th><td>視点移動（Escで一時停止）</td></tr>
    <tr><th>WASD</th><td>歩く（壁・設備には入れない）</td></tr>
    <tr><th>左クリック</th><td>取る・置く・投入する・ボタンを押す</td></tr>
    <tr><th>ダブルクリック</th><td>のびかけの茹で麺器をショート茹で（3秒）</td></tr>
    <tr><th>右クリック</th><td>冷蔵庫：扉の開閉（開けているときは、中の物を持ち上げて置き直す）　ボトル（ドレッシング・パプリカ・パセリ）を持っているとき：皿にかける・振る　iPadを持っているとき：画面を開く　それ以外：手に持っている物を捨てる</td></tr>
    <tr><th>E（押している間）</th><td>伝票を拡大表示</td></tr>
    <tr><th>鍋を持って右クリック</th><td>鍋を持ったまま、右クリックすると投げられるよ！悪質なクレーマーや、ネズミ撃退に使えるかも...?(実装予定)</td></tr>
  </table>
`;

// iPad の画面から選べる操作。start = 選んだ難易度でゲーム開始（操作説明を出して、クリックで始まる）、close = 画面を閉じて練習キッチンに戻る、
// tutorial = そのメニューのチュートリアルを始める、tutorialStop = チュートリアルをやめる
export type IpadAction =
  | { type: 'start'; difficulty: Difficulty }
  | { type: 'close' }
  | { type: 'tutorial'; menuId: string }
  | { type: 'tutorialStop' };

// レシピ：メニュー表（recipe.ts）から作る。完成品の中身と、鍋で加熱する分
function countedNames(ids: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${INGREDIENTS[id as keyof typeof INGREDIENTS].name}${n > 1 ? `×${n}` : ''}`).join('・');
}

function recipeHtml(): string {
  return MENU.filter((m) => m.enabled)
    .map(
      (m) => `<div class="recipe-card">
        <div class="recipe-name">${m.name}<span class="badge">${m.station === 'pasta' ? 'パスタ台' : 'サラダ台'}</span></div>
        <div class="recipe-row"><b>完成：</b>${countedNames(m.ingredients)}</div>
        ${m.sauce ? `<div class="recipe-row"><b>鍋で加熱：</b>${countedNames(m.sauce)}</div>` : ''}
        <ol class="recipe-steps">${m.steps.map((t) => `<li>${t}</li>`).join('')}</ol>
      </div>`,
    )
    .join('');
}

// チュートリアルのメニュー一覧：メニュー表（recipe.ts）から作る。メニューを足せば、自動で並ぶ。
// 工程がまだないメニューは「準備中」で、選べない
function tutorialMenuHtml(cfg: GameConfig): string {
  return MENU.filter((m) => m.enabled)
    .map((m) => {
      const steps = hasTutorial(m.id) ? tutorialSteps(m.id, cfg) : null;
      const badge = `<span class="badge">${m.station === 'pasta' ? 'パスタ台' : 'サラダ台'}</span>`;
      return steps
        ? `<button class="tut-card" data-tutorial="${m.id}"><span class="tut-name">${m.name}${badge}</span><span class="tut-meta">${steps.length}工程 ›</span></button>`
        : `<div class="tut-card disabled"><span class="tut-name">${m.name}${badge}</span><span class="tut-meta">準備中</span></div>`;
    })
    .join('');
}

// ゲーム開始の難易度えらび：カードを押すと、その難易度でゲームの準備に入る
function difficultyHtml(): string {
  return DIFFICULTIES.map(
    (d) => `<button class="diff-card ${d.id}" data-difficulty="${d.id}">
      <span class="diff-name">${d.name}</span>
      <span class="diff-tagline">${d.tagline}</span>
      <span class="diff-summary">${d.summary}</span>
    </button>`,
  ).join('');
}

function ipadHtml(cfg: GameConfig): string {
  const gameSeconds = cfg.gameDuration;
  return `<div class="ipad-body"><div class="ipad-screen">
    <div class="ipad-status"><span>厨房 iPad</span><button data-act="close">✕ とじる</button></div>
    <section class="ipad-page" data-page="home">
      <div class="ipad-apps">
        <button class="app" data-go="tutorial"><span class="icon purple">➜</span>チュートリアル</button>
        <button class="app" data-go="start"><span class="icon green">▶</span>ゲーム開始</button>
        <button class="app" data-go="recipe"><span class="icon orange">☰</span>レシピ</button>
        <button class="app" data-go="controls"><span class="icon blue">？</span>操作説明</button>
      </div>
      <p class="ipad-tip">ここでは時間制限なし。気がすむまで練習できます（右クリックでも閉じられます）</p>
    </section>
    <section class="ipad-page" data-page="tutorial" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>チュートリアル</h2>
      <p class="ipad-tip">練習したいメニューをタップすると、厨房が最初の状態に戻り、作り方を矢印で順番に案内します。</p>
      <div class="tut-now" hidden></div>
      <div class="tut-list">${tutorialMenuHtml(cfg)}</div>
    </section>
    <section class="ipad-page" data-page="start" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>ゲーム開始</h2>
      <p>${Math.round(gameSeconds / 60)}分間のタイムアタックです。伝票は時間とともに届く間隔が短くなっていきます。難易度を選ぶと、伝票の量と出てくる料理が変わります。</p>
      <div class="diff-list">${difficultyHtml()}</div>
      <p class="ipad-tip">選ぶと、最初に立っていた場所に戻り、操作説明が出ます。クリックするとゲームが始まります。冷蔵庫の中の物を置き直していれば、その配置のままです（鍋・皿・伝票などは最初の状態に戻ります）。</p>
    </section>
    <section class="ipad-page" data-page="recipe" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>レシピ（作り方）</h2>
      <p class="ipad-tip">「鍋で加熱」の材料を鍋に入れると、IHに載せた時点で自動的に加熱が始まります。</p>
      <div class="recipe-list">${recipeHtml()}</div>
    </section>
    <section class="ipad-page" data-page="controls" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>操作説明</h2>
      ${CONTROLS_HTML}
    </section>
  </div></div>`;
}

const START_POPUP_MS = 6000; // 練習キッチンに入った直後の案内を出しておく時間

const RAIL_VISIBLE_TICKETS = 6; // 伝票を横に並べて見せる枚数。それを超えた分は6枚目の裏に重ねて「+x枚」と出す
const UPCOMING_STEPS = 3; // いまの工程のあと、先に見せる工程の数

function tutorialPanelHtml(v: TutorialView): string {
  const total = v.labels.length;
  const head = `<div class="tut-head"><span>チュートリアル</span><b>${v.menuName}</b></div>`;
  const finished = v.step > 0 ? `<div class="tut-finished">✔ ${v.step}工程 完了</div>` : '';
  const upcoming = v.labels
    .slice(v.step + 1, v.step + 1 + UPCOMING_STEPS)
    .map((t) => `<div class="tut-arrow">↓</div><div class="tut-step">${t}</div>`)
    .join('');
  const rest = total - (v.step + 1 + UPCOMING_STEPS);
  const more = rest > 0 ? `<div class="tut-arrow">↓</div><div class="tut-more">…あと${rest}工程</div>` : '';
  return `${head}${finished}
    <div class="tut-step now"><span class="tut-no">${v.step + 1}/${total}</span>${v.labels[v.step]}${v.progress ? `<span class="tut-progress">（${v.progress}）</span>` : ''}</div>
    ${v.hint ? `<div class="tut-hint">${v.hint}</div>` : ''}${upcoming}${more}`;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  private timer = el('div', 'timer');
  private score = el('div', 'score');
  private rail = el('div', 'rail');
  private hand = el('div', 'hand');
  private toast = el('div', 'toast');
  private hint = el('div', 'hint');
  private guide = el('div', 'guide hidden');
  private guideArrow = el('div', 'arrow');
  private guideLabel = el('div', 'label');
  private overlay = el('div', 'overlay');
  private crosshair = el('div', 'crosshair');
  private note = el('div', 'practice-note');
  private startPopup = el('div', 'start-popup hidden');
  private startPopupTimer = 0;
  private ipad = el('div', 'ipad hidden');
  private ipadWasOpen = false;
  private ipadTutorialNow = '';
  private ipadNow: HTMLElement | null = null;
  private tutorial = el('div', 'tutorial hidden');
  private lastTutorial = '';
  private root: HTMLElement;
  private lastRail = '';
  private lastPhase: Phase | null = null;

  constructor(
    root: HTMLElement,
    private cfg: GameConfig,
    onOverlayClick: () => void,
    onIpad: (action: IpadAction) => void,
  ) {
    this.root = root;
    const top = el('div', 'top');
    top.append(this.timer, this.score);
    this.guide.append(this.guideArrow, this.guideLabel);
    this.guideArrow.textContent = '▲';
    this.note.textContent = '練習モード（時間制限なし）：後ろの壁の iPad を左クリックで取り、右クリックで開くと、チュートリアルやゲーム開始ができます';
    this.startPopup.textContent = 'まずは後ろのタブレットから操作方法とレシピを確認しよう！';
    this.ipad.innerHTML = ipadHtml(cfg);
    root.append(top, this.note, this.tutorial, this.rail, this.crosshair, this.hint, this.guide, this.hand, this.toast, this.startPopup, this.ipad, this.overlay);
    this.overlay.addEventListener('click', onOverlayClick);

    // iPad の画面：アプリを開く・戻る・ゲーム開始・閉じる。右クリックでも閉じる
    this.ipad.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-go], [data-act], [data-tutorial], [data-difficulty]');
      if (!t) return;
      if (t.dataset.go) this.showIpadPage(t.dataset.go);
      else if (t.dataset.tutorial) onIpad({ type: 'tutorial', menuId: t.dataset.tutorial });
      else if (isDifficulty(t.dataset.difficulty)) onIpad({ type: 'start', difficulty: t.dataset.difficulty });
      else if (t.dataset.act === 'close' || t.dataset.act === 'tutorialStop') onIpad({ type: t.dataset.act });
    });
    this.ipad.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      onIpad({ type: 'close' });
    });
  }

  // 練習キッチンに入った直後のポップアップ。数秒で自然に消える（ポインターロック中でクリックできないため）
  private showStartPopup(): void {
    window.clearTimeout(this.startPopupTimer);
    this.startPopup.classList.remove('hidden');
    this.startPopupTimer = window.setTimeout(() => this.hideStartPopup(), START_POPUP_MS);
  }

  private hideStartPopup(): void {
    window.clearTimeout(this.startPopupTimer);
    this.startPopup.classList.add('hidden');
  }

  private showIpadPage(page: string): void {
    for (const p of this.ipad.querySelectorAll<HTMLElement>('.ipad-page')) p.hidden = p.dataset.page !== page;
  }

  // 置き場が画面の外にあるときの案内。left / top は画面内の位置（%）、angle は上を0にした時計回りの角度。null で消す
  setGuide(g: { left: number; top: number; angle: number; label: string } | null): void {
    this.guide.classList.toggle('hidden', g === null);
    if (!g) return;
    this.guide.style.left = `${g.left}%`;
    this.guide.style.top = `${g.top}%`;
    this.guideArrow.style.transform = `rotate(${g.angle}rad)`;
    this.guideLabel.textContent = g.label;
  }

  setTicketZoom(on: boolean): void {
    this.rail.classList.toggle('zoom', on);
  }

  // hint: いま視点が合っている物に対する操作の案内（なければ空）
  // tutorial: チュートリアル中の工程の一覧（中でなければ null）
  update(state: GameState, best: number, hint = '', tutorial: TutorialView | null = null): void {
    const practice = state.mode === 'practice';
    this.root.classList.toggle('practice', practice); // 練習中は、タイマーの代わりに「練習」を出して、スコアは隠す
    this.root.classList.toggle('tutorial-on', tutorial !== null);
    this.renderTutorial(tutorial);
    this.timer.textContent = practice ? '練習' : formatTime(this.cfg.gameDuration - state.time);
    this.timer.classList.toggle('low', !practice && this.cfg.gameDuration - state.time <= 30);

    // iPad の画面：開いたときはホームから。開いている間は照準とヒントを隠す
    this.ipad.classList.toggle('hidden', !state.ipadOpen);
    if (state.ipadOpen && !this.ipadWasOpen) this.showIpadPage('home');
    this.ipadWasOpen = state.ipadOpen;
    this.crosshair.style.display = state.ipadOpen ? 'none' : '';
    this.score.innerHTML = `<b>${state.score}</b> 点${state.combo >= 2 ? ` <span class="combo">${state.combo} COMBO</span>` : ''}`;

    const handText = describeItem(state.hand);
    this.hand.textContent = handText ? `手：${handText}` : '';

    const toastVisible = state.toast && state.time < state.toast.expiresAt;
    this.toast.textContent = toastVisible ? state.toast!.text : '';
    this.toast.className = `toast ${toastVisible ? state.toast!.kind : ''}`;

    this.hint.textContent = state.phase === 'playing' && !state.ipadOpen ? hint : '';
    this.renderRail(state);
    this.renderOverlay(state, best);
  }

  // チュートリアルの工程の一覧：いまの工程を大きく、次からは矢印（↓）でつないで見せる。終わった工程は件数だけ
  private renderTutorial(view: TutorialView | null): void {
    this.tutorial.classList.toggle('hidden', view === null);
    const key = view ? `${view.menuName}|${view.step}|${view.hint}|${view.progress}` : '';
    if (key !== this.lastTutorial) {
      this.lastTutorial = key;
      if (view) this.tutorial.innerHTML = tutorialPanelHtml(view);
    }
    this.renderIpadTutorialNow(view);
  }

  // iPad のチュートリアル画面の上に出す、いま取り組んでいるメニューと「やめる」ボタン
  private renderIpadTutorialNow(view: TutorialView | null): void {
    const now = (this.ipadNow ??= this.ipad.querySelector<HTMLElement>('.tut-now'));
    if (!now) return;
    const html = view
      ? `<span>「${view.menuName}」を練習中（${view.step + 1}/${view.labels.length}）</span><button data-act="tutorialStop">やめる</button>`
      : '';
    if (html === this.ipadTutorialNow) return;
    this.ipadTutorialNow = html;
    now.hidden = view === null;
    now.innerHTML = html;
  }

  private renderRail(state: GameState): void {
    const visible = state.tickets.slice(0, RAIL_VISIBLE_TICKETS);
    const hidden = state.tickets.length - visible.length;
    const html = visible
      .map((t, i) => {
        const menu = getMenu(t.menuId);
        const waited = Math.floor(state.time - t.arrivedAt);
        const urgency =
          waited >= this.cfg.speedBonusWindow * 0.8 ? 'late' : waited >= this.cfg.speedBonusWindow * 0.45 ? 'mid' : '';
        const items = menu.ingredients.map((id) => INGREDIENTS[id].name).join('・');
        // 表示しきれない分は、いちばん右の伝票の裏に重ねて、枚数を「+x枚」で示す
        const stack = i === RAIL_VISIBLE_TICKETS - 1 && hidden > 0 ? ' stacked' : '';
        const more = stack ? `<div class="more">+${hidden}枚</div>` : '';
        return `<div class="ticket ${urgency}${stack}"><div class="name">${menu.name}</div><div class="items">${items}</div><div class="wait">${waited}秒</div>${more}</div>`;
      })
      .join('');
    if (html === this.lastRail) return;
    this.lastRail = html;
    this.rail.innerHTML = html;
  }

  private renderOverlay(state: GameState, best: number): void {
    if (state.phase === this.lastPhase) return;
    const from = this.lastPhase;
    this.lastPhase = state.phase;
    // タイトル／結果の「クリックで練習キッチンへ」を押した直後だけ、最初の案内を出す
    if (state.phase === 'playing' && state.mode === 'practice' && (from === 'title' || from === 'result')) this.showStartPopup();
    else if (state.phase !== 'playing') this.hideStartPopup();
    this.overlay.className = `overlay ${state.phase === 'playing' ? 'hidden' : ''}`;

    switch (state.phase) {
      case 'title':
        this.overlay.innerHTML = `<img class="logo" src="${import.meta.env.BASE_URL}logo.png" alt="ドリアーノ田中's Kitchen" />
          <h1>厨房タイムアタック</h1>${CONTROLS_HTML}
          <p class="cta">クリックで練習キッチンへ</p>`;
        break;
      case 'ready':
        this.overlay.innerHTML = `<h1>ゲーム開始</h1>
          ${state.difficulty ? `<p class="difficulty-now">難易度：<b>${getDifficulty(state.difficulty).name}</b></p>` : ''}
          <p>${Math.round(this.cfg.gameDuration / 60)}分間のタイムアタック。届く伝票をできるだけ多く、正確にさばこう。</p>${CONTROLS_HTML}
          <p class="cta">クリックでゲーム開始</p>`;
        break;
      case 'paused':
        this.overlay.innerHTML = `<h1>一時停止</h1>${CONTROLS_HTML}<p class="cta">クリックで再開</p>`;
        break;
      case 'result':
        this.overlay.innerHTML = `<h1>タイムアップ！</h1>
          ${state.difficulty ? `<p class="difficulty-now">難易度：<b>${getDifficulty(state.difficulty).name}</b></p>` : ''}
          <p class="big">${state.score} 点</p>
          <p>${best <= state.score && state.score > 0 ? '🎉 ハイスコア更新！' : `ハイスコア ${best} 点`}</p>
          <p>提供 ${state.served} 皿 ／ 最大コンボ ${state.maxCombo} ／ 注文ミス ${state.mistakes}</p>
          <p class="cta">クリックで練習キッチンへ（ゲームは iPad から）</p>`;
        break;
      case 'playing':
        this.overlay.innerHTML = '';
        break;
    }
  }
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
