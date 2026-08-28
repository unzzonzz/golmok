import { ACTOR_FOOTPRINT, GRAVITY, STEP_UP } from '../core/constants';
import type { Actor } from '../core/actor';
import type { Slab } from './slab';

/**
 * AABB 충돌 (§3.1).
 *
 * 3D 물리가 아니다. 플레이어의 [z, z+height] 구간과 겹치는 슬래브만 후보로
 * 추리고, 후보에 대해 2D AABB 검사만 한다. 축 하나씩 이동하고 밀어낸다.
 */
const R = ACTOR_FOOTPRINT / 2;

/** 이 슬래브가 높이 z에 서 있는 액터를 막는가. stepUp 이하 턱은 막지 않는다. */
function blocks(s: Slab, z: number, height: number): boolean {
  return s.zTop > z + STEP_UP && s.zBottom < z + height - 1e-4;
}

function overlapsXY(x: number, y: number, s: Slab): boolean {
  return x + R > s.x && x - R < s.x + s.w && y + R > s.y && y - R < s.y + s.d;
}

/** 발밑 지지면. 발자국 사각형과 겹치는 슬래브의 zTop 최댓값. */
export function supportZ(slabs: readonly Slab[], x: number, y: number, ceilZ: number): number {
  let best = 0;
  for (const s of slabs) {
    if (!overlapsXY(x, y, s)) continue;
    if (s.zTop <= ceilZ + 1e-4 && s.zTop > best) best = s.zTop;
  }
  return best;
}

/**
 * 스윕 지지면. [toZ, fromZ] 구간을 이 프레임에 통과한 슬래브까지 잡는다.
 *
 * 점 검사만 하면 낙하 속도가 두께를 넘는 순간 그대로 관통한다.
 * 18m에서 떨어지면 28m/s = 스텝당 0.23m 이고, 육교 데크는 0.35m 두께라
 * 실제로 뚫고 지나갔다. 낙하 판정은 반드시 구간 검사여야 한다.
 */
function sweptSupportZ(
  slabs: readonly Slab[],
  x: number,
  y: number,
  fromZ: number,
  toZ: number,
): number {
  let best = 0;
  for (const s of slabs) {
    if (!overlapsXY(x, y, s)) continue;
    if (s.zTop <= fromZ + 1e-4 && s.zTop >= toZ - 1e-4 && s.zTop > best) best = s.zTop;
  }
  return best;
}

/** 머리 위 천장. 점프해서 육교 아래에 부딪히는 경우. */
function ceilingZ(slabs: readonly Slab[], x: number, y: number, aboveZ: number): number {
  let best = Infinity;
  for (const s of slabs) {
    if (!overlapsXY(x, y, s)) continue;
    if (s.zBottom >= aboveZ - 1e-4 && s.zBottom < best) best = s.zBottom;
  }
  return best;
}

export function moveAndCollide(slabs: readonly Slab[], a: Actor, dt: number): void {
  const h = a.height;

  // ── X ────────────────────────────────────────────────────────────
  const dx = a.vx * dt;
  a.wx += dx;
  for (const s of slabs) {
    if (!blocks(s, a.wz, h) || !overlapsXY(a.wx, a.wy, s)) continue;
    if (dx > 0) a.wx = s.x - R;
    else if (dx < 0) a.wx = s.x + s.w + R;
    else a.wx = a.wx < s.x + s.w * 0.5 ? s.x - R : s.x + s.w + R;
    a.vx = 0;
  }

  // ── Y ────────────────────────────────────────────────────────────
  const dy = a.vy * dt;
  a.wy += dy;
  for (const s of slabs) {
    if (!blocks(s, a.wz, h) || !overlapsXY(a.wx, a.wy, s)) continue;
    if (dy > 0) a.wy = s.y - R;
    else if (dy < 0) a.wy = s.y + s.d + R;
    else a.wy = a.wy < s.y + s.d * 0.5 ? s.y - R : s.y + s.d + R;
    a.vy = 0;
  }

  // ── Z ────────────────────────────────────────────────────────────
  const prevZ = a.wz;
  a.vz -= GRAVITY * dt;
  a.wz += a.vz * dt;

  const ceil = ceilingZ(slabs, a.wx, a.wy, a.wz + h * 0.5);
  if (a.vz > 0 && a.wz + h > ceil) {
    a.wz = ceil - h;
    a.vz = 0;
  }

  // 착지 판정. 낙하 중에는 이번 프레임에 통과한 구간 [wz, prevZ] 전체를 본다.
  // 상승 중에 위쪽 면을 잡으면 점프가 시작하자마자 다시 붙는다.
  const ground = a.onGround
    ? supportZ(slabs, a.wx, a.wy, a.wz + STEP_UP)
    : a.vz <= 0
      ? Math.max(
          supportZ(slabs, a.wx, a.wy, a.wz),
          sweptSupportZ(slabs, a.wx, a.wy, prevZ, a.wz),
        )
      : supportZ(slabs, a.wx, a.wy, a.wz);
  a.groundZ = ground;
  if (a.wz <= ground + 1e-4) {
    if (!a.onGround) a.lastFallHeight = Math.max(0, a.peakZ - ground);
    a.wz = ground;
    a.vz = 0;
    a.onGround = true;
    a.peakZ = ground;
  } else if (a.vz <= 0 && a.onGround && a.wz - ground < STEP_UP) {
    // 내리막 계단에서 공중에 붕 뜨지 않게 붙여준다
    a.wz = ground;
    a.vz = 0;
  } else {
    a.onGround = false;
  }
}
