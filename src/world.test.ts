import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from './config';
import { Player } from './player';
import { type World, canStand, moveInWorld, rectAt } from './world';

const world: World = {
  bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
  obstacles: [rectAt(0, -2, 2, 1)], // x -1〜1、z -2.5〜-1.5 のカウンター
};
const r = 0.3;

describe('canStand', () => {
  it('壁の内側で、設備から離れていれば立てる', () => {
    expect(canStand(0, 0, r, world)).toBe(true);
  });
  it('壁に体がめり込む位置には立てない（壁ぎわまでは行ける）', () => {
    expect(canStand(3.7, 0, r, world)).toBe(true);
    expect(canStand(3.71, 0, r, world)).toBe(false);
  });
  it('設備の中や、体が設備に触れる位置には立てない', () => {
    expect(canStand(0, -2, r, world)).toBe(false);
    expect(canStand(0, -1.3, r, world)).toBe(false); // カウンターの手前の縁から0.2m
    expect(canStand(0, -1.2, r, world)).toBe(true);
  });
  it('設備の角も円で判定する', () => {
    expect(canStand(1.3, -1.3, r, world)).toBe(true); // 角 (1, -1.5) から約0.36m
    expect(canStand(1.2, -1.4, r, world)).toBe(false); // 角から約0.22m。辺からは離れていても、角に体が触れる
  });
});

describe('moveInWorld', () => {
  it('ぶつからなければそのまま動く', () => {
    expect(moveInWorld(0, 0, 0.1, 0.1, r, world)).toEqual({ x: 0.1, z: 0.1 });
  });
  it('設備にぶつかる軸だけ止まり、沿って滑る', () => {
    const p = moveInWorld(0.5, -1.2, 0.2, -0.2, r, world); // 右へは進めるが、前（-z）は設備でふさがる
    expect(p.x).toBeCloseTo(0.7);
    expect(p.z).toBe(-1.2);
  });
  it('壁の向こうへは出られない', () => {
    expect(moveInWorld(3.6, 0, 1, 0, r, world)).toEqual({ x: 3.6, z: 0 });
  });
});

describe('Player.move', () => {
  it('壁ぎわまで歩ける（中央の半径制限はない）', () => {
    const p = new Player(cfg, world);
    for (let i = 0; i < 600; i++) p.move(1 / 60, new Set(['KeyD'])); // 実ゲームの1フレーム相当
    expect(p.position.x).toBeCloseTo(4 - cfg.playerRadius, 1); // 壁ぎわ（1フレームの歩幅ぶんの誤差）
  });
  it('設備にぶつかると止まる', () => {
    const p = new Player(cfg, world);
    for (let i = 0; i < 600; i++) p.move(1 / 60, new Set(['KeyW'])); // 前（-z）へ
    expect(p.position.z).toBeGreaterThan(-1.5);
  });
});
