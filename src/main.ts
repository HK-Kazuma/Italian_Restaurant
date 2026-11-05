import * as THREE from 'three';
import { BOTTLE_ACTION } from './bottle';
import { DEFAULT_CONFIG } from './config';
import { FRIDGE_ITEM_NAME, fridgeItemOf } from './fridge';
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
game.world = kitchen.world; // 投げた鍋が、床・台・壁に当たるように
const player = new Player(cfg, kitchen.world);
const interactor = new Interactor(camera, kitchen.interactables, cfg.reach);
let best = loadBest();

const input = new Input(canvas, {
  onLook: (dx, dy) => game.state.phase === 'playing' && player.look(dx, dy),
  onClick: () => interactor.current && game.interact(interactor.current),
  onDoubleClick: () => interactor.current && game.doubleClick(interactor.current),
  onRightClick: () => {
    // 鍋を持っているときは、視点の位置から視線の向きに投げる
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    game.rightClick(interactor.current, { origin, dir });
    // iPad の画面を開いたら、カーソルを出して画面を操作できるようにする
    if (game.state.ipadOpen) {
      interactor.clear();
      input.exitLock();
    }
  },
  onTicketZoom: (on) => hud.setTicketZoom(on),
  onLockChange: (locked) => {
    const { phase } = game.state;
    if (locked && phase === 'ready') game.begin(); // 操作説明をクリック = ゲーム開始
    else if (locked && (phase === 'title' || phase === 'result')) game.startPractice(); // まずは練習キッチン。ゲームは iPad から
    else if (locked) game.resume();
    else if (phase === 'playing' && !game.state.ipadOpen) game.pause(); // Esc で解除 = 一時停止（iPad を開いているときは、カーソルを出しているだけ）
  },
});

const hud = new Hud(
  document.getElementById('hud')!,
  cfg,
  () => input.requestLock(),
  (action) => {
    // iPad の画面から：ゲーム開始（最初の場所に戻り、操作説明を出す。クリックで始まる。冷蔵庫の配置は引き継ぐ）、または閉じて練習に戻る
    if (action === 'start') {
      game.getReady();
      player.reset();
      interactor.clear();
    } else {
      game.closeIpad();
      input.requestLock();
    }
  },
);

// カーソルが出たまま取り残されたとき（再ロックが拒否された直後など）は、画面クリックで視点操作に戻る
canvas.addEventListener('click', () => {
  if (!input.locked && game.state.phase === 'playing' && !game.state.ipadOpen) input.requestLock();
});

// 視点が合っている物に対する、左クリック以外の操作の案内
function hintFor(target: Target | null): string {
  const hand = game.state.hand;
  if (hand?.kind === 'ipad' && !game.state.moving) {
    return target?.kind === 'ipadWall' ? '左クリック：iPadを壁に戻す　右クリック：iPadを開く' : '右クリック：iPadを開く（壁に向けて左クリックで戻す）';
  }
  if (target?.kind === 'ipadWall') return game.state.mode === 'practice' && !hand ? '左クリック：iPadを取る' : '';
  if (hand?.kind === 'tray') {
    if (target?.kind === 'traySlot') return target.id === hand.id ? '左クリック：ここに置く' : 'この置き場には置けない（種類が違う）';
    return 'サラダ台の緑の印（矢印の先）に置く';
  }
  if (hand?.kind === 'bottle') {
    if (game.canUseBottleAt(target)) return `右クリック：${BOTTLE_ACTION[hand.id]}`;
    const p = game.previewBottle(target);
    if (p?.valid) return '左クリック：ここに置く';
    if (p?.reason === 'surface') return 'このボトルは、この台には置けない';
    if (p) return 'ここには置けない（ほかのボトルに近すぎる）';
    return `右クリック：${BOTTLE_ACTION[hand.id]}（皿に視点を合わせて）　左クリック：台の上に置く`;
  }
  const mix = game.mixProgressAt(target);
  if (mix) return `左クリック：混ぜる（${mix.done}/${mix.need}）`;
  if (hand?.kind === 'pot' && !game.state.moving) return '右クリック：鍋を投げる';
  if (target?.kind === 'thrownPot' && !hand) return '左クリック：鍋を拾う';
  // 冷蔵庫：中の物を持ち上げて置き直す／扉の開閉
  if (game.state.moving) {
    const p = game.previewFridge(target);
    if (p) return p.valid ? '右クリック：ここに置く' : 'ここには置けない（ほかの物に重なる）';
    return '棚に視点を合わせて右クリックで置く（それ以外で右クリックすると、やめる）';
  }
  const item = fridgeItemOf(target);
  if (item && game.state.fridgeOpen) return `右クリック：${FRIDGE_ITEM_NAME[item]}を持ち上げて、置き直す`;
  if (target && (target.kind === 'fridgeDoor' || target.kind === 'fridgeShelf' || item)) {
    return `右クリック：冷蔵庫の扉を${game.state.fridgeOpen ? '閉める' : '開ける'}`;
  }
  return '';
}

// トレー・ケースを持っているとき、置き場が画面の外にあれば、画面の縁に向きを示す矢印を出す（見えていれば、3Dの印と矢印がある）
function offscreenGuide(): { left: number; top: number; angle: number; label: string } | null {
  const guide = kitchen.trayGuide(game.state);
  if (!guide) return null;
  const v = guide.world.clone().project(camera);
  let nx = v.x;
  let ny = v.y;
  const behind = v.z > 1; // カメラの後ろ：投影が反転するので、向きを戻す
  if (behind) {
    nx = -nx;
    ny = -ny;
  }
  if (!behind && Math.abs(nx) < 0.9 && Math.abs(ny) < 0.85) return null;
  if (Math.abs(nx) < 1e-3 && Math.abs(ny) < 1e-3) ny = -1;
  // 縁の少し内側に収める
  const k = Math.max(Math.abs(nx) / 0.88, Math.abs(ny) / 0.8);
  nx /= k;
  ny /= k;
  return { left: 50 + nx * 50, top: 50 - ny * 50, angle: Math.atan2(nx, ny), label: guide.label };
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
  if (game.state.phase === 'playing' && !game.state.ipadOpen) interactor.update(game);
  else interactor.clear();
  kitchen.sync(game.state, dt, game.previewBottle(interactor.current), game.previewFridge(interactor.current), interactor.current);
  hud.update(game.state, best, hintFor(interactor.current));
  hud.setGuide(game.state.phase === 'playing' ? offscreenGuide() : null);
  renderer.render(kitchen.scene, camera);
  requestAnimationFrame(frame);
}
frame();
