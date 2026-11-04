import * as THREE from 'three';
import type { GameConfig } from './config';

const EYE_HEIGHT = 1.6;
const MAX_PITCH = Math.PI / 2 - 0.05;

// ほぼ中央に立ったまま視点を振るプレイヤー。WASD は一、二歩寄る程度（半径で制限）
export class Player {
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector3(0, EYE_HEIGHT, 0);

  constructor(private cfg: GameConfig) {}

  look(dx: number, dy: number): void {
    this.yaw -= dx * this.cfg.mouseSensitivity;
    this.pitch -= dy * this.cfg.mouseSensitivity;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  move(dt: number, keys: ReadonlySet<string>): void {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    if (forward === 0 && right === 0) return;

    const len = Math.hypot(forward, right);
    const step = (this.cfg.moveSpeed * dt) / len;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // yaw=0 のとき -z が正面
    this.position.x += (right * cos - forward * sin) * step;
    this.position.z += (-right * sin - forward * cos) * step;

    const r = Math.hypot(this.position.x, this.position.z);
    if (r > this.cfg.moveRadius) {
      const k = this.cfg.moveRadius / r;
      this.position.x *= k;
      this.position.z *= k;
    }
  }

  applyTo(camera: THREE.PerspectiveCamera): void {
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
