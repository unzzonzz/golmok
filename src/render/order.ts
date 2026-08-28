import type { Vec3 } from '../core/projection';
import type { ScreenBounds } from './raster';

/**
 * 가림 순서 정렬 (§1.1).
 *
 * 중심 시선거리 정렬만으로는 틀린다. 크기가 크게 다른 두 AABB —
 * 8m 노면 타일과 0.6m 캐릭터 — 는 중심 거리 대소가 실제 앞뒤와 반대일 수 있다.
 * 캐릭터가 자기가 서 있는 타일 뒤로 사라지는 게 정확히 그 증상이다.
 *
 * 정확한 규칙: 서로 교차하지 않는 두 볼록체 사이에 분리 평면이 있으면,
 * **카메라가 있는 쪽이 앞이다.** 원근에서도 정확하다(BSP의 기본 성질).
 * 모든 정적 오브젝트가 AABB이므로 분리 평면은 항상 x/y/z 축평면 중 하나다.
 *
 * 그래서 §3.3 겹침 밸리데이터가 정렬 정확성의 전제조건이 된다 —
 * 겹치면 분리 평면이 없고, 순서가 정의되지 않는다.
 */
export interface Box3 {
  x: number;
  y: number;
  w: number;
  d: number;
  zBottom: number;
  zTop: number;
}

export interface OrderItem<T> {
  item: T;
  box: Box3;
  bounds: ScreenBounds;
  /** 1차 정렬 키 (중심 시선거리). 위상 정렬의 안정적 시작 순서로만 쓴다. */
  depth: number;
}

const EPS = 1e-4;

/**
 * A가 B보다 앞인가. +1 = A가 앞, -1 = B가 앞, 0 = 제약 없음.
 *
 * 분리 축이 **여러 개일 수 있고, 축마다 답이 다를 수 있다.**
 * 예: A(0,0), B(10,10), 카메라(0,10) — x 평면으로는 A가 앞, y 평면으로는 B가 앞.
 * 첫 축만 보고 답하면 이런 쌍들이 서로 모순된 간선을 만들어 정렬에 순환이 생긴다.
 *
 * 답이 갈리면 그건 "둘 중 어느 것도 다른 것을 가리지 않는다"는 뜻이다 —
 * 두 축의 답이 모순이면 두 박스를 동시에 지나는 광선이 존재할 수 없다.
 * 그러니 제약을 걸지 않는 게 맞다. 모든 축을 보고 만장일치일 때만 간선을 만든다.
 */
export function frontness(cam: Vec3, a: Box3, b: Box3): number {
  let aFront = 0;
  let bFront = 0;
  const vote = (aIsOnCamSide: boolean): void => {
    if (aIsOnCamSide) aFront++;
    else bFront++;
  };

  if (a.x + a.w <= b.x + EPS) vote(cam.x < (a.x + a.w + b.x) * 0.5);
  else if (b.x + b.w <= a.x + EPS) vote(cam.x > (b.x + b.w + a.x) * 0.5);

  if (a.y + a.d <= b.y + EPS) vote(cam.y < (a.y + a.d + b.y) * 0.5);
  else if (b.y + b.d <= a.y + EPS) vote(cam.y > (b.y + b.d + a.y) * 0.5);

  if (a.zTop <= b.zBottom + EPS) vote(cam.z < (a.zTop + b.zBottom) * 0.5);
  else if (b.zTop <= a.zBottom + EPS) vote(cam.z > (b.zTop + a.zBottom) * 0.5);

  if (aFront > 0 && bFront > 0) return 0; // 축마다 답이 갈림 = 서로 안 가림
  if (aFront > 0) return 1;
  if (bFront > 0) return -1;
  return 0; // 분리 축 없음 = 겹침. 밸리데이터가 막아야 한다.
}

/** 여유 2px. 바운딩이 아슬아슬하게 겹칠 때 간선이 깜빡이면 순서가 프레임마다 뒤집힌다. */
const PAD = 2;

function boundsOverlap(a: ScreenBounds, b: ScreenBounds): boolean {
  return (
    a.ok && b.ok &&
    a.maxX + PAD > b.minX && b.maxX + PAD > a.minX &&
    a.maxY + PAD > b.minY && b.maxY + PAD > a.minY
  );
}

export interface OrderStats {
  pairs: number;
  edges: number;
  cycles: number;
}

/**
 * 위상 정렬. 화면 바운딩이 겹치는 쌍만 간선으로 삼는다 — 겹치지 않으면
 * 순서가 그림에 영향을 주지 않으므로 제약을 걸 이유가 없고, 간선을 줄이면
 * 순환 가능성도 준다.
 *
 * 반환: 먼 것부터 그리는 순서.
 */
export function sortByOcclusion<T>(
  cam: Vec3,
  items: OrderItem<T>[],
  stats?: OrderStats,
): OrderItem<T>[] {
  const n = items.length;
  if (stats) {
    stats.pairs = 0;
    stats.edges = 0;
    stats.cycles = 0;
  }
  // 1차: 중심 시선거리 내림차순 (먼 것 먼저). 위상 정렬의 시작 순서.
  const order = items.slice().sort((p, q) => q.depth - p.depth);

  // behind[i] = i보다 먼저 그려야 하는 항목들
  const behind: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = order[i]!;
      const b = order[j]!;
      if (!boundsOverlap(a.bounds, b.bounds)) continue;
      if (stats) stats.pairs++;
      const f = frontness(cam, a.box, b.box);
      if (f > 0) behind[i]!.push(j); // a가 앞 -> b를 먼저
      else if (f < 0) behind[j]!.push(i);
      else continue; // 겹침. 1차 순서를 따른다
      if (stats) stats.edges++;
    }
  }

  const state = new Uint8Array(n); // 0 미방문 1 방문중 2 완료
  const out: OrderItem<T>[] = [];
  const stack: number[] = [];
  const iter: number[] = [];

  for (let s = 0; s < n; s++) {
    if (state[s] !== 0) continue;
    stack.push(s);
    iter.push(0);
    state[s] = 1;
    while (stack.length > 0) {
      const i = stack[stack.length - 1]!;
      const k = iter[iter.length - 1]!;
      const list = behind[i]!;
      if (k < list.length) {
        iter[iter.length - 1] = k + 1;
        const j = list[k]!;
        if (state[j] === 0) {
          state[j] = 1;
          stack.push(j);
          iter.push(0);
        } else if (state[j] === 1 && stats) {
          // 순환. 밸리데이터가 통과했다면 나오지 않아야 한다.
          stats.cycles++;
        }
      } else {
        state[i] = 2;
        out.push(order[i]!);
        stack.pop();
        iter.pop();
      }
    }
  }
  return out;
}
