/**
 * 높이 판독 검증 (§6.8-3 HEIGHT-CUE, §9 M4.5).
 *
 * §10의 최고 리스크가 "68°에서 높이가 안 읽힘"이고, §11-1은 M0에서 먼저
 * 눈으로 확인하라고 못박았다. 눈으로만 보면 자기가 아는 답에 속으므로,
 * 실제로 맞히는지 세는 퀴즈를 만든다.
 *
 * 합격 기준: 단서 세 개 중 두 개를 꺼도 층을 맞힐 수 있어야 한다.
 */
export interface Cues {
  /** 높이에 따른 화면 수직 오프셋 (15.1 px/m) */
  verticalOffset: boolean;
  /** 높이에 따른 원근 스케일 증가 (+3.6%/m) */
  scale: boolean;
  /** 접지 그림자와의 간격 */
  shadow: boolean;
}

export const ALL_CUES: Cues = { verticalOffset: true, scale: true, shadow: true };

export function cueLabel(c: Cues): string {
  const on = [c.verticalOffset ? '오프셋' : null, c.scale ? '스케일' : null, c.shadow ? '그림자' : null].filter(
    Boolean,
  );
  return on.length === 3 ? '전부' : on.length === 0 ? '없음' : on.join('+');
}

export interface QuizTarget {
  z: number;
  x: number;
  y: number;
  label: string;
}

export class HeightQuiz {
  active = false;
  targets: QuizTarget[] = [];
  current = -1;
  correct = 0;
  attempts = 0;
  errorSum = 0;
  lastResult = '';
  /** 결정적 순서. 라운드마다 다른 답이 나오되 재현은 된다. */
  private seq = 0;

  start(targets: QuizTarget[]): void {
    this.targets = targets;
    this.active = true;
    this.correct = 0;
    this.attempts = 0;
    this.errorSum = 0;
    this.lastResult = '';
    this.seq = 0;
    this.next();
  }

  stop(): void {
    this.active = false;
    this.current = -1;
  }

  next(): QuizTarget | null {
    if (!this.active || this.targets.length === 0) return null;
    // 같은 답이 연속으로 나오지 않게 섞는다
    let n = (this.seq * 7 + 3) % this.targets.length;
    if (n === this.current) n = (n + 1) % this.targets.length;
    this.seq++;
    this.current = n;
    return this.targets[n]!;
  }

  get target(): QuizTarget | null {
    return this.current >= 0 ? (this.targets[this.current] ?? null) : null;
  }

  guess(index: number): void {
    const t = this.target;
    if (!t || index < 0 || index >= this.targets.length) return;
    const guessed = this.targets[index]!;
    this.attempts++;
    const err = Math.abs(guessed.z - t.z);
    this.errorSum += err;
    if (index === this.current) {
      this.correct++;
      this.lastResult = `정답 — ${t.label}`;
    } else {
      this.lastResult = `오답 — 정답은 ${t.label} (${err.toFixed(1)}m 차이)`;
    }
    this.next();
  }

  get summary(): string {
    if (this.attempts === 0) return '아직 응답 없음';
    const pct = ((this.correct / this.attempts) * 100).toFixed(0);
    const mae = (this.errorSum / this.attempts).toFixed(2);
    return `${this.correct}/${this.attempts} (${pct}%)  평균오차 ${mae}m`;
  }
}
