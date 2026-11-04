export type InputHandlers = {
  onLook: (dx: number, dy: number) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onDiscard: () => void;
  onLockChange: (locked: boolean) => void;
  onTicketZoom: (on: boolean) => void;
};

// PointerLock 中のマウス・キー入力を、ゲーム側のコールバックに橋渡しする
export class Input {
  readonly keys = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    h: InputHandlers,
  ) {
    document.addEventListener('pointerlockchange', () => {
      const locked = this.locked;
      if (!locked) this.keys.clear();
      h.onLockChange(locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.locked) h.onLook(e.movementX, e.movementY);
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        h.onClick();
        // 素早い連打は別の設備への2クリックでも detail=2 になるため、click は常に実行し、追加で doubleClick を呼ぶ
        if (e.detail >= 2) h.onDoubleClick();
      } else if (e.button === 2) {
        h.onDiscard();
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'KeyE') h.onTicketZoom(true);
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'KeyE') h.onTicketZoom(false);
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    // 解除直後の再要求はブラウザに拒否されることがある（その場合は次のクリックで再試行）
    void Promise.resolve(this.canvas.requestPointerLock()).catch(() => {});
  }

  exitLock(): void {
    document.exitPointerLock();
  }
}
