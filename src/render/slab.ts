import {
  CUTAWAY_ALPHA,
  CUTAWAY_FADE_SEC,
  CUTAWAY_HYSTERESIS_PX,
  CUTAWAY_MIN_HEIGHT_ABOVE,
  QUAD_SPLIT_ECCENTRICITY,
  QUAD_SPLIT_PX,
  VIEW_H,
  VIEW_W,
} from '../core/constants';
import { depthOf, type Vec3 } from '../core/projection';
import { css, rgba, shade, type RGB } from '../art/palette';
import type { Slab } from '../world/slab';
import {
  aabbScreenBounds,
  drawTexturedPoly,
  fillPolygon,
  makeBounds,
  screenBounds,
  strokePolygon,
  v3uv,
  type ScreenBounds,
  type V3UV,
} from './raster';

/**
 * 슬래브를 원근 쿼드로 그린다 (§7.1).
 *
 * 하나의 AABB는 최대 3면만 보인다 (top + 측면 2). 회전이 없으므로 어떤 면이
 * 보이는지는 카메라 위치와 면 노멀의 부호만으로 결정된다.
 */

/** 위에서 오는 빛이 화면의 대부분을 결정한다 (§4.6). 면별 밝기 계수. */
const FACE_LIGHT = {
  top: 1.0,
  south: 0.62,
  east: 0.44,
  west: 0.4,
  north: 0.3,
} as const;

/** 프레임 통계. §8 예산(가시 박스 250개 · 약 600쿼드 · 4.5ms)과 대조하기 위한 실측. */
export const STATS = { faces: 0, quads: 0, textured: 0 };
export function resetStats(): void {
  STATS.faces = 0;
  STATS.quads = 0;
  STATS.textured = 0;
}

const bounds = makeBounds();
const quad: V3UV[] = [v3uv(0, 0, 0), v3uv(0, 0, 0), v3uv(0, 0, 0), v3uv(0, 0, 0)];
const sub: V3UV[] = [v3uv(0, 0, 0), v3uv(0, 0, 0), v3uv(0, 0, 0), v3uv(0, 0, 0)];

function setQ(i: number, x: number, y: number, z: number, u: number, v: number): void {
  const q = quad[i]!;
  q.x = x;
  q.y = y;
  q.z = z;
  q.u = u;
  q.v = v;
}

/** 면의 월드 사각형 + UV를 quad[] 에 채운다. */
function faceQuad(s: Slab, face: keyof typeof FACE_LIGHT, tw: number, th: number): void {
  const x0 = s.x;
  const x1 = s.x + s.w;
  const y0 = s.y;
  const y1 = s.y + s.d;
  const zb = s.zBottom;
  const zt = s.zTop;
  switch (face) {
    case 'top':
      setQ(0, x0, y0, zt, 0, 0);
      setQ(1, x1, y0, zt, tw, 0);
      setQ(2, x1, y1, zt, tw, th);
      setQ(3, x0, y1, zt, 0, th);
      break;
    case 'south':
      setQ(0, x0, y0, zt, 0, 0);
      setQ(1, x1, y0, zt, tw, 0);
      setQ(2, x1, y0, zb, tw, th);
      setQ(3, x0, y0, zb, 0, th);
      break;
    case 'north':
      setQ(0, x1, y1, zt, 0, 0);
      setQ(1, x0, y1, zt, tw, 0);
      setQ(2, x0, y1, zb, tw, th);
      setQ(3, x1, y1, zb, 0, th);
      break;
    case 'west':
      setQ(0, x0, y1, zt, 0, 0);
      setQ(1, x0, y0, zt, tw, 0);
      setQ(2, x0, y0, zb, tw, th);
      setQ(3, x0, y1, zb, 0, th);
      break;
    case 'east':
      setQ(0, x1, y0, zt, 0, 0);
      setQ(1, x1, y1, zt, tw, 0);
      setQ(2, x1, y1, zb, tw, th);
      setQ(3, x1, y0, zb, 0, th);
      break;
  }
}

/** 카메라를 향하는 면인가. 회전이 없으니 부호 검사 한 줄이면 끝난다. */
function faceVisible(s: Slab, face: keyof typeof FACE_LIGHT, cam: Vec3): boolean {
  switch (face) {
    case 'top': return cam.z > s.zTop;
    case 'south': return cam.y < s.y;
    case 'north': return cam.y > s.y + s.d;
    case 'west': return cam.x < s.x;
    case 'east': return cam.x > s.x + s.w;
  }
}

/**
 * §7.1-5 분할 판정.
 * 기본은 기획서대로 "120px 초과 또는 이심률 0.5 초과면 2x2". 다만 옥상처럼
 * 화면에서 400px을 넘는 면은 2x2로도 어파인 왜곡이 남아서, 조건이 걸린 면에
 * 한해 크기에 비례해 최대 4x4까지 올린다. 기획서 임계값은 그대로 지킨다.
 */
function subdivisionLevel(b: ScreenBounds): number {
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const size = Math.max(w, h);
  const cx = (b.minX + b.maxX) / 2 - VIEW_W / 2;
  const cy = (b.minY + b.maxY) / 2 - VIEW_H / 2;
  const ecc = Math.hypot(cx, cy) / Math.hypot(VIEW_W / 2, VIEW_H / 2);
  if (size <= QUAD_SPLIT_PX && ecc <= QUAD_SPLIT_ECCENTRICITY) return 1;
  return Math.max(2, Math.min(4, Math.round(size / QUAD_SPLIT_PX)));
}

function lerpQ(out: V3UV, a: V3UV, b: V3UV, t: number): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.u = a.u + (b.u - a.u) * t;
  out.v = a.v + (b.v - a.v) * t;
}

const e0 = v3uv(0, 0, 0);
const e1 = v3uv(0, 0, 0);
const e2 = v3uv(0, 0, 0);
const e3 = v3uv(0, 0, 0);

/** quad[]의 (s,t) 구간을 sub[]에 이중선형 보간. 면이 평면 사각형이라 정확하다. */
function subQuad(s0: number, s1: number, t0: number, t1: number): void {
  lerpQ(e0, quad[0]!, quad[1]!, s0);
  lerpQ(e1, quad[0]!, quad[1]!, s1);
  lerpQ(e2, quad[3]!, quad[2]!, s0);
  lerpQ(e3, quad[3]!, quad[2]!, s1);
  lerpQ(sub[0]!, e0, e2, t0);
  lerpQ(sub[1]!, e1, e3, t0);
  lerpQ(sub[2]!, e1, e3, t1);
  lerpQ(sub[3]!, e0, e2, t1);
}

/** 슬래브의 화면 바운딩. AABB 8코너 기준 (정렬 간선 판정에 쓰므로 정확해야 한다). */
export function slabScreenBounds(cam: Vec3, s: Slab, out: ScreenBounds): ScreenBounds {
  return aabbScreenBounds(cam, s, out);
}

/**
 * 프러스텀 컬링 (§7.1-1).
 *
 * 정렬이 쓰는 바운딩과 반드시 같은 함수여야 한다. 컬링은 "보인다"고 하는데
 * 정렬 바운딩은 ok=false 를 내면 그 슬래브가 통째로 사라진다.
 */
const cullBounds = makeBounds();
export function slabOnScreen(cam: Vec3, s: Slab, margin = 24): boolean {
  slabScreenBounds(cam, s, cullBounds);
  return (
    cullBounds.ok &&
    cullBounds.maxX > -margin &&
    cullBounds.minX < VIEW_W + margin &&
    cullBounds.maxY > -margin &&
    cullBounds.minY < VIEW_H + margin
  );
}

export type FaceId = keyof typeof FACE_LIGHT;

export interface DrawOptions {
  wireframe?: boolean;
  /** 컷어웨이 페이드 결과 알파 (1 = 불투명) */
  alpha?: number;
  /**
   * ID 패스. 면마다 지정된 단색으로만 칠한다.
   * 화면 점유율을 가림까지 반영해서 정확히 재려면 텍스처 대신 ID를 그려야 한다.
   */
  idColor?: (s: Slab, face: FaceId) => string;
}

export function drawSlab(
  cam: Vec3,
  ctx: CanvasRenderingContext2D,
  s: Slab,
  opts: DrawOptions = {},
): void {
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0.02) return;
  const prevAlpha = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = alpha;

  const faces: (keyof typeof FACE_LIGHT)[] = ['north', 'west', 'east', 'south', 'top'];
  for (const face of faces) {
    if (!faceVisible(s, face, cam)) continue;
    const tex = face === 'top' ? s.topTex : face === 'south' ? s.southTex : undefined;
    const tw = tex ? tex.width : 1;
    const th = tex ? tex.height : 1;
    faceQuad(s, face, tw, th);
    screenBounds(cam, quad, bounds);
    if (!bounds.ok) continue;
    if (bounds.maxX < 0 || bounds.minX > VIEW_W || bounds.maxY < 0 || bounds.minY > VIEW_H) continue;

    if (opts.idColor) {
      fillPolygon(cam, ctx, quad, opts.idColor(s, face));
      continue;
    }

    STATS.faces++;
    if (tex) {
      const n = subdivisionLevel(bounds);
      STATS.quads += n * n;
      STATS.textured += n * n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          subQuad(i / n, (i + 1) / n, j / n, (j + 1) / n);
          drawTexturedPoly(cam, ctx, tex, sub);
        }
      }
    } else {
      STATS.quads++;
      fillPolygon(cam, ctx, quad, css(shade(s.tint, FACE_LIGHT[face])));
    }
    if (opts.wireframe) strokePolygon(cam, ctx, quad, rgba([120, 180, 255] as RGB, 0.5), 1);
  }

  ctx.globalAlpha = prevAlpha;
}

/**
 * 컷어웨이 (§3.2).
 *
 * 68°에서는 v1과 문제가 반전된다 — 카메라가 위에 있으므로 플레이어와 카메라
 * 사이에 건물 옥상이 끼어드는 일이 잦다. 페이드시키되 바닥 접지선은 남긴다.
 * 완전히 사라지면 공간 감각이 무너진다.
 */
export function updateCutaway(
  cam: Vec3,
  s: Slab,
  playerZ: number,
  playerBox: { minX: number; minY: number; maxX: number; maxY: number },
  playerDepth: number,
  dt: number,
): number {
  s.fade ??= 0;
  let occluding = false;
  if (s.cutaway && s.zTop > playerZ + CUTAWAY_MIN_HEIGHT_ABOVE) {
    // 카메라와 플레이어 사이에 있는가
    const slabDepth = depthOf(cam, s.y + s.d / 2, s.zTop);
    if (slabDepth < playerDepth) {
      faceQuad(s, 'top', 1, 1);
      screenBounds(cam, quad, bounds);
      const pad = s.wasOccluding ? CUTAWAY_HYSTERESIS_PX : 0;
      occluding =
        bounds.ok &&
        bounds.maxX + pad > playerBox.minX &&
        bounds.minX - pad < playerBox.maxX &&
        bounds.maxY + pad > playerBox.minY &&
        bounds.minY - pad < playerBox.maxY;
    }
  }
  s.wasOccluding = occluding;
  const target = occluding ? 1 : 0;
  const rate = dt / CUTAWAY_FADE_SEC;
  s.fade += Math.sign(target - s.fade) * Math.min(Math.abs(target - s.fade), rate);
  return 1 - s.fade * (1 - CUTAWAY_ALPHA);
}

/** 페이드된 건물의 바닥 접지선. 이게 없으면 건물이 공중에 뜬 것처럼 보인다. */
export function drawGroundLine(cam: Vec3, ctx: CanvasRenderingContext2D, s: Slab, alpha: number): void {
  if (alpha <= 0.02) return;
  // 지면에 닿아 있는 슬래브만. 옥상 소품의 밑변을 그리면 공중에 뜬 상자로 보인다.
  if (s.zBottom > 0.01) return;
  const x0 = s.x;
  const x1 = s.x + s.w;
  const y0 = s.y;
  const y1 = s.y + s.d;
  const z = s.zBottom;
  strokePolygon(
    cam, ctx,
    [v3uv(x0, y0, z), v3uv(x1, y0, z), v3uv(x1, y1, z), v3uv(x0, y1, z)],
    rgba([150, 190, 235] as RGB, 0.42 * alpha),
    1.5,
  );
}
