import { NEAR_PLANE } from '../core/constants';
import { COS_EL, SIN_EL, depthOf, makeProjected, project, type Vec3 } from '../core/projection';

/**
 * 원근 쿼드 래스터의 바닥층 (§7.1).
 *
 * 정적 지오메트리를 프리렌더 비트맵으로 굽는 건 원근에서 불가능하다(§1).
 * 대신 텍스처는 로드 시 1회 굽고, 매 프레임 기하 변환만 다시 한다.
 * Canvas 2D에는 텍스처 삼각형이 없으므로 clip + setTransform 어파인으로 만든다.
 */

export interface V3UV {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
}

export const v3uv = (x: number, y: number, z: number, u = 0, v = 0): V3UV => ({ x, y, z, u, v });

function lerpV(a: V3UV, b: V3UV, t: number): V3UV {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    u: a.u + (b.u - a.u) * t,
    v: a.v + (b.v - a.v) * t,
  };
}

/**
 * 니어 평면 클리핑 (Sutherland-Hodgman). UV를 함께 보간한다.
 *
 * 카메라가 플레이어보다 24m 위에 있어서, 플레이어 뒤쪽의 높은 건물은 실제로
 * 니어 평면을 넘어온다 (y=-24m, 높이 18m 지점에서 깊이 0.3m). 그냥 버리면
 * 화면 아래쪽 건물이 통째로 사라진다.
 */
export function clipNear(cam: Vec3, poly: readonly V3UV[]): V3UV[] {
  const out: V3UV[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const da = depthOf(cam, a.y, a.z) - NEAR_PLANE;
    const db = depthOf(cam, b.y, b.z) - NEAR_PLANE;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) out.push(lerpV(a, b, da / (da - db)));
  }
  return out;
}

const P = makeProjected();
const sxBuf: number[] = [];
const syBuf: number[] = [];

/** 클립된 폴리곤을 화면 좌표로 투영해 버퍼에 채운다. 정점 수를 반환. */
function projectPoly(cam: Vec3, poly: readonly V3UV[]): number {
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    project(cam, p.x, p.y, p.z, P);
    sxBuf[i] = P.x;
    syBuf[i] = P.y;
  }
  return poly.length;
}

/** 단색 폴리곤. 벽면처럼 텍스처가 아까운 면에 쓴다 (§4.2 — 벽면은 37%만 보인다). */
export function fillPolygon(cam: Vec3, ctx: CanvasRenderingContext2D, poly: readonly V3UV[], style: string): void {
  const clipped = clipNear(cam, poly);
  if (clipped.length < 3) return;
  const n = projectPoly(cam, clipped);
  ctx.beginPath();
  ctx.moveTo(sxBuf[0]!, syBuf[0]!);
  for (let i = 1; i < n; i++) ctx.lineTo(sxBuf[i]!, syBuf[i]!);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

export function strokePolygon(
  cam: Vec3,
  ctx: CanvasRenderingContext2D,
  poly: readonly V3UV[],
  style: string,
  width = 1,
  close = true,
): void {
  const clipped = clipNear(cam, poly);
  if (clipped.length < 2) return;
  const n = projectPoly(cam, clipped);
  ctx.beginPath();
  ctx.moveTo(sxBuf[0]!, syBuf[0]!);
  for (let i = 1; i < n; i++) ctx.lineTo(sxBuf[i]!, syBuf[i]!);
  if (close) ctx.closePath();
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * 텍스처 삼각형 하나. UV는 텍스처 픽셀 좌표.
 *
 * expand: 클립 패스를 무게중심 바깥으로 이만큼 밀어 인접 삼각형 사이의
 * 머리카락 틈(hairline seam)을 막는다. 0.5px면 충분하고, 이걸 빼면
 * 쿼드마다 대각선 흰 줄이 보인다.
 */
function texTriangle(
  ctx: CanvasRenderingContext2D,
  tex: CanvasImageSource,
  ax: number, ay: number, au: number, av: number,
  bx: number, by: number, bu: number, bv: number,
  cx: number, cy: number, cu: number, cv: number,
  expand: number,
): void {
  const su1 = bu - au;
  const sv1 = bv - av;
  const su2 = cu - au;
  const sv2 = cv - av;
  const det = su1 * sv2 - su2 * sv1;
  if (Math.abs(det) < 1e-9) return;

  const dx1 = bx - ax;
  const dy1 = by - ay;
  const dx2 = cx - ax;
  const dy2 = cy - ay;
  const a = (dx1 * sv2 - dx2 * sv1) / det;
  const b = (dy1 * sv2 - dy2 * sv1) / det;
  const c = (dx2 * su1 - dx1 * su2) / det;
  const d = (dy2 * su1 - dy1 * su2) / det;
  const e = ax - a * au - c * av;
  const f = ay - b * au - d * av;

  const gx = (ax + bx + cx) / 3;
  const gy = (ay + by + cy) / 3;
  const push = (px: number, py: number): [number, number] => {
    const vx = px - gx;
    const vy = py - gy;
    const l = Math.hypot(vx, vy) || 1;
    return [px + (vx / l) * expand, py + (vy / l) * expand];
  };
  const [pax, pay] = push(ax, ay);
  const [pbx, pby] = push(bx, by);
  const [pcx, pcy] = push(cx, cy);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pax, pay);
  ctx.lineTo(pbx, pby);
  ctx.lineTo(pcx, pcy);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(tex, 0, 0);
  ctx.restore();
}

/**
 * 텍스처 폴리곤(보통 사각형). 니어 클리핑 후 팬 삼각분할.
 * 면이 화면에서 크거나 화면 중심에서 멀면 호출부가 미리 분할해서 넘긴다 (§7.1-5).
 */
export function drawTexturedPoly(
  cam: Vec3,
  ctx: CanvasRenderingContext2D,
  tex: CanvasImageSource,
  poly: readonly V3UV[],
  expand = 0.6,
): void {
  const clipped = clipNear(cam, poly);
  if (clipped.length < 3) return;
  const n = clipped.length;
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = clipped[i]!;
    project(cam, p.x, p.y, p.z, P);
    px.push(P.x);
    py.push(P.y);
  }
  for (let i = 1; i < n - 1; i++) {
    texTriangle(
      ctx, tex,
      px[0]!, py[0]!, clipped[0]!.u, clipped[0]!.v,
      px[i]!, py[i]!, clipped[i]!.u, clipped[i]!.v,
      px[i + 1]!, py[i + 1]!, clipped[i + 1]!.u, clipped[i + 1]!.v,
      expand,
    );
  }
}

/** 화면상 폴리곤 바운딩. 분할 판정과 컷어웨이 판정에 쓴다. */
export interface ScreenBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  ok: boolean;
}

export function screenBounds(cam: Vec3, poly: readonly V3UV[], out: ScreenBounds): ScreenBounds {
  const clipped = clipNear(cam, poly);
  out.ok = clipped.length >= 3;
  if (!out.ok) return out;
  out.minX = Infinity;
  out.minY = Infinity;
  out.maxX = -Infinity;
  out.maxY = -Infinity;
  for (const p of clipped) {
    project(cam, p.x, p.y, p.z, P);
    if (P.x < out.minX) out.minX = P.x;
    if (P.x > out.maxX) out.maxX = P.x;
    if (P.y < out.minY) out.minY = P.y;
    if (P.y > out.maxY) out.maxY = P.y;
  }
  return out;
}

/**
 * AABB 8코너의 화면 바운딩.
 *
 * 폴리곤 클리핑으로 대충 잡으면 안 된다 — 실제 상하 극점은 서로 다른 코너
 * (가까운 아래 코너와 먼 위 코너)에 있어서, 대각 4점만 쓰면 세로 범위를
 * 놓친다. 그러면 정렬 간선이 생기지 않아 캐릭터가 발밑 타일 뒤로 사라진다.
 */
export function aabbScreenBounds(
  cam: Vec3,
  b: { x: number; y: number; w: number; d: number; zBottom: number; zTop: number },
  out: ScreenBounds,
): ScreenBounds {
  out.ok = false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let inFront = 0;

  for (let i = 0; i < 8; i++) {
    CX[i] = i & 1 ? b.x + b.w : b.x;
    CY[i] = i & 2 ? b.y + b.d : b.y;
    CZ[i] = i & 4 ? b.zTop : b.zBottom;
    CD[i] = depthOf(cam, CY[i]!, CZ[i]!) - NEAR_PLANE;
    if (CD[i]! > 0) {
      inFront++;
      project(cam, CX[i]!, CY[i]!, CZ[i]!, P);
      if (P.x < minX) minX = P.x;
      if (P.x > maxX) maxX = P.x;
      if (P.y < minY) minY = P.y;
      if (P.y > maxY) maxY = P.y;
    }
  }
  if (inFront === 0) return out;
  out.ok = true;

  if (inFront < 8) {
    // 니어 평면을 걸친 박스. 앞쪽 코너만으로 바운딩을 잡으면 실제보다 작게
    // 나와서, 화면에 걸쳐 있는데 컬링되거나 정렬 간선이 빠진다.
    // 화면 전체로 여는 건 반대로 간선을 과하게 만들어 정렬 순환을 낳는다.
    // 12개 모서리가 평면과 만나는 점을 추가해서 잘린 박스의 정확한 바운딩을 쓴다.
    NEAR_STRADDLE.count++;
    for (let e = 0; e < 12; e++) {
      const i = EDGE_A[e]!;
      const j = EDGE_B[e]!;
      const di = CD[i]!;
      const dj = CD[j]!;
      if (di > 0 === dj > 0) continue;
      const t = di / (di - dj);
      project(
        cam,
        CX[i]! + (CX[j]! - CX[i]!) * t,
        CY[i]! + (CY[j]! - CY[i]!) * t,
        CZ[i]! + (CZ[j]! - CZ[i]!) * t,
        P,
      );
      if (P.x < minX) minX = P.x;
      if (P.x > maxX) maxX = P.x;
      if (P.y < minY) minY = P.y;
      if (P.y > maxY) maxY = P.y;
    }
  }

  out.minX = minX;
  out.minY = minY;
  out.maxX = maxX;
  out.maxY = maxY;
  return out;
}

const CX = new Float64Array(8);
const CY = new Float64Array(8);
const CZ = new Float64Array(8);
const CD = new Float64Array(8);
/** AABB 12모서리. 코너 인덱스는 비트로 x=1 y=2 z=4. 한 비트만 다르면 모서리다. */
const EDGE_A = [0, 0, 0, 1, 1, 2, 2, 3, 4, 4, 5, 6];
const EDGE_B = [1, 2, 4, 3, 5, 3, 6, 7, 5, 6, 7, 7];

/** 니어 평면을 걸친 박스가 실제로 나오는지 세는 계측용 카운터. */
export const NEAR_STRADDLE = { count: 0 };

export const makeBounds = (): ScreenBounds => ({
  minX: 0, minY: 0, maxX: 0, maxY: 0, ok: false,
});

/** 카메라 기저는 상수다. 다른 모듈이 다시 계산하지 않도록 여기서 내보낸다. */
export const CAM_BASIS = {
  right: [1, 0, 0] as const,
  up: [0, SIN_EL, COS_EL] as const,
  fwd: [0, COS_EL, -SIN_EL] as const,
};
