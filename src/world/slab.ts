import type { RGB } from '../art/palette';

/** §3의 슬래브. M0에서는 렌더에 필요한 필드만 채우고, kind/mat/faces는 M1에서 붙인다. */
export interface Slab {
  x: number;
  y: number;
  w: number;
  d: number;
  zBottom: number;
  zTop: number;
  /** 옥상 · 노면 텍스처. 68°에서 100% 보이는 면이라 최우선 (§4.2) */
  topTex?: HTMLCanvasElement;
  /** 남측 벽면만 텍스처를 준다. 37%만 보이므로 나머지는 단색 (§4.2) */
  southTex?: HTMLCanvasElement;
  tint: RGB;
  /** 플레이어를 가릴 때 페이드 대상인가 (§3.2) */
  cutaway: boolean;
  /**
   * 컷어웨이 그룹. §3.2의 "그 건물"은 옥상 소품까지 포함한다.
   * 건물만 페이드되고 물탱크가 남으면 공중에 뜬 상자로 보인다.
   */
  group?: string;
  label?: string;

  /** 런타임 상태 — 컷어웨이 페이드 보간값 0..1 */
  fade?: number;
  /** 히스테리시스용: 지난 프레임에 가리고 있었는가 */
  wasOccluding?: boolean;
}

export interface Overlap {
  a: number;
  b: number;
  message: string;
}

const EPS = 1e-4;

/**
 * 겹침 밸리데이터 (§3.3).
 *
 * 미관 문제가 아니다. §1.1 — 서로 교차하지 않는 AABB 집합만이 고정 시선에서
 * 순환 없는 앞뒤 순서를 갖는다. 겹침이 1건이라도 있으면 정렬에 순환이 생겨
 * 팝핑이 난다. 경고로 넘기지 말고 로드를 중단해야 한다.
 *
 * O(N^2). M1에서 슬래브가 수백 개가 되면 z 버킷 브로드페이즈를 붙인다.
 */
export function validateSlabs(slabs: readonly Slab[]): Overlap[] {
  const bad: Overlap[] = [];
  for (let i = 0; i < slabs.length; i++) {
    for (let j = i + 1; j < slabs.length; j++) {
      const a = slabs[i]!;
      const b = slabs[j]!;
      const xy =
        a.x < b.x + b.w - EPS &&
        b.x < a.x + a.w - EPS &&
        a.y < b.y + b.d - EPS &&
        b.y < a.y + a.d - EPS;
      const z = a.zBottom < b.zTop - EPS && b.zBottom < a.zTop - EPS;
      if (xy && z) {
        bad.push({
          a: i,
          b: j,
          message:
            `슬래브 겹침: [${i}] ${a.label ?? ''} ` +
            `(${a.x},${a.y},${a.zBottom}..${a.zTop} ${a.w}x${a.d}) ` +
            `∩ [${j}] ${b.label ?? ''} ` +
            `(${b.x},${b.y},${b.zBottom}..${b.zTop} ${b.w}x${b.d})`,
        });
      }
    }
  }
  return bad;
}
