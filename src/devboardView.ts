import {
  CODE_MAX,
  DEV_STATUSES,
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  NOTE_MAX,
  TITLE_MAX,
  describeDevError,
  devBoard,
  isDevStatus,
  isFeedbackKind,
  type DevItem,
  type DevStatus,
} from './devboard';
import { NAME_MAX } from './ranking';

type Tab = DevStatus | 'feedback';

// iPad の「開発ボード」アプリの中身。ホーム・戻るボタンは、iPad 側（hud.ts）が受け持つ。
// 利用者が入力した文字（タイトル・メモ・要望）は、必ず textContent で入れる。
// 開発者コードは入力欄にだけ置く（保存しない。ページを開き直すと、また入力する）

export function devBoardHtml(): string {
  const tabs = [...DEV_STATUSES, { id: 'feedback', label: '要望を送る' }]
    .map((t) => `<button class="rank-tab" data-dev-tab="${t.id}">${t.label}</button>`)
    .join('');
  return `<button class="back" data-go="home">‹ ホーム</button>
    <h2>開発ボード</h2>
    <p class="ipad-tip">いま作っているものと、これから作るものをお知らせします。「要望を送る」から、作ってほしいものや直してほしいところも送れます。</p>
    <div class="rank-tabs">${tabs}</div>
    <div data-dev-view="list">
      <ul class="dev-list"></ul>
      <p class="rank-note dev-status"></p>
      <div class="dev-admin">
        <button type="button" class="dev-admin-toggle" data-dev-admin>🔒 開発者用（追加・編集）</button>
        <form class="dev-admin-panel" data-dev-form="add" hidden>
          <label>開発者コード<input type="password" name="code" maxlength="${CODE_MAX}" autocomplete="off" placeholder="開発者コード" /></label>
          <label>タイトル<input name="title" maxlength="${TITLE_MAX}" autocomplete="off" placeholder="例：寿司メニューを追加" /></label>
          <label>メモ（任意）<textarea name="note" maxlength="${NOTE_MAX}" rows="2" placeholder="くわしい内容"></textarea></label>
          <div><button type="submit" class="dev-submit">いま開いているタブに追加</button></div>
          <p class="dev-admin-status" role="status"></p>
        </form>
      </div>
    </div>
    <form class="dev-feedback" data-dev-view="feedback" hidden>
      <label>種類
        <select name="kind">${FEEDBACK_KINDS.map((k) => `<option value="${k.id}">${k.label}</option>`).join('')}</select>
      </label>
      <label>内容（${FEEDBACK_MAX}文字まで）<textarea name="text" maxlength="${FEEDBACK_MAX}" rows="5" placeholder="こんな料理がほしい、ここが分かりにくい、など"></textarea></label>
      <label>名前（任意）<input name="name" maxlength="${NAME_MAX}" autocomplete="off" placeholder="空ならゲスト" /></label>
      <div><button type="submit" class="dev-submit">開発者に送る</button></div>
      <p class="dev-feedback-status" role="status"></p>
    </form>`;
}

export class DevBoardView {
  private tab: Tab = 'doing';
  private items: DevItem[] = [];
  private loadId = 0;
  private adminOn = false;
  private loaded = false;

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-dev-tab], [data-dev-admin], [data-dev-move], [data-dev-remove]');
      if (!t) return;
      if (t.dataset.devTab) this.showTab(t.dataset.devTab as Tab);
      else if (t.dataset.devAdmin !== undefined) this.toggleAdmin();
      else if (t.dataset.devMove) void this.move(t.dataset.devMove, t.dataset.to);
      else if (t.dataset.devRemove) void this.remove(t.dataset.devRemove);
    });
    root.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      if (form.dataset.devForm === 'add') void this.add(form);
      else void this.sendFeedback(form);
    });
    this.showTab('doing');
  }

  // iPad でこのアプリを開いたとき：最新の一覧を読み込む
  open(): void {
    void this.load();
  }

  private q<T extends HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!;
  }

  private showTab(tab: Tab): void {
    if (tab !== 'feedback' && !isDevStatus(tab)) return;
    this.tab = tab;
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-dev-tab]')) b.classList.toggle('active', b.dataset.devTab === tab);
    this.q('[data-dev-view="list"]').hidden = tab === 'feedback';
    this.q('[data-dev-view="feedback"]').hidden = tab !== 'feedback';
    if (tab !== 'feedback') this.render();
  }

  private toggleAdmin(): void {
    this.adminOn = !this.adminOn;
    this.q('[data-dev-form="add"]').hidden = !this.adminOn;
    this.q('[data-dev-admin]').textContent = this.adminOn ? '🔓 開発者用を閉じる' : '🔒 開発者用（追加・編集）';
    this.render();
  }

  private code(): string {
    return (this.root.querySelector<HTMLInputElement>('[data-dev-form="add"] [name="code"]')?.value ?? '').trim();
  }

  private setStatus(sel: string, text: string): void {
    this.q(sel).textContent = text;
  }

  private async load(): Promise<void> {
    const id = ++this.loadId;
    const note = '.dev-status';
    if (!devBoard.enabled) {
      this.items = [];
      this.render();
      this.setStatus(note, '開発ボードは準備中です（まだ保存先につながっていません）');
      return;
    }
    if (!this.loaded) this.setStatus(note, '読み込み中…');
    try {
      const items = await devBoard.list();
      if (id !== this.loadId) return;
      this.items = items;
      this.loaded = true;
      this.render();
    } catch {
      if (id === this.loadId) this.setStatus(note, '読み込めませんでした。通信を確認して、もう一度開いてください');
    }
  }

  private render(): void {
    if (this.tab === 'feedback') return;
    const list = this.q('.dev-list');
    const shown = this.items.filter((i) => i.status === this.tab);
    list.replaceChildren(...shown.map((item) => this.itemView(item)));
    if (!devBoard.enabled) return;
    const empty = this.tab === 'doing' ? 'いま開発中のものは、ありません' : 'これから開発するものは、まだ決まっていません';
    if (this.loaded) this.setStatus('.dev-status', shown.length === 0 ? empty : '');
  }

  private itemView(item: DevItem): HTMLElement {
    const li = document.createElement('li');
    li.className = 'dev-item';
    const title = document.createElement('div');
    title.className = 'dev-title';
    title.textContent = item.title;
    li.append(title);
    if (item.note) {
      const note = document.createElement('div');
      note.className = 'dev-text';
      note.textContent = item.note;
      li.append(note);
    }
    if (this.adminOn) {
      const bar = document.createElement('div');
      bar.className = 'dev-actions';
      const to: DevStatus = item.status === 'doing' ? 'planned' : 'doing';
      const move = document.createElement('button');
      move.type = 'button';
      move.dataset.devMove = item.id;
      move.dataset.to = to;
      move.textContent = to === 'doing' ? '開発中にする' : 'これからに戻す';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.devRemove = item.id;
      remove.textContent = '削除（完了）';
      bar.append(move, remove);
      li.append(bar);
    }
    return li;
  }

  // 開発者の操作を実行して、結果を表示し、一覧を読み直す
  private async runAdmin(work: () => Promise<void>, done: string): Promise<boolean> {
    const status = '.dev-admin-status';
    this.setStatus(status, '送信中…');
    try {
      await work();
      this.setStatus(status, done);
      await this.load();
      return true;
    } catch (e) {
      console.error('[devboard] 失敗', e);
      this.setStatus(status, describeDevError(e, true));
      return false;
    }
  }

  private async add(form: HTMLFormElement): Promise<void> {
    if (this.tab === 'feedback') return;
    const status = this.tab;
    const f = form.elements;
    const get = (n: string) => (f.namedItem(n) as HTMLInputElement | HTMLTextAreaElement).value;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    const ok = await this.runAdmin(() => devBoard.add(get('code'), status, get('title'), get('note')), '追加しました');
    button.disabled = false;
    if (ok) {
      (f.namedItem('title') as HTMLInputElement).value = '';
      (f.namedItem('note') as HTMLTextAreaElement).value = '';
    }
  }

  private async move(id: string, to: string | undefined): Promise<void> {
    if (!isDevStatus(to)) return;
    await this.runAdmin(() => devBoard.setStatus(this.code(), id, to), '移しました');
  }

  private async remove(id: string): Promise<void> {
    if (!window.confirm('この項目を削除しますか？')) return;
    await this.runAdmin(() => devBoard.remove(this.code(), id), '削除しました');
  }

  private async sendFeedback(form: HTMLFormElement): Promise<void> {
    const f = form.elements;
    const kind = (f.namedItem('kind') as HTMLSelectElement).value;
    const text = f.namedItem('text') as HTMLTextAreaElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = '.dev-feedback-status';
    if (!isFeedbackKind(kind) || button.disabled) return;
    button.disabled = true;
    this.setStatus(status, '送信中…');
    try {
      await devBoard.sendFeedback(kind, text.value, (f.namedItem('name') as HTMLInputElement).value);
      text.value = '';
      this.setStatus(status, '送りました。ありがとうございます！');
    } catch (e) {
      console.error('[devboard] 要望の送信に失敗', e);
      this.setStatus(status, `送れませんでした。${describeDevError(e, false)}`);
    } finally {
      button.disabled = false;
    }
  }
}
