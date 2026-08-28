import { LIGHT, WORLD, css, mix, rgba, shade, type RGB } from './palette';
import { mulberry32, range } from './rng';

/**
 * 텍스처 베이커리 (§7.1 — 텍스처는 정적이므로 로드 시 1회 굽는다).
 *
 * 방향광 그림자 · AO · 베이크 조명을 전부 여기 포함시킨다. 런타임에는
 * 기하 변환만 한다. 아트 파이프라인은 v1과 동일하고 합성 방식만 바뀌었다.
 *
 * 해상도는 초점 평면 스케일(40.2 px/m)에 맞춘 40 px/m. 그보다 높이면
 * 26m 거리에서 보이지도 않는 디테일에 메모리를 쓰는 것이다.
 */
export const TEX_PPM = 40;
const MAX_TEX = 1024;

function makeCanvas(wM: number, dM: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; ppm: number } {
  const ppm = Math.min(TEX_PPM, MAX_TEX / Math.max(wM, dM));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(wM * ppm));
  c.height = Math.max(2, Math.round(dM * ppm));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('텍스처 컨텍스트 생성 실패');
  return { c, ctx, ppm };
}

/** 가장자리 AO. 68°에서 옥상·노면이 주 수광면이므로 경계 그늘이 형태를 만든다. */
function edgeAO(ctx: CanvasRenderingContext2D, w: number, h: number, px: number, alpha: number): void {
  const g = [
    ctx.createLinearGradient(0, 0, px, 0),
    ctx.createLinearGradient(w, 0, w - px, 0),
    ctx.createLinearGradient(0, 0, 0, px),
    ctx.createLinearGradient(0, h, 0, h - px),
  ];
  for (const grad of g) {
    grad.addColorStop(0, `rgba(0,0,0,${alpha})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}

/** 미세 그레인. §7.3-6의 디더를 텍스처 단계에서도 깔아 밴딩을 막는다. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number, amount: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);
}

function blob(ctx: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, rad: number, style: string): void {
  ctx.fillStyle = style;
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * range(r, 0.62, 1.25);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function crack(ctx: CanvasRenderingContext2D, r: () => number, x: number, y: number, len: number, style: string, width: number): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = r() * Math.PI * 2;
  let px = x;
  let py = y;
  const segs = 4 + ((r() * 5) | 0);
  for (let i = 0; i < segs; i++) {
    a += range(r, -0.8, 0.8);
    px += Math.cos(a) * (len / segs);
    py += Math.sin(a) * (len / segs);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
}

/**
 * 옥상 텍스처 (§11-4 — 기획의 핵심 베팅을 조기에 검증하는 최소 테스트).
 *
 * 위에서 내려다본 서울에서 즉시 식별되는 것은 파사드가 아니라
 * 녹색 방수페인트 + 갈라진 자국 + 물자국 + 배수구다. 68°는 이걸 정면으로 보여준다.
 */
export function bakeRoofTexture(wM: number, dM: number, seed: number): HTMLCanvasElement {
  const { c, ctx, ppm } = makeCanvas(wM, dM);
  const w = c.width;
  const h = c.height;
  const r = mulberry32(seed);

  // 1) 방수페인트 바탕
  ctx.fillStyle = css(WORLD.roofGreen);
  ctx.fillRect(0, 0, w, h);

  // 2) 롤러 자국 — 세로 줄무늬. 실제 옥상 방수는 롤러로 겹쳐 칠한다
  const strokeW = 0.55 * ppm;
  for (let x = 0; x < w; x += strokeW) {
    ctx.fillStyle = rgba(mix(WORLD.roofGreen, WORLD.roofGreenWorn, range(r, 0, 0.35)), 0.5);
    ctx.fillRect(x, 0, strokeW * range(r, 0.7, 1.0), h);
  }

  // 3) 벗겨진 페인트 / 색바램
  for (let i = 0; i < Math.max(4, (wM * dM) / 5); i++) {
    blob(
      ctx, r,
      r() * w, r() * h, range(r, 0.25, 1.1) * ppm,
      rgba(r() < 0.35 ? WORLD.concrete : WORLD.roofGreenFaded, range(r, 0.16, 0.44)),
    );
  }

  // 4) 균열
  for (let i = 0; i < Math.max(3, wM * dM * 0.12); i++) {
    crack(ctx, r, r() * w, r() * h, range(r, 0.8, 3.2) * ppm, rgba(shade(WORLD.roofGreen, 0.45), 0.7), range(r, 0.6, 1.6));
  }

  // 5) 물자국 — 배수가 안 되는 구석에 고인 자국. 청색 앰비언트를 반사한다
  for (let i = 0; i < Math.max(2, (wM * dM) / 14); i++) {
    blob(ctx, r, r() * w, r() * h, range(r, 0.6, 1.8) * ppm, rgba(WORLD.asphaltWet, 0.34));
  }

  // 6) 배수구 — 위에서 보면 확실한 랜드마크
  const dx = range(r, 0.18, 0.82) * w;
  const dy = range(r, 0.18, 0.82) * h;
  const dr = 0.22 * ppm;
  blob(ctx, r, dx, dy, dr * 3.4, rgba(shade(WORLD.roofGreen, 0.7), 0.5));
  ctx.fillStyle = css(shade(WORLD.steel, 0.55));
  ctx.beginPath();
  ctx.arc(dx, dy, dr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(WORLD.steel, 0.8);
  ctx.lineWidth = Math.max(1, ppm * 0.05);
  ctx.beginPath();
  ctx.arc(dx, dy, dr * 1.6, 0, Math.PI * 2);
  ctx.stroke();

  // 7) 파라펫 안쪽 띠 — 난간 아래 콘크리트가 드러난 부분 + 그 그림자
  const band = Math.max(2, 0.35 * ppm);
  ctx.strokeStyle = rgba(WORLD.concrete, 0.55);
  ctx.lineWidth = band;
  ctx.strokeRect(band / 2, band / 2, w - band, h - band);

  // 8) 녹물 자국 — 난간 · 배관에서 흘러내린 것
  for (let i = 0; i < Math.max(2, wM * 0.4); i++) {
    ctx.fillStyle = rgba(WORLD.rust, range(r, 0.06, 0.16));
    const x = r() * w;
    ctx.fillRect(x, 0, range(r, 0.1, 0.3) * ppm, range(r, 0.4, 2.2) * ppm);
  }

  edgeAO(ctx, w, h, Math.max(3, 0.6 * ppm), 0.34);
  grain(ctx, w, h, r, 9);
  return c;
}

export interface RoadOptions {
  laneDashes?: boolean;
  centerLine?: boolean;
  crosswalk?: boolean;
  manhole?: boolean;
  tactile?: 'north' | 'south' | null;
  /** 가로등 낙하광을 베이크한다. [0..1] 폭 위치 */
  lampPool?: number | null;
  puddles?: number;
}

/** 노면 텍스처 (§4.2 — 노면은 옥상과 함께 100% 가시, 최우선). */
export function bakeRoadTexture(wM: number, dM: number, seed: number, o: RoadOptions = {}): HTMLCanvasElement {
  const { c, ctx, ppm } = makeCanvas(wM, dM);
  const w = c.width;
  const h = c.height;
  const r = mulberry32(seed);

  ctx.fillStyle = css(WORLD.asphalt);
  ctx.fillRect(0, 0, w, h);

  // 보수 패치 — 서울 노면의 지배적인 시각 요소. 톤이 다른 사각/부정형 조각들
  for (let i = 0; i < Math.max(2, (wM * dM) / 12); i++) {
    ctx.fillStyle = rgba(WORLD.asphaltWorn, range(r, 0.18, 0.42));
    const px = r() * w;
    const py = r() * h;
    const pw = range(r, 0.8, 3.4) * ppm;
    const ph = range(r, 0.8, 3.0) * ppm;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = rgba(shade(WORLD.asphalt, 0.5), 0.55);
    ctx.lineWidth = Math.max(1, ppm * 0.045);
    ctx.strokeRect(px, py, pw, ph);
  }

  for (let i = 0; i < Math.max(3, wM * dM * 0.16); i++) {
    crack(ctx, r, r() * w, r() * h, range(r, 0.7, 2.6) * ppm, rgba(shade(WORLD.asphalt, 0.45), 0.6), range(r, 0.5, 1.3));
  }

  if (o.lampPool != null) {
    const g = ctx.createRadialGradient(o.lampPool * w, h * 0.5, 0, o.lampPool * w, h * 0.5, Math.min(w, h) * 0.85);
    g.addColorStop(0, rgba(LIGHT.streetAmber, 0.22));
    g.addColorStop(0.45, rgba(LIGHT.streetAmber, 0.08));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  for (let i = 0; i < (o.puddles ?? 0); i++) {
    const px = r() * w;
    const py = r() * h;
    const rad = range(r, 0.7, 2.0) * ppm;
    blob(ctx, r, px, py, rad, rgba(WORLD.asphaltWet, 0.55));
    // 젖은 노면이 네온을 반사한다 (§4.6 — v2에서 비중을 올린 항목)
    blob(ctx, r, px + rad * 0.15, py, rad * 0.5, rgba(r() < 0.5 ? LIGHT.neonMagenta : LIGHT.neonCyan, 0.1));
  }

  // 차선은 도로 진행 방향(월드 +x = 텍스처 u)을 따라 그린다.
  // 대로가 동서로 뻗어 있으므로 세로로 그으면 90° 틀린 그림이 된다.
  if (o.centerLine) {
    ctx.fillStyle = rgba(WORLD.lineYellow, 0.85);
    const lw = 0.12 * ppm;
    ctx.fillRect(0, h * 0.5 - lw * 1.6, w, lw);
    ctx.fillRect(0, h * 0.5 + lw * 0.6, w, lw);
  }
  if (o.laneDashes) {
    ctx.fillStyle = rgba(WORLD.lineWhite, 0.72);
    const lw = 0.12 * ppm;
    const seg = 3 * ppm;
    for (let x = 0; x < w; x += seg * 1.6) ctx.fillRect(x, h * 0.5 - lw / 2, seg, lw);
  }
  if (o.crosswalk) {
    // 횡단보도 줄무늬는 도로를 가로지른다 (진행 방향과 직각)
    ctx.fillStyle = rgba(WORLD.lineWhite, 0.68);
    const bw = 0.45 * ppm;
    for (let x = bw; x < w - bw; x += bw * 2) ctx.fillRect(x, h * 0.12, bw, h * 0.76);
  }
  if (o.tactile) {
    // 노란 점자블록 (§4.2)
    const bandH = 0.6 * ppm;
    const y0 = o.tactile === 'north' ? h - bandH : 0;
    ctx.fillStyle = rgba(WORLD.tactileYellow, 0.8);
    ctx.fillRect(0, y0, w, bandH);
    ctx.fillStyle = rgba(shade(WORLD.tactileYellow, 0.6), 0.7);
    for (let x = 0; x < w; x += bandH * 0.5) ctx.fillRect(x + bandH * 0.15, y0 + bandH * 0.2, bandH * 0.2, bandH * 0.6);
  }
  if (o.manhole) {
    const mx = range(r, 0.25, 0.75) * w;
    const my = range(r, 0.25, 0.75) * h;
    const mr = 0.33 * ppm;
    ctx.fillStyle = css(shade(WORLD.steel, 0.62));
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(WORLD.steel, 0.7);
    ctx.lineWidth = Math.max(1, ppm * 0.05);
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(mx, my, mr * (i / 2.6), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  edgeAO(ctx, w, h, Math.max(2, 0.25 * ppm), 0.12);
  grain(ctx, w, h, r, 8);
  return c;
}

export interface WallOptions {
  /** 1~2층 파사드만 유효하다 (§4.2). 아래쪽에 상가 전면을 그린다. */
  storefront?: boolean;
  litWindowChance?: number;
  floors?: number;
  base?: RGB;
}

/** 벽면 텍스처. 남측(카메라 쪽)만 쓴다 — 나머지는 단색이면 충분하다 (§4.2). */
export function bakeWallTexture(wM: number, hM: number, seed: number, o: WallOptions = {}): HTMLCanvasElement {
  const { c, ctx, ppm } = makeCanvas(wM, hM);
  const w = c.width;
  const h = c.height;
  const r = mulberry32(seed);
  const base = o.base ?? WORLD.concrete;

  ctx.fillStyle = css(shade(base, 0.62));
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < wM * hM * 0.25; i++) {
    ctx.fillStyle = rgba(shade(base, range(r, 0.45, 0.9)), range(r, 0.1, 0.3));
    ctx.fillRect(r() * w, r() * h, range(r, 0.3, 1.6) * ppm, range(r, 0.3, 1.4) * ppm);
  }

  // 층 구분선 + 창문. v(=화면 위쪽)가 건물 꼭대기다
  const floors = o.floors ?? Math.max(1, Math.round(hM / 3));
  const floorH = h / floors;
  const chance = o.litWindowChance ?? 0.45;
  for (let f = 0; f < floors; f++) {
    const top = f * floorH;
    ctx.fillStyle = rgba(shade(base, 0.4), 0.6);
    ctx.fillRect(0, top, w, Math.max(1, ppm * 0.08));
    const isGround = f === floors - 1;
    if (isGround && o.storefront) continue;
    const cols = Math.max(1, Math.round(wM / 2.2));
    const cw = w / cols;
    for (let i = 0; i < cols; i++) {
      const wx = i * cw + cw * 0.22;
      const wy = top + floorH * 0.24;
      const ww = cw * 0.56;
      const wh = floorH * 0.5;
      const lit = r() < chance;
      ctx.fillStyle = lit
        ? rgba(mix(WORLD.glassLit, LIGHT.storeWhite, range(r, 0, 0.5)), range(r, 0.55, 0.95))
        : rgba(WORLD.glassDark, 0.9);
      ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeStyle = rgba(shade(base, 0.35), 0.8);
      ctx.lineWidth = Math.max(1, ppm * 0.05);
      ctx.strokeRect(wx, wy, ww, wh);
      if (lit) {
        const g = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 0, wx + ww / 2, wy + wh / 2, ww);
        g.addColorStop(0, rgba(LIGHT.storeWhite, 0.16));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(wx - ww, wy - wh, ww * 3, wh * 3);
      }
    }
  }

  if (o.storefront) {
    const top = h - floorH;
    ctx.fillStyle = rgba(mix(WORLD.glassLit, LIGHT.storeWhite, 0.5), 0.55);
    ctx.fillRect(w * 0.06, top + floorH * 0.2, w * 0.88, floorH * 0.66);
    ctx.fillStyle = rgba(LIGHT.storeWhite, 0.14);
    ctx.fillRect(0, top, w, floorH);
    // 간판 띠
    ctx.fillStyle = rgba(r() < 0.5 ? LIGHT.neonMagenta : LIGHT.neonCyan, 0.5);
    ctx.fillRect(0, top - floorH * 0.1, w, floorH * 0.16);
  }

  edgeAO(ctx, w, h, Math.max(2, 0.3 * ppm), 0.2);
  grain(ctx, w, h, r, 7);
  return c;
}
