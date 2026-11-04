import type { GameConfig } from './config';
import { describeItem } from './game';
import { INGREDIENTS } from './ingredients';
import { getMenu } from './recipe';
import type { GameState, Phase } from './types';

const CONTROLS_HTML = `
  <table class="controls">
    <tr><th>マウス</th><td>視点移動（Escで一時停止）</td></tr>
    <tr><th>WASD</th><td>一、二歩寄る</td></tr>
    <tr><th>左クリック</th><td>取る・置く・投入する・ボタンを押す</td></tr>
    <tr><th>ダブルクリック</th><td>のびかけの茹で麺器をショート茹で（3秒）</td></tr>
    <tr><th>右クリック</th><td>冷蔵庫に視点を合わせて：扉の開閉　それ以外：手に持っている物を捨てる</td></tr>
    <tr><th>E（押している間）</th><td>伝票を拡大表示</td></tr>
  </table>
  <p class="recipe">たらこのパスタ：生麺を茹で麺器にセット→ボタン→上がったら取る→皿に盛る→たらこソース→刻みのり→提供台へ</p>
`;

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
  private overlay = el('div', 'overlay');
  private lastRail = '';
  private lastPhase: Phase | null = null;

  constructor(
    root: HTMLElement,
    private cfg: GameConfig,
    onOverlayClick: () => void,
  ) {
    const top = el('div', 'top');
    top.append(this.timer, this.score);
    const crosshair = el('div', 'crosshair');
    root.append(top, this.rail, crosshair, this.hint, this.hand, this.toast, this.overlay);
    this.overlay.addEventListener('click', onOverlayClick);
  }

  setTicketZoom(on: boolean): void {
    this.rail.classList.toggle('zoom', on);
  }

  // hint: いま視点が合っている物に対する操作の案内（なければ空）
  update(state: GameState, best: number, hint = ''): void {
    this.timer.textContent = formatTime(this.cfg.gameDuration - state.time);
    this.timer.classList.toggle('low', this.cfg.gameDuration - state.time <= 30);
    this.score.innerHTML = `<b>${state.score}</b> 点${state.combo >= 2 ? ` <span class="combo">${state.combo} COMBO</span>` : ''}`;

    const handText = describeItem(state.hand);
    this.hand.textContent = handText ? `手：${handText}` : '';

    const toastVisible = state.toast && state.time < state.toast.expiresAt;
    this.toast.textContent = toastVisible ? state.toast!.text : '';
    this.toast.className = `toast ${toastVisible ? state.toast!.kind : ''}`;

    this.hint.textContent = state.phase === 'playing' ? hint : '';
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
          <p>5分間で届く伝票をどれだけ多く・正確にさばけるか。</p>${CONTROLS_HTML}
          <p class="cta">クリックで開始</p>`;
        break;
      case 'paused':
        this.overlay.innerHTML = `<h1>一時停止</h1>${CONTROLS_HTML}<p class="cta">クリックで再開</p>`;
        break;
      case 'result':
        this.overlay.innerHTML = `<h1>タイムアップ！</h1>
          <p class="big">${state.score} 点</p>
          <p>${best <= state.score && state.score > 0 ? '🎉 ハイスコア更新！' : `ハイスコア ${best} 点`}</p>
          <p>提供 ${state.served} 皿 ／ 最大コンボ ${state.maxCombo} ／ 注文ミス ${state.mistakes}</p>
          <p class="cta">クリックでもう一度</p>`;
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
