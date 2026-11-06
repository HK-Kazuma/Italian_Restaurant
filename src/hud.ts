import type { GameConfig } from './config';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, getDifficulty, isDifficulty, type Difficulty } from './difficulty';
import { describeItem } from './game';
import { INGREDIENTS } from './ingredients';
import { showMission } from './mission';
import { MENU, getMenu } from './recipe';
import { NAME_MAX, ranking } from './ranking';
import { DEFAULT_SETTINGS, SETTING_SPECS, clampSetting, formatSetting, type SettingKey, type Settings } from './settings';
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
// tutorial = そのメニューのチュートリアルを始める、tutorialStop = チュートリアルをやめる、setting = 設定の値を変える
export type IpadAction =
  | { type: 'start'; difficulty: Difficulty }
  | { type: 'close' }
  | { type: 'tutorial'; menuId: string }
  | { type: 'tutorialStop' }
  | { type: 'setting'; key: SettingKey; value: number }; // 設定アプリのバーを動かした

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

// 設定アプリ：横に伸びたバーのつまみを動かして、好きな値を選ぶ
function settingsHtml(settings: Settings): string {
  return SETTING_SPECS.map(
    (spec) => `<div class="setting-row">
      <div class="setting-head"><span class="setting-label">${spec.label}</span><output class="setting-value" data-value-of="${spec.key}">${formatSetting(settings[spec.key])}</output></div>
      <div class="setting-bar"><span>${formatSetting(spec.min)}</span>
        <input type="range" class="slider" data-setting="${spec.key}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${settings[spec.key]}" aria-label="${spec.label}" />
        <span>${formatSetting(spec.max)}</span></div>
      <p class="setting-note">${spec.note}</p>
    </div>`,
  ).join('');
}

function ipadHtml(cfg: GameConfig, settings: Settings): string {
  const gameSeconds = cfg.gameDuration;
  return `<div class="ipad-body"><div class="ipad-screen">
    <div class="ipad-status"><span>厨房 iPad</span><button data-act="close">✕ とじる</button></div>
    <section class="ipad-page" data-page="home">
      <div class="ipad-apps">
        <button class="app" data-go="tutorial"><span class="icon purple">➜</span>チュートリアル</button>
        <button class="app" data-go="start"><span class="icon green">▶</span>ゲーム開始</button>
        <button class="app" data-go="recipe"><span class="icon orange">☰</span>レシピ</button>
        <button class="app" data-go="controls"><span class="icon blue">？</span>操作説明</button>
        <button class="app" data-go="ranking"><span class="icon yellow">★</span>ランキング</button>
        <button class="app" data-go="settings"><span class="icon gray">⚙</span>設定</button>
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
    <section class="ipad-page" data-page="ranking" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>ランキング</h2>
      <p class="ipad-tip">このゲームを開いているみんなのハイスコアです。自己ベストを出すと、ゲーム終了後に名前をつけて登録できます。</p>
      <div class="rank-tabs">${DIFFICULTIES.map((d) => `<button class="rank-tab" data-rank-diff="${d.id}">${d.name}</button>`).join('')}</div>
      <ol class="rank-list"></ol>
      <p class="rank-note"></p>
    </section>
    <section class="ipad-page" data-page="settings" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>設定</h2>
      <p class="ipad-tip">つまみをドラッグして、好きな値に合わせます。変えた値はすぐ反映され、このブラウザに保存されます。</p>
      <div class="setting-list">${settingsHtml(settings)}</div>
      <button class="setting-reset" data-act="settingsReset">標準に戻す</button>
      <p class="setting-caution">※ 設定はこのブラウザに保存されます。ブラウザのサイトデータを消したときや、プライベート（シークレット）ウィンドウを閉じたときは、消えて標準の値に戻ります。別のブラウザや端末には引き継がれません。</p>
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
  private mission = el('div', 'mission hidden');
  private missionCleared = false; // チュートリアルを受けたことがあるか（受けたら、ミッションは出さない）
  private startPopup = el('div', 'start-popup hidden');
  private startPopupTimer = 0;
  private ipad = el('div', 'ipad hidden');
  private ipadWasOpen = false;
  private ipadTutorialNow = '';
  private ipadNow: HTMLElement | null = null;
  private rankDifficulty: Difficulty = DEFAULT_DIFFICULTY; // ランキングアプリで開いている難易度
  private rankLoadId = 0; // 読み込みの順番（古い読み込みの結果で、新しい表示を上書きしない）
  private rankOffer: { difficulty: Difficulty; score: number } | null = null; // ゲーム終了後に出す、ランキングへの登録
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
    settings: Settings,
  ) {
    this.root = root;
    const top = el('div', 'top');
    top.append(this.timer, this.score);
    this.guide.append(this.guideArrow, this.guideLabel);
    this.guideArrow.textContent = '▲';
    this.note.textContent = '練習モード（時間制限なし）：後ろの壁の iPad を左クリックで取り、右クリックで開くと、チュートリアルやゲーム開始ができます';
    this.startPopup.textContent = 'まずは後ろのタブレットから操作方法とレシピを確認しよう！';
    this.mission.innerHTML = `<span class="mission-icon" aria-hidden="true">🍴</span>
      <div class="mission-text"><b>ミッション：チュートリアルを受けよう！</b>
      <span>後ろの壁の iPad を取って右クリック →「チュートリアル」</span></div>`;
    this.ipad.innerHTML = ipadHtml(cfg, settings);
    root.append(top, this.mission, this.note, this.tutorial, this.rail, this.crosshair, this.hint, this.guide, this.hand, this.toast, this.startPopup, this.ipad, this.overlay);
    // 結果画面の名前入力は、押しても練習キッチンへ進まない
    this.overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.rank-form')) return;
      onOverlayClick();
    });
    this.overlay.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submitRanking(e.target as HTMLFormElement);
    });

    // iPad の画面：アプリを開く・戻る・ゲーム開始・閉じる。右クリックでも閉じる
    this.ipad.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-go], [data-act], [data-tutorial], [data-difficulty], [data-rank-diff]');
      if (!t) return;
      if (t.dataset.go) this.showIpadPage(t.dataset.go);
      else if (isDifficulty(t.dataset.rankDiff)) void this.loadRanking(t.dataset.rankDiff);
      else if (t.dataset.tutorial) onIpad({ type: 'tutorial', menuId: t.dataset.tutorial });
      else if (isDifficulty(t.dataset.difficulty)) onIpad({ type: 'start', difficulty: t.dataset.difficulty });
      else if (t.dataset.act === 'close' || t.dataset.act === 'tutorialStop') onIpad({ type: t.dataset.act });
      else if (t.dataset.act === 'settingsReset') {
        for (const spec of SETTING_SPECS) {
          const value = DEFAULT_SETTINGS[spec.key];
          this.showSetting(spec.key, value);
          onIpad({ type: 'setting', key: spec.key, value });
        }
      }
    });
    // 設定のバー：つまみを動かすたびに、値の表示とゲームの設定を更新する
    this.ipad.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      const key = input.dataset.setting as SettingKey | undefined;
      if (!key) return;
      const value = clampSetting(key, Number(input.value));
      this.showSetting(key, value);
      onIpad({ type: 'setting', key, value });
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

  // バーのつまみと数字の表示を、その値に合わせる
  private showSetting(key: SettingKey, value: number): void {
    const slider = this.ipad.querySelector<HTMLInputElement>(`[data-setting="${key}"]`);
    if (slider) slider.value = String(value);
    const out = this.ipad.querySelector<HTMLElement>(`[data-value-of="${key}"]`);
    if (out) out.textContent = formatSetting(value);
  }

  private showIpadPage(page: string): void {
    for (const p of this.ipad.querySelectorAll<HTMLElement>('.ipad-page')) p.hidden = p.dataset.page !== page;
    if (page === 'ranking') void this.loadRanking(this.rankDifficulty);
  }

  // ランキングアプリ：その難易度の上位を読み込んで並べる。名前は利用者が入力した文字なので、必ず textContent で入れる
  private async loadRanking(difficulty: Difficulty): Promise<void> {
    this.rankDifficulty = difficulty;
    const id = ++this.rankLoadId;
    for (const tab of this.ipad.querySelectorAll<HTMLElement>('.rank-tab')) tab.classList.toggle('active', tab.dataset.rankDiff === difficulty);
    const list = this.ipad.querySelector<HTMLElement>('.rank-list')!;
    const note = this.ipad.querySelector<HTMLElement>('.rank-note')!;
    list.replaceChildren();
    if (!ranking.enabled) {
      note.textContent = 'ランキングは準備中です（まだ保存先につながっていません）';
      return;
    }
    note.textContent = '読み込み中…';
    try {
      const entries = await ranking.top(difficulty);
      if (id !== this.rankLoadId) return;
      note.textContent = entries.length === 0 ? 'まだ誰も登録していません。一番乗りを目指そう！' : '';
      entries.forEach((e, i) => {
        const li = document.createElement('li');
        const no = document.createElement('span');
        no.className = 'rank-no';
        no.textContent = String(i + 1);
        const name = document.createElement('span');
        name.className = 'rank-name';
        name.textContent = e.name;
        const score = document.createElement('b');
        score.className = 'rank-score';
        score.textContent = `${e.score} 点`;
        li.append(no, name, score);
        list.append(li);
      });
    } catch {
      if (id === this.rankLoadId) note.textContent = 'ランキングを読み込めませんでした。通信を確認して、もう一度開いてください';
    }
  }

  // ゲームが終わって自己ベストだったとき、結果画面に名前入力を出す（結果画面が出る前に呼ぶ）。なければ null
  offerRanking(offer: { difficulty: Difficulty; score: number } | null): void {
    this.rankOffer = offer;
  }

  private async submitRanking(form: HTMLFormElement): Promise<void> {
    const offer = this.rankOffer;
    const input = form.elements.namedItem('name') as HTMLInputElement;
    const button = form.querySelector<HTMLButtonElement>('button')!;
    const status = form.querySelector<HTMLElement>('.rank-status')!;
    if (!offer || button.disabled) return;
    button.disabled = true;
    input.disabled = true;
    status.textContent = '登録中…';
    try {
      await ranking.submit(offer.difficulty, input.value, offer.score);
      saveName(input.value);
      this.rankOffer = null;
      this.rankDifficulty = offer.difficulty;
      status.textContent = '登録しました！ iPad の「ランキング」で見られます';
      button.hidden = true;
    } catch {
      status.textContent = '登録できませんでした。通信を確認して、もう一度押してください';
      button.disabled = false;
      input.disabled = false;
    }
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

  // チュートリアルを受けたことがあるか（受けていれば、ミッションは出さない）
  setMissionCleared(cleared: boolean): void {
    this.missionCleared = cleared;
  }

  // hint: いま視点が合っている物に対する操作の案内（なければ空）
  // tutorial: チュートリアル中の工程の一覧（中でなければ null）
  update(state: GameState, best: number, hint = '', tutorial: TutorialView | null = null): void {
    const practice = state.mode === 'practice';
    this.root.classList.toggle('practice', practice); // 練習中は、タイマーの代わりに「練習」を出して、スコアは隠す
    this.root.classList.toggle('tutorial-on', tutorial !== null);
    const mission = showMission(state, this.missionCleared);
    this.mission.classList.toggle('hidden', !mission);
    this.root.classList.toggle('mission-on', mission);
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

  // 結果画面の名前入力（自己ベストで、ランキングにつながっているときだけ）
  private rankFormHtml(): string {
    const offer = this.rankOffer;
    if (!offer || !ranking.enabled) return '';
    return `<form class="rank-form">
      <label>自己ベスト！ ランキング（${getDifficulty(offer.difficulty).name}）に名前をつけて登録できます</label>
      <div><input name="name" maxlength="${NAME_MAX}" value="${escapeAttr(loadName())}" placeholder="名前（${NAME_MAX}文字まで）" autocomplete="off" /><button type="submit">登録する</button></div>
      <p class="rank-status"></p>
    </form>`;
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
          ${this.rankFormHtml()}
          <p class="cta">クリックで練習キッチンへ（ゲームは iPad から）</p>`;
        break;
      case 'playing':
        this.overlay.innerHTML = '';
        break;
    }
  }
}

const NAME_KEY = 'kitchen-time-attack:name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, NAME_MAX));
  } catch {
    // 保存できなくても遊べる
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
