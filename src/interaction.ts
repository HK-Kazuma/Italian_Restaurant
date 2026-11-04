import * as THREE from 'three';
import type { Game } from './game';
import { TARGET_KEY } from './scene';
import type { Target } from './types';

const HIGHLIGHT = 0x2f7d3a;

function setEmissive(root: THREE.Object3D, hex: number): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) (o.material as THREE.MeshLambertMaterial).emissive.setHex(hex);
  });
}

function findTargetRoot(obj: THREE.Object3D): THREE.Object3D | null {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    if (o.userData[TARGET_KEY]) return o;
  }
  return null;
}

// 画面中央（クロスヘア）の先にある設備を調べ、今の手持ちで操作できるなら光らせる（スナップ方式）
export class Interactor {
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector2(0, 0);
  private root: THREE.Object3D | null = null;
  current: Target | null = null;

  constructor(
    private camera: THREE.Camera,
    private roots: THREE.Object3D[],
    reach: number,
  ) {
    this.raycaster.far = reach;
  }

  update(game: Game): void {
    this.raycaster.setFromCamera(this.center, this.camera);
    const hit = this.raycaster.intersectObjects(this.roots, true)[0];
    const root = hit ? findTargetRoot(hit.object) : null;

    if (this.root && this.root !== root) setEmissive(this.root, 0x000000);
    this.root = root;
    this.current = root ? (root.userData[TARGET_KEY] as Target) : null;

    // 皿の中身が作り直されても光り続けるよう、毎フレーム当て直す
    if (root && this.current) {
      setEmissive(root, game.planInteract(this.current) ? HIGHLIGHT : 0x000000);
    }
  }

  clear(): void {
    if (this.root) setEmissive(this.root, 0x000000);
    this.root = null;
    this.current = null;
  }
}
