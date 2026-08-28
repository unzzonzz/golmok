import { WORLD, type RGB } from '../art/palette';
import { bakeRoadTexture, bakeRoofTexture, bakeWallTexture } from '../art/textures';
import type { Slab } from './slab';

/**
 * M0 검증용 한 블록 (§4.5의 축소판).
 *
 * 실제 목적은 레벨 디자인이 아니라 §11-1이다 —
 * "여기서 높이가 읽히는지 먼저 눈으로 확인. 안 읽히면 나머지 전부 무의미."
 * 그래서 층이 다른 옥상, 육교, 낮은 상가를 일부러 섞어 놓았다.
 */

const GROUND_Z0 = -0.4;
const TILE = 8;

/** 시작 위치. 상가 B와 C 사이 골목 입구 인도. 건물 안이면 끼인다. */
export const SPAWN = { x: 5.75, y: -6, z: 0 };

interface BuildingSpec {
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  tint: RGB;
  floors: number;
  storefront: boolean;
}

/** §4.4 플레이 블록 높이 상한 18m. 이 표를 넘기면 밸리데이터가 아니라 정책 위반이다. */
const BUILDINGS: BuildingSpec[] = [
  { name: '상가 A', x: -22, y: -4, w: 11.5, d: 10.5, h: 15, tint: WORLD.concrete, floors: 5, storefront: true },
  { name: '상가 B', x: -7, y: -4, w: 11, d: 10.5, h: 12, tint: WORLD.brick, floors: 4, storefront: true },
  { name: '상가 C', x: 7.5, y: -4, w: 12.5, d: 10.5, h: 15, tint: WORLD.concrete, floors: 5, storefront: true },
  { name: '상가 D', x: -22, y: 10, w: 11.5, d: 11, h: 18, tint: WORLD.concrete, floors: 6, storefront: false },
  { name: '저층 E', x: -7, y: 10, w: 11, d: 11, h: 9, tint: WORLD.brick, floors: 3, storefront: false },
  { name: '상가 F', x: 7.5, y: 10, w: 12.5, d: 11, h: 15, tint: WORLD.concrete, floors: 5, storefront: false },
];

export interface Scene {
  slabs: Slab[];
  /** 육교 데크 높이 · 옥상 높이 등 높이 판독 퀴즈에 쓸 후보 */
  heightTargets: { z: number; x: number; y: number; label: string }[];
}

export function buildScene(): Scene {
  const slabs: Slab[] = [];

  // ── 노면 (§4.2 — 옥상과 함께 100% 가시, 최우선) ──────────────────
  // 8x8m 타일 텍스처를 4종만 굽고 돌려 쓴다. 36장을 다 구우면 메모리만 먹는다.
  const roadTex = [
    bakeRoadTexture(TILE, TILE, 101, { puddles: 2, manhole: true }),
    bakeRoadTexture(TILE, TILE, 202, { puddles: 1, lampPool: 0.3 }),
    bakeRoadTexture(TILE, TILE, 303, { puddles: 3, manhole: true, lampPool: 0.7 }),
    bakeRoadTexture(TILE, TILE, 404, { puddles: 1 }),
  ];
  const laneTex = bakeRoadTexture(TILE, TILE, 505, { centerLine: true, laneDashes: true, puddles: 1 });
  const crossTex = bakeRoadTexture(TILE, TILE, 515, { crosswalk: true });
  const walkTex = [
    bakeRoadTexture(TILE, TILE, 606, { tactile: 'north', puddles: 1, lampPool: 0.5 }),
    bakeRoadTexture(TILE, TILE, 707, { tactile: 'south', puddles: 1 }),
  ];

  let t = 0;
  for (let ix = -3; ix < 3; ix++) {
    for (let iy = -3; iy < 3; iy++) {
      const x = ix * TILE;
      const y = iy * TILE;
      // 대로는 y -16..-8, 인도는 y -8..0 근처
      const isRoad = y >= -16 && y < -8;
      const isWalk = y >= -8 && y < 0;
      // 육교 아래(x 0..8)에는 횡단보도를 두지 않는다
      const tex = isRoad
        ? ix === -1
          ? crossTex
          : laneTex
        : isWalk
          ? walkTex[(ix + 3) % 2]!
          : roadTex[t % 4]!;
      t++;
      slabs.push({
        x, y, w: TILE, d: TILE, zBottom: GROUND_Z0, zTop: 0,
        topTex: tex, tint: WORLD.asphalt, cutaway: false, label: `노면 ${ix},${iy}`,
      });
    }
  }

  // ── 블록 경계 (§4.4 — 경계 높이 상한 24m) ────────────────────────
  // 없으면 지면 밖 허공으로 걸어 나간다. 벽 역할이자 골목의 폐쇄감을 만든다.
  const EDGE = 24;
  const T = 1;
  /**
   * 경계벽 높이. §4.4는 상한 24m이지만 카메라가 플레이어 z + 24.107m 에 있어서
   * 24m 벽은 카메라 평면을 0.1m 차이로 스친다 — 니어 평면을 걸치면서 팝핑이 난다.
   * 카메라 높이보다 확실히 낮은 20m로 둔다. §4.4에 반영이 필요한 제약이다.
   */
  const EDGE_H = 20;
  const edgeNS = bakeWallTexture(EDGE * 2 - T * 2, EDGE_H, 810, { floors: 7, litWindowChance: 0.3 });
  const edgeEW = bakeWallTexture(EDGE * 2, EDGE_H, 811, { floors: 7, litWindowChance: 0.3 });
  const edges: [number, number, number, number, HTMLCanvasElement, string][] = [
    [-EDGE, -EDGE, T, EDGE * 2, edgeEW, '경계 서'],
    [EDGE - T, -EDGE, T, EDGE * 2, edgeEW, '경계 동'],
    [-EDGE + T, -EDGE, EDGE * 2 - T * 2, T, edgeNS, '경계 남'],
    [-EDGE + T, EDGE - T, EDGE * 2 - T * 2, T, edgeNS, '경계 북'],
  ];
  for (const [x, y, w, d, tex, label] of edges) {
    const slab: Slab = {
      x, y, w, d, zBottom: 0, zTop: EDGE_H,
      tint: WORLD.concrete, cutaway: true, group: label, label,
    };
    // 남쪽 경계는 카메라 뒤라 남면이 안 보인다. 텍스처를 굽지 않는다.
    if (label !== '경계 남') slab.southTex = tex;
    slabs.push(slab);
  }

  // ── 건물 ─────────────────────────────────────────────────────────
  let seed = 900;
  for (const b of BUILDINGS) {
    slabs.push({
      x: b.x, y: b.y, w: b.w, d: b.d, zBottom: 0, zTop: b.h,
      topTex: bakeRoofTexture(b.w, b.d, seed++),
      southTex: bakeWallTexture(b.w, b.h, seed++, {
        floors: b.floors,
        storefront: b.storefront,
        base: b.tint,
        litWindowChance: 0.42,
      }),
      tint: b.tint,
      cutaway: true,
      group: b.name,
      label: b.name,
    });
    addRoofProps(slabs, b, seed);
    seed += 40;
  }

  // ── 육교 (§4.5) — 높이 판독의 기준자이자 유일한 다층 동선 ─────────
  // 계단 한 칸의 상승은 STEP_UP(0.35m) 이하여야 걸어서 오를 수 있다.
  const deckTop = 5.75;
  const bx = 1.2;
  const bw = 2.6;
  slabs.push({
    x: bx, y: -15.5, w: bw, d: 6, zBottom: deckTop - 0.35, zTop: deckTop,
    topTex: bakeRoadTexture(bw, 6, 777, {}), tint: WORLD.steel,
    cutaway: true, label: '육교 데크',
  });
  const STEPS = 16;
  const RUN = 0.3;
  const TREAD = 0.28; // RUN 보다 작아야 계단끼리 안 겹친다
  for (let i = 0; i < STEPS; i++) {
    const z = deckTop * (1 - (i + 1) / (STEPS + 1)); // 한 칸 0.338m
    slabs.push({
      x: bx, y: -9.5 + i * RUN, w: bw, d: TREAD, zBottom: 0, zTop: z,
      tint: WORLD.steel, cutaway: false, label: `육교 계단 북 ${i}`,
    });
    slabs.push({
      x: bx, y: -15.5 - (i + 1) * RUN, w: bw, d: TREAD, zBottom: 0, zTop: z,
      tint: WORLD.steel, cutaway: false, label: `육교 계단 남 ${i}`,
    });
  }

  // 전부 건물 안이 아닌 자리여야 한다. 충돌이 생겼으므로 건물 안이면 끼인다.
  const heightTargets = [
    { z: 0, x: SPAWN.x, y: SPAWN.y, label: '지면 0m' },
    { z: deckTop, x: 2.5, y: -12.5, label: '육교 데크 5.75m' },
    { z: 9, x: -1.5, y: 14, label: '저층 E 옥상 9m' },
    { z: 12, x: -1.5, y: 1, label: '상가 B 옥상 12m' },
    { z: 15, x: 13, y: 0, label: '상가 C 옥상 15m' },
    { z: 18, x: -16, y: 14, label: '상가 D 옥상 18m' },
  ];

  return { slabs, heightTargets };
}

/** 옥상 소품 (§4.1 — 68°가 벽면을 잃고 얻은 것). */
function addRoofProps(slabs: Slab[], b: BuildingSpec, seed: number): void {
  const z = b.h;
  const g = b.name;
  const inset = 0.6;
  // 파라펫 4면. 옥상 경계가 없으면 어디가 끝인지 안 읽힌다
  const p = 0.24;
  const ph = 0.9;
  slabs.push({ x: b.x, y: b.y, w: b.w, d: p, zBottom: z, zTop: z + ph, tint: WORLD.concrete, cutaway: true, group: g, label: `${b.name} 파라펫S` });
  slabs.push({ x: b.x, y: b.y + b.d - p, w: b.w, d: p, zBottom: z, zTop: z + ph, tint: WORLD.concrete, cutaway: true, group: g, label: `${b.name} 파라펫N` });
  slabs.push({ x: b.x, y: b.y + p, w: p, d: b.d - p * 2, zBottom: z, zTop: z + ph, tint: WORLD.concrete, cutaway: true, group: g, label: `${b.name} 파라펫W` });
  slabs.push({ x: b.x + b.w - p, y: b.y + p, w: p, d: b.d - p * 2, zBottom: z, zTop: z + ph, tint: WORLD.concrete, cutaway: true, group: g, label: `${b.name} 파라펫E` });

  // 물탱크 받침 -> 그 위에 물탱크. Z 구간이 겹치면 안 된다
  const padTop = z + 0.35;
  slabs.push({
    x: b.x + inset + 0.55, y: b.y + b.d - 3.85, w: 2.6, d: 2.6, zBottom: z, zTop: padTop,
    tint: WORLD.concrete, cutaway: true, group: g, label: `${b.name} 탱크받침`,
  });
  // 물탱크 — 위에서 본 서울의 결정적 랜드마크
  slabs.push({
    x: b.x + inset + 0.8, y: b.y + b.d - 3.6, w: 2.1, d: 2.1, zBottom: padTop, zTop: padTop + 2.4,
    tint: WORLD.steel, cutaway: true, group: g, label: `${b.name} 물탱크`,
  });

  // 옥탑방
  slabs.push({
    x: b.x + b.w - 4.4, y: b.y + b.d - 4.2, w: 3.4, d: 3.0, zBottom: z, zTop: z + 2.5,
    topTex: bakeRoofTexture(3.4, 3.0, seed + 7),
    tint: WORLD.brick, cutaway: true, group: g, label: `${b.name} 옥탑방`,
  });

  // 실외기 군집 (§4.1)
  for (let i = 0; i < 4; i++) {
    slabs.push({
      x: b.x + inset + i * 1.15, y: b.y + inset + 0.2, w: 0.9, d: 0.55, zBottom: z, zTop: z + 0.68,
      tint: WORLD.steel, cutaway: true, group: g, label: `${b.name} 실외기${i}`,
    });
  }
}


