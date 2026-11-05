import * as THREE from 'three';

// 湯気。ふわっとした白い丸（スプライト）が、立ちのぼりながら大きくなって消えるのを繰り返す。
// intensity（0〜1）で量が変わる：粒の数と濃さが増える。見た目だけで、ゲームの状態は持たない。

let puffTexture: THREE.CanvasTexture | null = null;

function getPuffTexture(): THREE.CanvasTexture {
  if (puffTexture) return puffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

export type SteamOptions = {
  count?: number; // 同時に出せる粒の最大数（intensity=1 のとき）
  rise?: number; // 立ちのぼる高さ（m）
  spread?: number; // 発生源の広がり・横へのゆらぎ（m）
  size?: number; // 粒の最終的な大きさの目安（m）
  life?: number; // 粒が消えるまでの秒数
};

type Puff = {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  x0: number;
  z0: number;
  drift: number; // 横へのゆらぎの向きと大きさ
  phase: number;
};

export class Steam {
  readonly group = new THREE.Group();
  private puffs: Puff[] = [];
  private opts: Required<SteamOptions>;

  constructor(opts: SteamOptions = {}) {
    this.opts = { count: 14, rise: 0.5, spread: 0.06, size: 0.3, life: 1.8, ...opts };
    for (let i = 0; i < this.opts.count; i++) {
      const material = new THREE.SpriteMaterial({
        map: getPuffTexture(),
        transparent: true,
        depthWrite: false, // 粒どうし・ラベルとの前後で、おかしな欠け方をしないように
        opacity: 0,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      // 最初は寿命が尽きた状態にして、update で出す本数だけ順に出し直す（ばらけて出る）
      this.puffs.push({ sprite, age: 0, life: 0, x0: 0, z0: 0, drift: 0, phase: i * 1.7 });
    }
  }

  private respawn(p: Puff, stagger: boolean): void {
    const { spread, life } = this.opts;
    p.life = life * (0.8 + Math.random() * 0.4);
    p.age = stagger ? Math.random() * p.life : 0; // 最初だけ寿命の途中から始めて、一斉に出るのを避ける
    p.x0 = (Math.random() * 2 - 1) * spread * 0.5;
    p.z0 = (Math.random() * 2 - 1) * spread * 0.5;
    p.drift = (Math.random() * 2 - 1) * spread;
  }

  // dt=0 のときは時間が止まる（一時停止中）。intensity: 0 = 出ない、1 = いちばん多い
  update(dt: number, intensity: number): void {
    const level = Math.min(1, Math.max(0, intensity));
    const active = Math.round(level * this.puffs.length);
    const { rise, size } = this.opts;
    const alpha = 0.18 + 0.4 * level; // 量が多いほど濃い

    this.puffs.forEach((p, i) => {
      p.age += dt;
      if (p.age >= p.life) {
        if (i >= active) {
          p.sprite.visible = false;
          return;
        }
        this.respawn(p, p.life === 0); // 初めて出るときだけ、寿命の途中から
      }
      const t = p.age / p.life;
      p.sprite.visible = true;
      p.sprite.position.set(
        p.x0 + Math.sin(p.phase + t * 4) * 0.02 + p.drift * t,
        t * rise,
        p.z0,
      );
      const s = size * (0.45 + 0.9 * t);
      p.sprite.scale.set(s, s, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = alpha * Math.sin(Math.PI * t); // 出て、濃くなって、消える
    });
  }
}
