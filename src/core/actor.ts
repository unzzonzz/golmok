import {
  ACCEL_AIR,
  ACCEL_GROUND,
  ACTOR_HEIGHT,
  BAG_DAMPING,
  BAG_MAX_OFFSET,
  BAG_STIFFNESS,
  JOG_SPEED,
  JUMP_SPEED,
  SPRINT_SPEED,
  TORSO_LEAD_SEC,
  TURN_RATE,
} from './constants';

/**
 * M0 테스트 액터.
 *
 * 지면은 아직 z=0 평면 하나뿐이다(충돌은 M2). 대신 68°에서 높이가 읽히는지
 * 검증해야 하므로(§11-1, §10 최고 리스크) 디버그용 자유 높이를 지원한다.
 *
 * 가방 관성과 상체 리드를 여기 넣은 이유: §6.4가 68°에서 "더 강력해진다"고
 * 주장하는 장치들이고, 둘 다 20줄 남짓이라 M0에서 바로 검증할 수 있다.
 */
export class Actor {
  wx = 0;
  wy = 0;
  wz = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  onGround = true;
  groundZ = 0;

  readonly height = ACTOR_HEIGHT;

  /** 상체가 먼저 돌고 하체가 따라온다 (§6.4-4). 라디안, 화면 기준 0 = +x */
  torsoAngle = Math.PI / 2;
  legAngle = Math.PI / 2;

  /** 가방 관성 오프셋 (월드 XY, m). §6.4-1 */
  bagOX = 0;
  bagOY = 0;
  private bagVX = 0;
  private bagVY = 0;
  /** 걸음 위상. 가방 좌우 스웨이의 구동원 (§6.6의 주 신호). */
  gaitPhase = 0;

  /** 0..1. 1이면 시간 임박 — 가방 스웨이 진폭이 최대가 된다. */
  urgency = 0;

  lastFallHeight = 0;
  peakZ = 0;

  step(dt: number, dirX: number, dirY: number, sprint: boolean, jump: boolean): void {
    const speed = sprint ? SPRINT_SPEED : JOG_SPEED;
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const moving = dirX !== 0 || dirY !== 0;

    const prevVX = this.vx;
    const prevVY = this.vy;
    this.vx = approach(this.vx, dirX * speed, accel * dt);
    this.vy = approach(this.vy, dirY * speed, accel * dt);

    if (jump && this.onGround) {
      this.vz = JUMP_SPEED;
      this.onGround = false;
      this.peakZ = this.wz;
    }

    // 위치 적분과 충돌 해소는 physics.moveAndCollide 가 맡는다.
    if (this.wz > this.peakZ) this.peakZ = this.wz;

    // ── 방향 (§6.4-4) ──────────────────────────────────────────────
    if (moving) {
      const target = Math.atan2(dirY, dirX);
      this.torsoAngle = turnToward(this.torsoAngle, target, TURN_RATE * dt);
    }
    // 하체는 상체를 시간상수 TORSO_LEAD_SEC 로 뒤따른다 -> 회전 중 몸이 비틀린다
    this.legAngle = turnToward(
      this.legAngle,
      this.torsoAngle,
      Math.min(1, dt / TORSO_LEAD_SEC) * angleDelta(this.legAngle, this.torsoAngle),
    );

    // ── 걸음 위상 ──────────────────────────────────────────────────
    const spd = Math.hypot(this.vx, this.vy);
    this.gaitPhase += dt * (2.0 + spd * 1.55) * (this.onGround ? 1 : 0.25);

    // ── 가방 관성 (§6.4-1) ─────────────────────────────────────────
    // 스프링-댐퍼 2축. 몸이 멈춰도 반박자 늦게 흔들리고, 방향 전환 시 바깥으로 쏠린다.
    const bodyAX = (this.vx - prevVX) / dt;
    const bodyAY = (this.vy - prevVY) / dt;
    this.bagVX += (-BAG_STIFFNESS * this.bagOX - BAG_DAMPING * this.bagVX - bodyAX) * dt;
    this.bagVY += (-BAG_STIFFNESS * this.bagOY - BAG_DAMPING * this.bagVY - bodyAY) * dt;
    this.bagOX += this.bagVX * dt;
    this.bagOY += this.bagVY * dt;
    const mag = Math.hypot(this.bagOX, this.bagOY);
    if (mag > BAG_MAX_OFFSET) {
      const k = BAG_MAX_OFFSET / mag;
      this.bagOX *= k;
      this.bagOY *= k;
      this.bagVX *= k;
      this.bagVY *= k;
    }
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** 디버그: 중력을 무시하고 높이를 직접 잡는다 (높이 판독 검증용). */
  setHeight(z: number): void {
    this.wz = Math.max(this.groundZ, z);
    this.vz = 0;
    this.onGround = this.wz <= this.groundZ + 1e-6;
    this.peakZ = this.wz;
  }
}

function approach(v: number, target: number, maxDelta: number): number {
  const d = target - v;
  return Math.abs(d) <= maxDelta ? target : v + Math.sign(d) * maxDelta;
}

/** a에서 b까지의 최단 각도차 (-PI..PI) */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(a: number, b: number, maxStep: number): number {
  const d = angleDelta(a, b);
  const step = Math.sign(d) * Math.min(Math.abs(d), Math.abs(maxStep));
  return a + step;
}
