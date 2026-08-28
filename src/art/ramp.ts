import type { RGB } from './palette';
import { CHAR, LIGHT, WORLD, mix } from './palette';

/**
 * 1D 램프 LUT (§7.3-5).
 *
 * 2~3단 셀 셰이딩이 아니라 64단계. 명암 경계에 폭 0.15의 소프트 구간을 둬서
 * 그라디언트가 계단지지 않게 한다. 로우폴리로 안 보이게 만드는 6가지 중 5번.
 */
export interface RampSpec {
  /** 그림자 쪽 (청색 앰비언트만 받는 영역) */
  shadow: RGB;
  /** 터미네이터 통과 직후 */
  mid: RGB;
  /** 완전히 빛을 받는 영역 */
  lit: RGB;
  /** 명암 경계 위치 t0 (0..1) */
  terminator: number;
  /** 소프트 구간 폭. 기획서 명시값 0.15 */
  softness: number;
}

export const RAMP_STEPS = 64;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
};

/** RGB 3채널 x RAMP_STEPS. sampleRamp()로 읽는다. */
export function buildRamp(spec: RampSpec, steps = RAMP_STEPS): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(steps * 3);
  const half = spec.softness * 0.5;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const k = smoothstep(spec.terminator - half, spec.terminator + half, t);
    const h = smoothstep(spec.terminator + half, 1, t);
    const c = mix(mix(spec.shadow, spec.mid, k), spec.lit, h * 0.75);
    lut[i * 3] = c[0];
    lut[i * 3 + 1] = c[1];
    lut[i * 3 + 2] = c[2];
  }
  return lut;
}

/** ndl(-1..1) -> 색. 셰이더의 rampLUT[(ndl*0.5+0.5)*63|0] 과 같은 인덱싱. */
export function sampleRamp(lut: Uint8ClampedArray, ndl: number, out: [number, number, number]): RGB {
  const steps = lut.length / 3;
  let i = ((ndl * 0.5 + 0.5) * (steps - 1)) | 0;
  if (i < 0) i = 0;
  else if (i >= steps) i = steps - 1;
  out[0] = lut[i * 3]!;
  out[1] = lut[i * 3 + 1]!;
  out[2] = lut[i * 3 + 2]!;
  return out;
}

/** 캐릭터용. 청색 그림자 -> 앰버 자켓 -> 가로등 하이라이트 (§6.2 웜톤). */
export const RAMP_CHARACTER: RampSpec = {
  shadow: mix(CHAR.jacketShadow, WORLD.ambient, 0.55),
  mid: CHAR.jacket,
  lit: mix(CHAR.bagLit, LIGHT.streetAmber, 0.45),
  terminator: 0.46,
  softness: 0.15,
};

/** 가방용. 채도 최대 유지가 목적이라 mid를 순색에 가깝게 둔다. */
export const RAMP_BAG: RampSpec = {
  shadow: mix(CHAR.bagShadow, WORLD.ambient, 0.4),
  mid: CHAR.bag,
  lit: mix(CHAR.bagLit, LIGHT.storeWhite, 0.25),
  terminator: 0.44,
  softness: 0.15,
};

/** 도시 표면용. 한색 유지. */
export const RAMP_WORLD: RampSpec = {
  shadow: mix(WORLD.asphalt, WORLD.ambient, 0.35),
  mid: WORLD.concrete,
  lit: mix(WORLD.concreteLit, LIGHT.moon, 0.35),
  terminator: 0.5,
  softness: 0.15,
};
