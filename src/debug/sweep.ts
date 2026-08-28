import { JOG_SPEED } from '../core/constants';
import type { Actor } from '../core/actor';

/** 재현 가능한 등속 스윕. 부호 반전 카운터는 등속일 때만 의미가 있다. */
export interface SweepDir {
  name: string;
  wx: number;
  wy: number;
}

export const SWEEP_DIRS: SweepDir[] = [
  { name: '앞 +y', wx: 0, wy: 1 },
  { name: '옆 +x', wx: 1, wy: 0 },
  { name: '대각 (1,0.37)', wx: 1, wy: 0.37 },
  { name: '뒤 -y', wx: 0, wy: -1 },
];

const LEG_SECONDS = 6;

export class SweepTest {
  active = false;
  dirIndex = 0;
  private sign = 1;
  private t = 0;

  toggle(actor: Actor, onReset: () => void): void {
    this.active = !this.active;
    if (this.active) this.restart(actor, onReset);
  }

  cycleDir(actor: Actor, onReset: () => void): void {
    this.dirIndex = (this.dirIndex + 1) % SWEEP_DIRS.length;
    if (this.active) this.restart(actor, onReset);
  }

  restart(actor: Actor, onReset: () => void): void {
    this.sign = 1;
    this.t = 0;
    actor.vx = actor.vy = actor.vz = 0;
    onReset();
  }

  step(actor: Actor, dt: number, onReverse: () => void): void {
    if (!this.active) return;
    const raw = SWEEP_DIRS[this.dirIndex]!;
    const l = Math.hypot(raw.wx, raw.wy) || 1;
    const v = JOG_SPEED * this.sign;
    actor.wx += (raw.wx / l) * v * dt;
    actor.wy += (raw.wy / l) * v * dt;
    actor.vx = (raw.wx / l) * v;
    actor.vy = (raw.wy / l) * v;
    this.t += dt;
    if (this.t >= LEG_SECONDS) {
      this.t = 0;
      this.sign *= -1;
      onReverse();
    }
  }

  get label(): string {
    return this.active ? `SWEEP ${this.sign > 0 ? '+' : '-'} ${SWEEP_DIRS[this.dirIndex]!.name}` : 'MANUAL';
  }
}
