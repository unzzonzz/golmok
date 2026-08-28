/**
 * 팔레트 (기획서 v2 §4.6 조명, §6.3 컬러).
 *
 * 원칙: 도시는 한색, 캐릭터는 웜톤. v2에서 노면·옥상이 화면의 60%를 차지하는
 * 한색 면이 되었으므로 보색 분리가 v1보다 더 잘 작동한다.
 */

export type RGB = readonly [number, number, number];

export const hex = (c: RGB): string =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export const rgba = (c: RGB, a: number): string =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

export const css = (c: RGB): string => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

// ── 도시 표면 (한색) ──────────────────────────────────────────────────
export const WORLD = {
  sky: [5, 7, 15] as RGB,
  /** §4.6 명시값 #1a2340 — 상공에서 오는 청색 앰비언트, 약함 */
  ambient: [26, 35, 64] as RGB,
  asphalt: [21, 25, 34] as RGB,
  asphaltWorn: [30, 35, 45] as RGB,
  asphaltWet: [26, 34, 52] as RGB,
  /** 녹색 방수페인트 — 위에서 본 서울의 1순위 시각 신호 (§4.1) */
  roofGreen: [38, 58, 44] as RGB,
  roofGreenWorn: [52, 72, 55] as RGB,
  roofGreenFaded: [64, 78, 63] as RGB,
  concrete: [40, 46, 60] as RGB,
  concreteLit: [56, 64, 82] as RGB,
  brick: [56, 42, 42] as RGB,
  steel: [46, 54, 70] as RGB,
  rust: [88, 52, 34] as RGB,
  glassDark: [13, 20, 36] as RGB,
  glassLit: [30, 52, 86] as RGB,
  lineWhite: [150, 158, 170] as RGB,
  lineYellow: [150, 128, 60] as RGB,
  /** 노란 점자블록 (§4.2) */
  tactileYellow: [126, 106, 44] as RGB,
} as const;

// ── 광원 (§4.6) ───────────────────────────────────────────────────────
export const LIGHT = {
  neonCyan: [56, 232, 255] as RGB,
  neonMagenta: [255, 47, 156] as RGB,
  storeWhite: [223, 240, 255] as RGB,
  streetAmber: [255, 174, 77] as RGB,
  /** §6.5-3 폰 낙하광 */
  phoneBlue: [158, 203, 255] as RGB,
  /** §6.5-2 헬멧 후미 LED. 카메라가 뒤에 있으므로 항상 보인다 */
  ledRed: [255, 43, 61] as RGB,
  moon: [120, 150, 205] as RGB,
} as const;

// ── 캐릭터 (웜톤) ─────────────────────────────────────────────────────
export const CHAR = {
  /** §6.3-1 가방 윗면 = 실루엣의 45%. 채도 최대 — 화면에서 유일한 고채도 오렌지 */
  bag: [255, 112, 8] as RGB,
  bagLit: [255, 148, 56] as RGB,
  bagShadow: [136, 50, 4] as RGB,
  bagEdge: [22, 12, 6] as RGB,
  /**
   * 자켓은 어두운 웜 브라운. v2 초기값(196,100,44)은 가방과 색상·명도가 너무
   * 가까워서 가방이 튀지 않았다. §6.2가 "가방만 채도 최대"라고 못박은 이유가
   * 이것이다 — 몸통이 같이 주황이면 실루엣도 색도 한 덩어리가 된다.
   */
  jacket: [96, 64, 48] as RGB,
  jacketShadow: [54, 38, 32] as RGB,
  /** §6.3-2 무광 차콜 하프쉘 */
  helmet: [54, 57, 65] as RGB,
  helmetLit: [92, 96, 106] as RGB,
  /** 정수리 비대칭 마킹 — 방향 판독용. 미관이 아니라 기능 */
  helmetMark: [236, 240, 248] as RGB,
  /** §6.5-1 재귀반사 테이프. v2 최우선 */
  tape: [242, 251, 255] as RGB,
  shoulder: [122, 66, 34] as RGB,
  pantsDark: [40, 38, 46] as RGB,
} as const;

// ── 디버그 / UI ───────────────────────────────────────────────────────
export const UI = {
  gridMinor: [44, 58, 84] as RGB,
  gridMajor: [78, 102, 142] as RGB,
  axisX: [214, 108, 84] as RGB,
  axisY: [96, 178, 140] as RGB,
  axisZ: [140, 150, 220] as RGB,
  /** §3.2 컷어웨이 중 플레이어 위에 덧그리는 시안 림 */
  rim: [95, 240, 255] as RGB,
  text: [206, 222, 245] as RGB,
  textDim: [116, 134, 164] as RGB,
  ok: [110, 230, 160] as RGB,
  warn: [255, 196, 92] as RGB,
  bad: [255, 90, 110] as RGB,
  panel: [8, 12, 22] as RGB,
} as const;
