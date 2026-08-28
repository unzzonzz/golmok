import {
  SHADOW_ALPHA_FALLOFF,
  SHADOW_BASE_ALPHA,
  SHADOW_BASE_RADIUS,
  SHADOW_RADIUS_FALLOFF,
} from '../core/constants';
import { SIN_EL, makeProjected, project, type Vec3 } from '../core/projection';

/**
 * 그림자 = 높이의 주 신호 (§6.7).
 *
 * 68°에서 그림자는 장식이 아니라 UI다. 반드시 "아래에 있는 슬래브 표면"에
 * 그린다. 옥상에 있는데 지면에 그리면 플레이어가 자기가 몇 층인지 못 읽는다.
 *
 * 지면 위의 원은 화면에서 세로로 sin68° = 0.927배 눌린 타원이 된다.
 * 68°가 높아서 거의 원형이고, 그래서 스크린 스페이스 타원 근사가 정확하다.
 */
const P = makeProjected();

export interface ShadowInfo {
  /** 접지면 높이 */
  supportZ: number;
  /** 접지면으로부터의 높이 (m) */
  height: number;
  /** 캐릭터 발과 그림자 중심의 화면 간격 (px) — 높이 판독의 주 단서 */
  gapPx: number;
  screenX: number;
  screenY: number;
  radiusPx: number;
  alpha: number;
}

export function drawShadow(
  cam: Vec3,
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  wz: number,
  supportZ: number,
  out: ShadowInfo,
): ShadowInfo {
  const h = Math.max(0, wz - supportZ);
  const radiusM = SHADOW_BASE_RADIUS / (1 + SHADOW_RADIUS_FALLOFF * h);
  const alpha = SHADOW_BASE_ALPHA / (1 + SHADOW_ALPHA_FALLOFF * h);

  project(cam, wx, wy, supportZ, P);
  out.supportZ = supportZ;
  out.height = h;
  out.screenX = P.x;
  out.screenY = P.y;
  out.radiusPx = radiusM * P.scale;
  out.alpha = alpha;

  project(cam, wx, wy, wz, P);
  out.gapPx = out.screenY - P.y;

  if (!P.ok || out.radiusPx < 0.5) return out;

  const rx = out.radiusPx;
  ctx.save();
  ctx.translate(out.screenX, out.screenY);
  ctx.scale(1, SIN_EL);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha.toFixed(3)})`);
  g.addColorStop(0.62, `rgba(0,0,0,${(alpha * 0.72).toFixed(3)})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return out;
}

export const makeShadowInfo = (): ShadowInfo => ({
  supportZ: 0, height: 0, gapPx: 0, screenX: 0, screenY: 0, radiusPx: 0, alpha: 0,
});
