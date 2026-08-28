import {
  CAM_DISTANCE,
  ELEVATION_DEG,
  FOV_Y_DEG,
  NEAR_PLANE,
  VIEW_H,
  VIEW_W,
} from './constants';

/**
 * 원근 투영, 고도각 68°, 방위 고정 (§2).
 *
 * 카메라는 절대 회전하지 않으므로 기저 벡터가 상수다. 행렬도, 쿼터니언도 필요 없다.
 *   right = (1, 0, 0)
 *   up    = (0, sin EL,  cos EL)
 *   fwd   = (0, cos EL, -sin EL)
 *
 * 이 세 줄이 v2 렌더 전체의 기반이다.
 */
const EL = (ELEVATION_DEG * Math.PI) / 180;
export const SIN_EL = Math.sin(EL); // 0.92718
export const COS_EL = Math.cos(EL); // 0.37461

/** 플레이어 기준 카메라 오프셋. §2.1의 (0, -9.74, +24.1) */
export const CAM_OFFSET = {
  x: 0,
  y: -CAM_DISTANCE * COS_EL,
  z: CAM_DISTANCE * SIN_EL,
} as const;

/** 초점 거리(px). (VIEW_H/2) / tan(FOV/2) */
export const FOCAL_PX = VIEW_H / 2 / Math.tan((FOV_Y_DEG * Math.PI) / 180 / 2);

/** 초점 평면(26m)에서의 스케일. §2.1의 40.2 px/m */
export const PX_PER_M_FOCUS = FOCAL_PX / CAM_DISTANCE;

/** 높이 1m가 만드는 화면 수직 이동(초점 평면 공칭값). §2.2의 15.1px */
export const PX_PER_M_HEIGHT = COS_EL * PX_PER_M_FOCUS;

/** 벽면 가시 비율. §4.1의 37% */
export const WALL_VISIBILITY = COS_EL;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Projected {
  x: number;
  y: number;
  /** 시선 방향 거리(m). 정렬 키이자 스케일의 분모. */
  depth: number;
  /** 이 깊이에서의 px/m */
  scale: number;
  /** 니어 평면 앞인가 */
  ok: boolean;
}

export function makeProjected(): Projected {
  return { x: 0, y: 0, depth: 0, scale: 0, ok: false };
}

export function project(cam: Vec3, wx: number, wy: number, wz: number, out: Projected): Projected {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const dz = wz - cam.z;
  const depth = dy * COS_EL - dz * SIN_EL; // dot(d, fwd)
  const up = dy * SIN_EL + dz * COS_EL; // dot(d, up)
  out.depth = depth;
  out.ok = depth > NEAR_PLANE;
  const s = FOCAL_PX / depth;
  out.scale = s;
  out.x = VIEW_W / 2 + dx * s;
  out.y = VIEW_H / 2 - up * s;
  return out;
}

/** 시선 방향 거리. 방위가 고정이라 x와 무관하다 (정렬 · 컬링용). */
export function depthOf(cam: Vec3, wy: number, wz: number): number {
  return (wy - cam.y) * COS_EL - (wz - cam.z) * SIN_EL;
}

/**
 * 화면 좌표 -> 높이 planeZ 평면과의 교점.
 * 회전이 없어서 닫힌 형태로 정확히 풀린다. 에디터 마우스 피킹이 여기 얹힌다.
 */
export function screenToPlane(
  cam: Vec3,
  sx: number,
  sy: number,
  planeZ = 0,
  out = { wx: 0, wy: 0, hit: false },
): { wx: number; wy: number; hit: boolean } {
  const vx = (sx - VIEW_W / 2) / FOCAL_PX;
  const vy = -(sy - VIEW_H / 2) / FOCAL_PX;
  // dir = right*vx + up*vy + fwd
  const dirX = vx;
  const dirY = vy * SIN_EL + COS_EL;
  const dirZ = vy * COS_EL - SIN_EL;
  const t = (planeZ - cam.z) / dirZ;
  out.hit = t > 0;
  out.wx = cam.x + dirX * t;
  out.wy = cam.y + dirY * t;
  return out;
}

/** 화면 이동 입력(상하좌우)을 월드 XY로. 방위가 고정이라 이것도 상수 매핑이다. */
export function screenDirToWorld(
  dx: number,
  dy: number,
  out = { wx: 0, wy: 0 },
): { wx: number; wy: number } {
  // 화면 위 = 월드 +y (카메라가 -y에서 본다), 화면 오른쪽 = 월드 +x
  out.wx = dx;
  out.wy = -dy;
  const len = Math.hypot(out.wx, out.wy);
  if (len > 0) {
    out.wx /= len;
    out.wy /= len;
  }
  return out;
}
