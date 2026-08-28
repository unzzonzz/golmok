import { BAG_SWAY_URGENT } from '../core/constants';
import { SIN_EL, depthOf, makeProjected, project, type Vec3 } from '../core/projection';
import { CHAR, LIGHT, UI, rgba, type RGB } from '../art/palette';
import type { Actor } from '../core/actor';
import { drawPrism, ellipsePoly, local, roundRectPoly, type Pt2, type PrismStyle } from './prism';

/**
 * 캐릭터 프록시 (§6.1 / §6.3).
 *
 * §6.1의 결론이 "위에서 본 오렌지 사각형 + 헬멧 원"이므로 실루엣은 그 형태를
 * 따르되, 파트마다 실제 높이 구간을 가진 압출 입체로 그린다. 납작한 평면으로
 * 그리면 68°에서 바닥 스티커로 보인다.
 *
 * M4의 소프트웨어 래스터라이저가 이 자리를 대체한다.
 */

/**
 * 미터 단위 치수 (§6.3). 총 높이 1.78m
 *
 * 위에서 본 윤곽이 **넓은 사각형 → 좁은 몸통 → 튀어나온 원**의 3단으로
 * 계단지게 잡는다. 이 단차가 없으면 26px 폭에서 전부 한 덩어리로 뭉친다.
 *   가방 0.62 폭  >  어깨 0.44  >  헬멧 지름 0.28
 * 그리고 헬멧이 몸통 앞으로 확실히 삐져나와야 머리가 머리로 읽힌다.
 */
const SHOULDER_W = 0.44;
const SHOULDER_D = 0.26;
/**
 * §6.3-1은 등판 폭의 1.4배지만 1.5배로 올렸다.
 * 1.4배(0.62m = 25px)에서는 팔까지 포함한 어깨 폭(0.60m)과 차이가 0.6px밖에
 * 안 나서 실루엣에 단차가 생기지 않는다. v1 1.3 -> v2 1.4 로 올린 것과
 * 같은 이유(실루엣 인식)의 연장이다. §6.3에 반영이 필요하다.
 */
const BAG_W = SHOULDER_W * 1.5;
/** 40L 급 부피. 얕으면 위에서 사각형이 아니라 띠로 보인다. */
const BAG_D = 0.42;
const BAG_BACK = 0.30;
const HELMET_R = 0.15;
/** 몸통 앞끝(0.13)보다 확실히 앞. 헬멧 앞끝이 +0.29 가 된다. */
const HELMET_FWD = 0.15;

const Z = {
  legTop: 0.86,
  torso0: 0.80,
  torso1: 1.44,
  arm0: 0.95,
  arm1: 1.38,
  bag0: 0.88,
  /** 어깨(1.44) 위로 8cm 솟는다 (§6.3-1) */
  bag1: 1.52,
  helm0: 1.42,
  helm1: 1.70,
  cap1: 1.78,
} as const;

export interface ActorCues {
  verticalOffset: boolean;
  scale: boolean;
}

/** §6.8-1 SILHOUETTE — 전부 검게 칠했을 때 직업이 읽혀야 한다. */
let silhouette = false;
export function setSilhouette(on: boolean): void {
  silhouette = on;
}

export interface ProxyResult {
  screenX: number;
  screenY: number;
  scale: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  depth: number;
}

interface Part {
  poly: Pt2[];
  z0: number;
  z1: number;
  style: PrismStyle;
  depth: number;
}

const P = makeProjected();
const Q = makeProjected();
const parts: Part[] = [];
const ink = rgba(CHAR.bagEdge, 0.9);

export function drawActorProxy(
  cam: Vec3,
  ctx: CanvasRenderingContext2D,
  a: Actor,
  supportZ: number,
  timeSec: number,
  cues: ActorCues,
  out: ProxyResult,
  rimAlpha = 0,
): ProxyResult {
  // 단서 토글: 수직 오프셋을 끄면 접지면 높이에 그리고,
  // 스케일을 끄면 접지면 깊이의 배율로 되돌린다 (§6.8-3 HEIGHT-CUE).
  const baseZ = cues.verticalOffset ? a.wz : supportZ;
  project(cam, a.wx, a.wy, a.wz, P);
  project(cam, a.wx, a.wy, supportZ, Q);

  out.screenX = P.x;
  out.screenY = P.y;
  out.scale = P.scale;
  out.depth = depthOf(cam, a.wy, a.wz + 0.9);
  const reach = 0.75 * P.scale;
  out.minX = P.x - reach;
  out.maxX = P.x + reach;
  out.minY = P.y - reach * 2;
  out.maxY = P.y + reach * 0.4;
  if (!P.ok) return out;

  cachedCam = cam;
  const gait = a.gaitPhase;
  const swayMul = 1 + a.urgency * (BAG_SWAY_URGENT - 1);
  const spdN = Math.min(1, a.speed / 5.2);
  const stride = Math.sin(gait) * 0.14 * spdN;
  const swing = Math.sin(gait) * 0.16 * spdN;
  const bob = Math.sin(gait * 2) * 0.02 * spdN;

  const ta = a.torsoAngle;
  const la = a.legAngle;
  const ox = a.wx;
  const oy = a.wy;

  parts.length = 0;

  // ── 다리 (§6.1 — 거의 안 보이지만 두께를 만든다) ─────────────────
  for (const side of [-1, 1]) {
    const c = local(ox, oy, stride * side, -0.10 * side, la);
    parts.push(part(ellipsePoly(c.x, c.y, 0.105, 0.085, la, 10), 0, Z.legTop + bob, {
      base: CHAR.pantsDark, outline: ink,
    }));
  }

  // ── 팔. 오른팔은 폰을 쥐고 있어 진폭 30% (§6.4-2) ───────────────
  const armSwing = [swing, -swing * 0.3];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    // 팔은 가방 폭 안쪽 깊숙이. 팔이 가방만큼 넓으면 "넓은 사각형 -> 좁은 몸통"
    // 단차가 사라져서, 위에서 보면 전부 한 덩어리가 된다.
    const c = local(ox, oy, 0.02 + armSwing[i]!, 0.21 * side, ta);
    parts.push(part(ellipsePoly(c.x, c.y, 0.07, 0.055, ta, 8), Z.arm0 + bob, Z.arm1 + bob, {
      base: CHAR.jacketShadow, outline: ink,
    }));
  }

  // ── 몸통 ────────────────────────────────────────────────────────
  parts.push(part(roundRectPoly(ox, oy, SHOULDER_D, SHOULDER_W, 0.09, ta, 3), Z.torso0 + bob, Z.torso1 + bob, {
    base: CHAR.jacket, top: CHAR.jacketShadow, outline: ink,
  }));

  // ── 가방 — 실루엣의 45%, 윗면이 최대 노출면 (§6.3-1) ────────────
  // 관성 오프셋은 월드 XY. 방향 전환 시 바깥으로 쏠린다 (§6.4-1).
  const swayLeft = Math.sin(gait) * 0.03 * spdN * swayMul;
  const bagC = local(ox, oy, -BAG_BACK, swayLeft, ta);
  bagC.x += a.bagOX;
  bagC.y += a.bagOY;
  const flash = 0.5 + 0.5 * Math.max(0, Math.sin(timeSec * 0.7));
  // 모서리를 각지게 (반경 0.03). 둥글면 몸통과 구분이 안 된다.
  parts.push(part(roundRectPoly(bagC.x, bagC.y, BAG_D, BAG_W, 0.03, ta, 2), Z.bag0 + bob, Z.bag1 + bob, {
    base: CHAR.bag,
    top: CHAR.bagLit,
    outline: ink,
    // §6.5-1 재귀반사 테이프 — v2에서 윗면 + 뒷면으로 이동, 최우선 승격
    backGlow: { color: CHAR.tape, alpha: 0.28 + 0.34 * flash },
  }));

  // ── 헬멧 + 정수리 마킹(방향 판독 기능, §6.3-2) ──────────────────
  const helmC = local(ox, oy, HELMET_FWD, 0, ta);
  parts.push(part(ellipsePoly(helmC.x, helmC.y, HELMET_R, HELMET_R, ta, 12), Z.helm0 + bob, Z.helm1 + bob, {
    base: CHAR.helmet,
    top: CHAR.helmetLit,
    outline: ink,
    // §6.5-2 후미 적색 LED. 카메라가 뒤에 있어 항상 보인다
    backGlow: { color: LIGHT.ledRed, alpha: Math.sin((timeSec / 1.1) * Math.PI * 2) > 0 ? 0.85 : 0.12 },
  }));
  const capC = local(ox, oy, HELMET_FWD, 0, ta);
  parts.push(part(ellipsePoly(capC.x, capC.y, HELMET_R * 0.82, HELMET_R * 0.82, ta, 12), Z.helm1 + bob, Z.cap1 + bob, {
    base: CHAR.helmet, top: CHAR.helmet, outline: ink,
  }));

  // 먼 파트부터. depth 는 시선거리이므로 내림차순이 far-first 다.
  parts.sort((p, q) => q.depth - p.depth);

  // 스케일 단서를 끈 경우, 화면 공간에서 배율만 되돌린다.
  const k = cues.scale ? 1 : Q.scale / P.scale;
  const anchorY = cues.verticalOffset ? P.y : Q.y;
  const shiftZ = baseZ - a.wz;
  ctx.save();
  if (k !== 1 || shiftZ !== 0) {
    ctx.translate(P.x, anchorY);
    ctx.scale(k, k);
    ctx.translate(-P.x, -P.y);
  }
  for (const p of parts) drawPrism(cam, ctx, p.poly, p.z0, p.z1, p.style);
  ctx.restore();

  if (silhouette) return out;

  // ── 정수리 마킹 — 위에서 방향을 읽는 유일한 단서 ────────────────
  const mk = local(ox, oy, HELMET_FWD, 0, ta);
  project(cam, mk.x, mk.y, Z.cap1 + bob, Q);
  ctx.save();
  ctx.translate(Q.x, Q.y);
  ctx.transform(Q.scale, 0, 0, -Q.scale * SIN_EL, 0, 0);
  ctx.rotate(ta);
  ctx.fillStyle = rgba(CHAR.helmetMark, 0.95);
  ctx.fillRect(-0.02, -HELMET_R * 0.26, HELMET_R * 0.95, HELMET_R * 0.5);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // ── 폰 낙하광 (§6.5-3 — 68°에서 재설계된 형태) ──────────────────
  const ph = local(ox, oy, 0.34, -0.3, ta);
  project(cam, ph.x, ph.y, supportZ, Q);
  const glowR = 0.7 * Q.scale;
  const g = ctx.createRadialGradient(Q.x, Q.y, 0, Q.x, Q.y, glowR);
  g.addColorStop(0, rgba(LIGHT.phoneBlue, 0.26));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(Q.x, Q.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // ── 컷어웨이 중 시안 림 (§3.2) ──────────────────────────────────
  if (rimAlpha > 0.02) {
    ctx.strokeStyle = rgba(UI.rim, rimAlpha);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(P.x, P.y - 0.9 * P.scale * 0.6, 0.55 * P.scale, 0.75 * P.scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  return out;
}

const BLACK: RGB = [0, 0, 0];

function part(poly: Pt2[], z0: number, z1: number, style: PrismStyle): Part {
  if (silhouette) style = { base: BLACK, top: BLACK };
  let sy = 0;
  for (const p of poly) sy += p.y;
  // 시선거리. 위쪽(z가 큰) 파트일수록 카메라에 가깝다 — sin68°가 z에 걸린다.
  const depth = depthOf(cachedCam, sy / poly.length, (z0 + z1) * 0.5);
  return { poly: poly.slice(), z0, z1, style, depth };
}

/** part() 가 카메라를 인자로 받지 않아도 되게 프레임마다 저장해 둔다. */
let cachedCam: Vec3 = { x: 0, y: 0, z: 0 };

export const makeProxyResult = (): ProxyResult => ({
  screenX: 0, screenY: 0, scale: 0, minX: 0, minY: 0, maxX: 0, maxY: 0, depth: 0,
});
