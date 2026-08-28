import { JITTER_SETTLE_SEC, JITTER_WINDOW } from '../core/constants';

/**
 * 서브픽셀 흔들림 검출기 — M0 합격 판정의 계측기.
 *
 * 흔들림의 정의: 등속 이동 중 "그려진 정수 좌표"의 프레임간 델타 부호가 뒤집히는 것.
 * (+2, +2, -1, +3 처럼) 부호가 반전되면 눈에는 지지직거림으로 보인다.
 * 델타가 0인 프레임은 반전이 아니다 — 1px보다 느리게 움직이는 정상 상태다.
 *
 * Painter가 반올림을 한 번만 하면 그릴 값이 단조 함수가 되고 round도 단조 함수이므로
 * 이 카운터는 구조적으로 0이어야 한다. 0이 아니면 파이프라인 어딘가에서
 * 두 번 반올림했다는 뜻이다.
 */
export class JitterProbe {
  private readonly ring = new Uint8Array(JITTER_WINDOW);
  private idx = 0;
  private filled = 0;
  private flips = 0;
  private prev: number | null = null;
  private lastDelta = 0;
  private settle = 0;
  maxStep = 0;

  reset(settleSec = JITTER_SETTLE_SEC): void {
    this.ring.fill(0);
    this.idx = 0;
    this.filled = 0;
    this.flips = 0;
    this.prev = null;
    this.lastDelta = 0;
    this.settle = settleSec;
    this.maxStep = 0;
  }

  sample(v: number, dt: number): void {
    if (this.settle > 0) {
      this.settle -= dt;
      this.prev = v;
      this.lastDelta = 0;
      return;
    }
    if (this.prev === null) {
      this.prev = v;
      return;
    }
    const d = v - this.prev;
    this.prev = v;

    let flip = 0;
    if (d !== 0) {
      if (this.lastDelta !== 0 && Math.sign(d) !== Math.sign(this.lastDelta)) flip = 1;
      this.lastDelta = d;
      const mag = Math.abs(d);
      if (mag > this.maxStep) this.maxStep = mag;
    }

    this.flips -= this.ring[this.idx];
    this.ring[this.idx] = flip;
    this.flips += flip;
    this.idx = (this.idx + 1) % this.ring.length;
    if (this.filled < this.ring.length) this.filled++;
  }

  /** 관측 창 안에서 발생한 부호 반전 횟수. 합격 = 0. */
  get flipCount(): number {
    return this.flips;
  }

  get samples(): number {
    return this.filled;
  }

  get settling(): boolean {
    return this.settle > 0;
  }
}
