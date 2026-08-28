import {
  CAM_DISTANCE,
  ELEVATION_DEG,
  FOV_Y_DEG,
  MAX_HEIGHT_PLAY,
  VIEW_H,
} from '../core/constants';
import {
  CAM_OFFSET,
  COS_EL,
  FOCAL_PX,
  PX_PER_M_FOCUS,
  PX_PER_M_HEIGHT,
  SIN_EL,
  WALL_VISIBILITY,
} from '../core/projection';
import { SWEEP_DIRS } from './sweep';

/**
 * v2 검증 리포트.
 *
 * M0의 합격 판정이 두 갈래다:
 *   (A) 투영이 §2.1 사양과 일치하는가 — 산술로 확정된다
 *   (B) 68°에서 높이가 읽히는가 — §10의 최고 리스크. 여기서 먼저 잰다
 * 여기에 (C) 카메라 이동 시 격자 흔들림 검사를 더한다.
 */

function row(label: string, got: number, want: number, unit: string, tol: number): string {
  const ok = Math.abs(got - want) <= tol;
  return `${ok ? 'OK  ' : 'DIFF'}  ${label.padEnd(26)} ${got.toFixed(3).padStart(9)}${unit}  기획서 ${want}${unit}`;
}

/** (A) 투영 상수를 기획서 §2.1 · §2.2 · §4.1 수치와 대조한다. */
export function projectionReport(): { pass: boolean; report: string } {
  const rows = [
    row('cos(고도각)', COS_EL, 0.375, '', 0.001),
    row('sin(고도각)', SIN_EL, 0.927, '', 0.001),
    row('카메라 오프셋 y', CAM_OFFSET.y, -9.74, ' m', 0.01),
    row('카메라 오프셋 z', CAM_OFFSET.z, 24.1, ' m', 0.02),
    row('초점평면 스케일', PX_PER_M_FOCUS, 40.2, ' px/m', 0.05),
    row('높이 1m 수직이동', PX_PER_M_HEIGHT, 15.1, ' px', 0.05),
    row('높이 1m 거리감소', (SIN_EL / CAM_DISTANCE) * 100, 3.6, ' %', 0.05),
    row('벽면 가시 비율', WALL_VISIBILITY * 100, 37, ' %', 0.6),
  ];
  const pass = rows.every((r) => r.startsWith('OK'));
  return {
    pass,
    report:
      `[A] 투영 상수 대조 (§2.1 · §2.2 · §4.1)\n` +
      `    고도각 ${ELEVATION_DEG}° / FOV ${FOV_Y_DEG}° / 거리 ${CAM_DISTANCE}m / 초점거리 ${FOCAL_PX.toFixed(1)}px\n` +
      rows.map((r) => '    ' + r).join('\n'),
  };
}

/** (B) 높이별 단서 크기. 세 단서가 각각 얼마나 큰지 숫자로 남긴다. */
export function heightCueReport(measure: (h: number) => { gapPx: number; scalePct: number; offsetPx: number }): string {
  const rows = [0, 3, 5.8, 9, 12, 15, 18].map((h) => {
    const m = measure(h);
    return (
      `    h=${h.toFixed(1).padStart(4)}m  그림자간격 ${m.gapPx.toFixed(1).padStart(6)}px  ` +
      `스케일 ${(m.scalePct >= 0 ? '+' : '') + m.scalePct.toFixed(1)}%`.padEnd(16) +
      `  수직오프셋 ${m.offsetPx.toFixed(1).padStart(6)}px`
    );
  });
  return `[B] 높이 단서 크기 (§2.2 · §6.7)\n` + rows.join('\n');
}

/** (C) 프러스텀이 실제로 담는 것. §4.4 높이 정책과 §4.5 배경 항목에 직접 걸린다. */
export function frustumReport(): string {
  const camZ = CAM_DISTANCE * SIN_EL;
  const behind = CAM_DISTANCE * COS_EL;
  const topDeg = ELEVATION_DEG - FOV_Y_DEG / 2;
  const botDeg = ELEVATION_DEG + FOV_Y_DEG / 2;
  const tanTop = Math.tan((topDeg * Math.PI) / 180);
  const tanBot = Math.tan((botDeg * Math.PI) / 180);
  const planes = [0, 3, 6, 9, 12, 15, 18].map((z) => {
    const near = (camZ - z) / tanBot - behind;
    const far = (camZ - z) / tanTop - behind;
    return `    Z=${String(z).padStart(2)}m 평면: 플레이어 기준 y ${near.toFixed(2).padStart(7)} ~ ${far.toFixed(2).padStart(7)} m`;
  });
  const ahead = [2, 4, 6, 8, 10, 12].map((a) => {
    const zmax = Math.max(0, camZ - tanTop * (a + behind));
    return `    앞 ${String(a).padStart(2)}m 지점: 높이 ${zmax.toFixed(2).padStart(5)}m 까지만 프레임 안`;
  });
  return (
    `[C] 프러스텀 가시 범위 (고도각 ${ELEVATION_DEG}° − FOV/2 ${FOV_Y_DEG / 2}° = 상단 ${topDeg}° 아래)\n` +
    `    수평선은 화면에 없다. 지면이 화면을 가득 채운다.\n` +
    planes.join('\n') +
    '\n' +
    ahead.join('\n') +
    `\n    플레이 블록 상한 ${MAX_HEIGHT_PLAY}m (§4.4) 기준: 옥상이 프레임에 들어오는 건 y ≤ ` +
    `${((camZ - MAX_HEIGHT_PLAY) / tanTop - behind).toFixed(2)}m 인 건물뿐이다.`
  );
}

export interface JitterHooks {
  begin(dirIndex: number): void;
  warm(frames: number, dt: number): void;
  reset(): void;
  measure(frames: number, dt: number): { flipsX: number; flipsY: number; maxStepX: number; maxStepY: number; samples: number };
  end(): void;
}

/** (D) 카메라 이동 중 정적 지오메트리의 화면 좌표가 단조인가. */
export function jitterReport(h: JitterHooks): { pass: boolean; report: string } {
  const rows: string[] = [];
  let fails = 0;
  for (const fps of [30, 60, 120]) {
    for (let d = 0; d < SWEEP_DIRS.length; d++) {
      const dt = 1 / fps;
      h.begin(d);
      h.warm(Math.round(1.5 * fps), dt);
      h.reset();
      const r = h.measure(Math.round(3.5 * fps), dt);
      const ok = r.flipsX === 0 && r.flipsY === 0;
      if (!ok) fails++;
      rows.push(
        `    ${ok ? 'PASS' : 'FAIL'}  ${String(fps).padStart(3)}fps  ${SWEEP_DIRS[d]!.name.padEnd(14)}` +
          `  반전 ${r.flipsX}/${r.flipsY}  최대스텝 ${r.maxStepX}/${r.maxStepY}px  n=${r.samples}`,
      );
    }
  }
  h.end();
  return {
    pass: fails === 0,
    report: `[D] 정적 지오메트리 흔들림 (앵커: 격자 밖 소수 좌표)\n` + rows.join('\n'),
  };
}

export const VIEW_INFO = `내부 해상도 ${1280}x${VIEW_H}`;
