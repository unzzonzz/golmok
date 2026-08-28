import type { Vec3 } from '../core/projection';
import { css, rgba, shade, type RGB } from '../art/palette';
import { fillPolygon, strokePolygon, v3uv, type V3UV } from './raster';

/**
 * 볼록 다각형을 z0~z1로 압출해 그린다.
 *
 * 캐릭터를 한 평면에 납작하게 그리면 위에서 볼 때 두께가 0이 되어
 * "바닥에 붙은 스티커"로 보인다. 옆면을 실제로 그려야 부피가 생긴다.
 *
 * 원기둥을 다각형으로 근사할 때 각이 보이면 안 되므로(§7.3-2) 세그먼트 수는
 * 화면 반경 기준 sagitta r(1-cos(π/n)) 가 0.3px 이하가 되게 잡는다.
 * 40.2px/m 에서 헬멧(반경 0.125m ≈ 5px)은 10각형이면 충분하다.
 */
export interface Pt2 {
  x: number;
  y: number;
}

/** 위에서 오는 빛이 화면 대부분을 결정한다(§4.6). 옆면은 XY 노멀로만 음영. */
const LIGHT_XY = { x: 0.34, y: -0.94 };
const SIDE_AMBIENT = 0.34;
const SIDE_GAIN = 0.34;

const quadBuf: V3UV[] = [v3uv(0, 0, 0), v3uv(0, 0, 0), v3uv(0, 0, 0), v3uv(0, 0, 0)];
const topBuf: V3UV[] = [];

export interface PrismStyle {
  base: RGB;
  /** 윗면 색을 따로 줄 때 (가방 윗면처럼 최대 노출면) */
  top?: RGB;
  outline?: string;
  /** 뒤쪽 옆면에 덧그릴 발광 띠 (재귀반사 테이프 · LED) */
  backGlow?: { color: RGB; alpha: number };
}

export function drawPrism(
  cam: Vec3,
  ctx: CanvasRenderingContext2D,
  poly: readonly Pt2[],
  z0: number,
  z1: number,
  style: PrismStyle,
): void {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    // CCW 다각형의 바깥 노멀
    const nx = ey / len;
    const ny = -ex / len;
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    if (nx * (cam.x - mx) + ny * (cam.y - my) <= 0) continue;

    const k = SIDE_AMBIENT + SIDE_GAIN * Math.max(0, nx * LIGHT_XY.x + ny * LIGHT_XY.y);
    set(quadBuf[0]!, a.x, a.y, z1);
    set(quadBuf[1]!, b.x, b.y, z1);
    set(quadBuf[2]!, b.x, b.y, z0);
    set(quadBuf[3]!, a.x, a.y, z0);
    fillPolygon(cam, ctx, quadBuf, css(shade(style.base, k)));

    // 카메라 반대편(북쪽)을 향한 면에 테이프/LED. 뒤에서 보일 때만 켜진다.
    if (style.backGlow && ny > 0.35) {
      fillPolygon(cam, ctx, quadBuf, rgba(style.backGlow.color, style.backGlow.alpha * ny));
    }
  }

  topBuf.length = 0;
  for (let i = 0; i < n; i++) topBuf.push(v3uv(poly[i]!.x, poly[i]!.y, z1));
  fillPolygon(cam, ctx, topBuf, css(style.top ?? style.base));
  if (style.outline) {
    // 실루엣 잉크 라인 (§7.3-4). 화면 공간 노멀 검출은 M4, 여기선 윤곽만.
    ctx.save();
    ctx.lineJoin = 'round';
    strokePolygon(cam, ctx, topBuf, style.outline, 1.2);
    ctx.restore();
  }
}

function set(v: V3UV, x: number, y: number, z: number): void {
  v.x = x;
  v.y = y;
  v.z = z;
}

// ── 단면 생성기 ────────────────────────────────────────────────────
export function ellipsePoly(
  cx: number, cy: number, rx: number, ry: number, ang: number, seg: number,
  out: Pt2[] = [],
): Pt2[] {
  out.length = 0;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * Math.PI * 2;
    const lx = Math.cos(t) * rx;
    const ly = Math.sin(t) * ry;
    out.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
  }
  return out;
}

/** 모서리 둥근 사각형. 가방·몸통용. lx=전방 길이, ly=좌우 폭 */
export function roundRectPoly(
  cx: number, cy: number, lx: number, ly: number, r: number, ang: number, cornerSeg: number,
  out: Pt2[] = [],
): Pt2[] {
  out.length = 0;
  const hx = lx / 2 - r;
  const hy = ly / 2 - r;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const corners: [number, number, number][] = [
    [hx, hy, 0],
    [-hx, hy, Math.PI / 2],
    [-hx, -hy, Math.PI],
    [hx, -hy, -Math.PI / 2],
  ];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i <= cornerSeg; i++) {
      const t = a0 + (i / cornerSeg) * (Math.PI / 2);
      const lxp = ox + Math.cos(t) * r;
      const lyp = oy + Math.sin(t) * r;
      out.push({ x: cx + lxp * c - lyp * s, y: cy + lxp * s + lyp * c });
    }
  }
  return out;
}

/** 로컬 (전방, 좌) 좌표를 월드 XY로. ang = 전방 방향 */
export function local(ox: number, oy: number, fwd: number, left: number, ang: number): Pt2 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: ox + fwd * c - left * s, y: oy + fwd * s + left * c };
}
