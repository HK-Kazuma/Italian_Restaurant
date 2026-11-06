import * as THREE from 'three';
import type { GameConfig } from './config';
import { type World, moveInWorld } from './world';

const EYE_HEIGHT = 1.6;
const MAX_PITCH = Math.PI / 2 - 0.05;

// 一人称のプレイヤー。視点を振るのが主で、WASD で壁ぎわまで歩ける（壁と設備には入れない）
export class Player {
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector3(0, EYE_HEIGHT, 0);
  lookScale = 1; // 設定（iPad の設定アプリ）による視点の回りやすさの倍率

  constructor(
    private cfg: GameConfig,
    private world: World,
  ) {}

  // 最初に立つ場所と向きに戻す
  reset(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.position.set(0, EYE_HEIGHT, 0);
  }

  look(dx: number, dy: number): void {
    const k = this.cfg.mouseSensitivity * this.lookScale;
    this.yaw -= dx * k;
    this.pitch -= dy * k;
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
    const dx = (right * cos - forward * sin) * step;
    const dz = (-right * sin - forward * cos) * step;
    const next = moveInWorld(this.position.x, this.position.z, dx, dz, this.cfg.playerRadius, this.world);
    this.position.x = next.x;
    this.position.z = next.z;
  }

  applyTo(camera: THREE.PerspectiveCamera): void {
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
