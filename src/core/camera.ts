import {
  CAM_DAMPING_XY,
  CAM_DAMPING_Z,
  CAM_STIFFNESS_XY,
  CAM_STIFFNESS_Z,
} from './constants';
import { CAM_OFFSET, type Vec3 } from './projection';

function springStep(pos: number, vel: number, target: number, k: number, c: number, dt: number): [number, number] {
  const nv = vel + (k * (target - pos) - c * vel) * dt;
  return [pos + nv * dt, nv];
}

/**
 * 추종 카메라 (§2.4).
 *
 * 데드존 없음 — 원근에서는 데드존이 있으면 건물 기울기가 미묘하게 흔들려서
 * 오히려 눈에 띈다. 초점(focus)이 플레이어를 스프링으로 따라가고,
 * 카메라 위치는 초점 + 고정 오프셋이다. 회전 · 피치 · FOV 변경은 없다.
 *
 * z 추종 강성만 40으로 낮춘다. 점프에 카메라가 따라 튀면 §2.2의 높이 단서
 * 세 개(수직 이동 · 스케일 · 그림자 간격)가 전부 죽는다.
 */
export class Camera {
  /** 화면 중앙이 바라보는 월드 점. */
  fx = 0;
  fy = 0;
  fz = 0;
  private vx = 0;
  private vy = 0;
  private vz = 0;

  readonly pos: Vec3 = { x: 0, y: 0, z: 0 };

  constructor() {
    this.syncPos();
  }

  snapTo(tx: number, ty: number, tz: number): void {
    this.fx = tx;
    this.fy = ty;
    this.fz = tz;
    this.vx = this.vy = this.vz = 0;
    this.syncPos();
  }

  update(tx: number, ty: number, tz: number, dt: number): void {
    [this.fx, this.vx] = springStep(this.fx, this.vx, tx, CAM_STIFFNESS_XY, CAM_DAMPING_XY, dt);
    [this.fy, this.vy] = springStep(this.fy, this.vy, ty, CAM_STIFFNESS_XY, CAM_DAMPING_XY, dt);
    [this.fz, this.vz] = springStep(this.fz, this.vz, tz, CAM_STIFFNESS_Z, CAM_DAMPING_Z, dt);
    this.syncPos();
  }

  private syncPos(): void {
    this.pos.x = this.fx + CAM_OFFSET.x;
    this.pos.y = this.fy + CAM_OFFSET.y;
    this.pos.z = this.fz + CAM_OFFSET.z;
  }
}
