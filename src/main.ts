import * as THREE from 'three';
import { DEFAULT_CONFIG } from './config';
import { Game } from './game';
import { Hud } from './hud';
import { Input } from './input';
import { Interactor } from './interaction';
import { Player } from './player';
import { createKitchen } from './scene';
import type { Target } from './types';
import './style.css';

const cfg = DEFAULT_CONFIG;
const BEST_KEY = 'kitchen-time-attack:best';

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // 保存できなくても遊べる
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50);
const kitchen = createKitchen(cfg);
kitchen.scene.add(camera);
camera.add(kitchen.handAnchor);

const game = new Game(cfg);
const player = new Player(cfg, kitchen.world);
const interactor = new Interactor(camera, kitchen.interactables, cfg.reach);
let best = loadBest();

const input = new Input(canvas, {
  onLook: (dx, dy) => game.state.phase === 'playing' && player.look(dx, dy),
  onClick: () => interactor.current && game.interact(interactor.current),
  onDoubleClick: () => interactor.current && game.doubleClick(interactor.current),
  onRightClick: () => game.rightClick(interactor.current),
  onTicketZoom: (on) => hud.setTicketZoom(on),
  onLockChange: (locked) => {
    const { phase } = game.state;
    if (locked && (phase === 'title' || phase === 'result')) game.start();
    else if (locked) game.resume();
    else if (phase === 'playing') game.pause(); // Esc で解除 = 一時停止
  },
});

const hud = new Hud(document.getElementById('hud')!, cfg, () => input.requestLock());

// 視点が合っている物に対する、左クリック以外の操作の案内
function hintFor(target: Target | null): string {
  if (target && (target.kind === 'fridgeDoor' || (target.kind === 'stock' && target.inFridge))) {
    return `右クリック：冷蔵庫の扉を${game.state.fridgeOpen ? '閉める' : '開ける'}`;
  }
  return '';
}

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

if (import.meta.env.DEV) {
  // 動作確認用：ブラウザのコンソールから game / player / interactor を触れる
  Object.assign(window, { game, player, interactor, world: kitchen.world });
}

const timer = new THREE.Timer();
let wasPlaying = false;

function frame(): void {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);

  if (game.state.phase === 'playing') {
    player.move(dt, input.keys);
    game.update(dt);
  }

  // タイムアップ：ハイスコア更新とカーソル解放
  if (wasPlaying && game.state.phase === 'result') {
    if (game.state.score > best) {
      best = game.state.score;
      saveBest(best);
    }
    interactor.clear();
    input.exitLock();
  }
  wasPlaying = game.state.phase === 'playing';

  player.applyTo(camera);
  if (game.state.phase === 'playing') interactor.update(game);
  else interactor.clear();
  kitchen.sync(game.state, dt);
  hud.update(game.state, best, hintFor(interactor.current));
  renderer.render(kitchen.scene, camera);
  requestAnimationFrame(frame);
}
frame();
