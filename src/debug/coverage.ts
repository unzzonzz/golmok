import { VIEW_H, VIEW_W } from '../core/constants';
import type { Vec3 } from '../core/projection';
import { drawSlab, slabOnScreen, type FaceId } from '../render/slab';
import type { Slab } from '../world/slab';

/**
 * 면 종류별 화면 점유율 실측.
 *
 * §4.2의 아트 우선순위표는 "면 자체가 몇 % 보이는가"(투영 압축률)로 쓰여 있다.
 * 그런데 아트 예산을 정하는 진짜 기준은 "화면의 몇 %를 그 면이 차지하는가"다.
 * 둘은 다르다 — 벽면이 37%로 압축돼도 골목에 서면 화면을 지배할 수 있다.
 *
 * 가림까지 반영해야 하므로 ID 패스를 그려서 픽셀을 센다. 추정이 아니다.
 */
const KEYS = ['노면', '옥상', '벽 남', '벽 동서', '벽 북', '하늘'] as const;
export type CoverageKey = (typeof KEYS)[number];

const ID: Record<CoverageKey, [number, number, number]> = {
  노면: [10, 0, 0],
  옥상: [20, 0, 0],
  '벽 남': [30, 0, 0],
  '벽 동서': [40, 0, 0],
  '벽 북': [50, 0, 0],
  하늘: [0, 0, 0],
};

function keyFor(s: Slab, face: FaceId): CoverageKey {
  if (face === 'top') return s.zTop <= 0.01 ? '노면' : '옥상';
  if (face === 'south') return '벽 남';
  if (face === 'north') return '벽 북';
  return '벽 동서';
}

let buf: HTMLCanvasElement | null = null;

export function measureCoverage(cam: Vec3, slabs: readonly Slab[]): Record<CoverageKey, number> {
  buf ??= document.createElement('canvas');
  buf.width = VIEW_W;
  buf.height = VIEW_H;
  const ctx = buf.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('커버리지 버퍼 생성 실패');
  ctx.fillStyle = 'rgb(0,0,0)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const list = slabs
    .filter((s) => slabOnScreen(cam, s))
    .map((s) => ({
      s,
      depth: (s.y + s.d / 2 - cam.y) * 0.37461 - ((s.zBottom + s.zTop) / 2 - cam.z) * 0.92718,
    }))
    .sort((a, b) => b.depth - a.depth);

  for (const e of list) {
    drawSlab(cam, ctx, e.s, {
      idColor: (sl, face) => {
        const c = ID[keyFor(sl, face)];
        return `rgb(${c[0]},${c[1]},${c[2]})`;
      },
    });
  }

  const data = ctx.getImageData(0, 0, VIEW_W, VIEW_H).data;
  const counts: Record<string, number> = {};
  for (const k of KEYS) counts[k] = 0;
  const lookup = new Map<number, CoverageKey>();
  for (const k of KEYS) lookup.set(ID[k][0], k);
  for (let i = 0; i < data.length; i += 4) {
    const k = lookup.get(data[i]!);
    if (k) counts[k]!++;
  }
  const total = VIEW_W * VIEW_H;
  const out = {} as Record<CoverageKey, number>;
  for (const k of KEYS) out[k] = (counts[k]! / total) * 100;
  return out;
}

export function coverageReport(rows: [string, Record<CoverageKey, number>][]): string {
  const head = '    ' + '위치'.padEnd(22) + KEYS.map((k) => k.padStart(8)).join('');
  const body = rows.map(
    ([label, c]) => '    ' + label.padEnd(22) + KEYS.map((k) => `${c[k].toFixed(1)}%`.padStart(8)).join(''),
  );
  return `[E] 면 종류별 화면 점유율 실측 (§4.2 아트 우선순위 검증)\n${head}\n${body.join('\n')}`;
}
