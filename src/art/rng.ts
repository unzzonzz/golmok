/** 결정적 난수. 텍스처를 굽을 때마다 같은 그림이 나와야 A/B 비교가 된다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: () => number, arr: readonly T[]): T => arr[(r() * arr.length) | 0]!;
export const range = (r: () => number, a: number, b: number): number => a + r() * (b - a);
