import type { GameConfig } from './config';
import { describeItem } from './game';
import { INGREDIENTS } from './ingredients';
import { MENU, getMenu } from './recipe';
import type { GameState, Phase } from './types';

const CONTROLS_HTML = `
  <table class="controls">
    <tr><th>マウス</th><td>視点移動（Escで一時停止）</td></tr>
    <tr><th>WASD</th><td>歩く（壁・設備には入れない）</td></tr>
    <tr><th>左クリック</th><td>取る・置く・投入する・ボタンを押す</td></tr>
    <tr><th>ダブルクリック</th><td>のびかけの茹で麺器をショート茹で（3秒）</td></tr>
    <tr><th>右クリック</th><td>冷蔵庫：扉の開閉（開けているときは、中の物を持ち上げて置き直す）　ボトル（ドレッシング・パプリカ・パセリ）を持っているとき：皿にかける・振る　iPadを持っているとき：画面を開く　それ以外：手に持っている物を捨てる</td></tr>
    <tr><th>E（押している間）</th><td>伝票を拡大表示</td></tr>
  </table>
  <p class="recipe">たらこのパスタ：生麺を茹で麺器にセット→ボタン→上がったら取る→皿に盛る→たらこソース→刻みのり→提供台へ</p>
`;

// iPad の画面から選べる操作。start = ゲーム開始、close = 画面を閉じて練習キッチンに戻る
export type IpadAction = 'start' | 'close';

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
      </div>`,
    )
    .join('');
}

function ipadHtml(gameSeconds: number): string {
  return `<div class="ipad-body"><div class="ipad-screen">
    <div class="ipad-status"><span>厨房 iPad</span><button data-act="close">✕ とじる</button></div>
    <section class="ipad-page" data-page="home">
      <div class="ipad-apps">
        <button class="app" data-go="start"><span class="icon green">▶</span>ゲーム開始</button>
        <button class="app" data-go="recipe"><span class="icon orange">☰</span>レシピ</button>
        <button class="app" data-go="controls"><span class="icon blue">？</span>操作説明</button>
      </div>
      <p class="ipad-tip">ここでは時間制限なし。気がすむまで練習できます（右クリックでも閉じられます）</p>
    </section>
    <section class="ipad-page" data-page="start" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>ゲーム開始</h2>
      <p>${Math.round(gameSeconds / 60)}分間のタイムアタックを始めます。伝票は時間とともに届く間隔が短くなっていきます。</p>
      <p>冷蔵庫の中の物を置き直していれば、その配置のままゲームが始まります。それ以外（鍋・皿・伝票など）は最初の状態に戻ります。</p>
      <button class="go" data-act="start">ゲームを始める</button>
    </section>
    <section class="ipad-page" data-page="recipe" hidden>
      <button class="back" data-go="home">‹ ホーム</button>
      <h2>レシピ</h2>
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
  private ipad = el('div', 'ipad hidden');
  private ipadWasOpen = false;
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
    this.note.textContent = '練習モード（時間制限なし）：後ろの壁の iPad を左クリックで取り、右クリックで開くと、ゲームを始められます';
    this.ipad.innerHTML = ipadHtml(cfg.gameDuration);
    root.append(top, this.note, this.rail, this.crosshair, this.hint, this.guide, this.hand, this.toast, this.ipad, this.overlay);
    this.overlay.addEventListener('click', onOverlayClick);

    // iPad の画面：アプリを開く・戻る・ゲーム開始・閉じる。右クリックでも閉じる
    this.ipad.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-go], [data-act]');
      if (!t) return;
      if (t.dataset.go) this.showIpadPage(t.dataset.go);
      else if (t.dataset.act === 'start' || t.dataset.act === 'close') onIpad(t.dataset.act);
    });
    this.ipad.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      onIpad('close');
    });
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
  update(state: GameState, best: number, hint = ''): void {
    const practice = state.mode === 'practice';
    this.root.classList.toggle('practice', practice); // 練習中は、タイマーの代わりに「練習」を出して、スコアは隠す
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

  private renderRail(state: GameState): void {
    const html = state.tickets
      .map((t) => {
        const menu = getMenu(t.menuId);
        const waited = Math.floor(state.time - t.arrivedAt);
        const urgency =
          waited >= this.cfg.speedBonusWindow * 0.8 ? 'late' : waited >= this.cfg.speedBonusWindow * 0.45 ? 'mid' : '';
        const items = menu.ingredients.map((id) => INGREDIENTS[id].name).join('・');
        return `<div class="ticket ${urgency}"><div class="name">${menu.name}</div><div class="items">${items}</div><div class="wait">${waited}秒</div></div>`;
      })
      .join('');
    if (html === this.lastRail) return;
    this.lastRail = html;
    this.rail.innerHTML = html;
  }

  private renderOverlay(state: GameState, best: number): void {
    if (state.phase === this.lastPhase) return;
    this.lastPhase = state.phase;
    this.overlay.className = `overlay ${state.phase === 'playing' ? 'hidden' : ''}`;

    switch (state.phase) {
      case 'title':
        this.overlay.innerHTML = `<h1>厨房タイムアタック</h1>
          <p>5分間で届く伝票をどれだけ多く・正確にさばけるか。</p>
          <p>まずは時間制限のない練習キッチンに入ります。操作に慣れたら、後ろの壁の iPad からゲームを始めましょう。</p>${CONTROLS_HTML}
          <p class="cta">クリックで練習キッチンへ</p>`;
        break;
      case 'paused':
        this.overlay.innerHTML = `<h1>一時停止</h1>${CONTROLS_HTML}<p class="cta">クリックで再開</p>`;
        break;
      case 'result':
        this.overlay.innerHTML = `<h1>タイムアップ！</h1>
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
