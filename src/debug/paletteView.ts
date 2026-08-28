import { CHAR, LIGHT, UI, WORLD, hex, rgba, type RGB } from '../art/palette';
import { RAMP_BAG, RAMP_CHARACTER, RAMP_WORLD, buildRamp, type RampSpec } from '../art/ramp';
import { bakeRoadTexture, bakeRoofTexture, bakeWallTexture } from '../art/textures';

/**
 * 팔레트 · 램프 · 텍스처 확인 뷰 (P 키).
 *
 * §11-3(팔레트 확정)과 §11-4(옥상 텍스처 1장)를 한 화면에서 본다.
 * §11-4는 "서울다움이 벽면에서 옥상으로 이동한다"는 이 기획의 핵심 베팅을
 * 텍스처 한 장으로 조기 검증하라는 항목이다. 그래서 옥상을 제일 크게 놓았다.
 */
const MONO = '11px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
const SW = 72;
const SH = 42;
const GAP = 5;
const LEFT_X = 22;
const PER_ROW = 8;

const GROUPS: [string, Record<string, RGB>][] = [
  ['WORLD — 도시 표면 (한색)', WORLD],
  ['LIGHT — 광원 (§4.6)', LIGHT],
  ['CHAR — 캐릭터 (웜톤, §6.3)', CHAR],
  ['UI', UI],
];

const RAMPS: [string, RampSpec][] = [
  ['RAMP_WORLD', RAMP_WORLD],
  ['RAMP_CHARACTER', RAMP_CHARACTER],
  ['RAMP_BAG', RAMP_BAG],
];

let cache: { roof: HTMLCanvasElement; road: HTMLCanvasElement; wall: HTMLCanvasElement } | null = null;
function textures(): NonNullable<typeof cache> {
  cache ??= {
    roof: bakeRoofTexture(8, 8, 900),
    road: bakeRoadTexture(8, 8, 303, { puddles: 3, manhole: true, lampPool: 0.7 }),
    wall: bakeWallTexture(11, 15, 901, { floors: 5, storefront: true, base: WORLD.concrete }),
  };
  return cache;
}

export function drawPaletteView(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
  const tex = textures();
  ctx.save();
  ctx.fillStyle = rgba(WORLD.sky, 0.975);
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.font = MONO;
  ctx.textBaseline = 'top';

  // ── 좌: 스와치 + 램프 ───────────────────────────────────────────
  let y = 18;
  for (const [title, group] of GROUPS) {
    ctx.fillStyle = hex(UI.text);
    ctx.fillText(title, LEFT_X, y);
    y += 14;
    const entries = Object.entries(group);
    entries.forEach(([name, c], k) => {
      const x = LEFT_X + (k % PER_ROW) * (SW + GAP);
      const yy = y + Math.floor(k / PER_ROW) * (SH + GAP);
      ctx.fillStyle = hex(c);
      ctx.fillRect(x, yy, SW, SH);
      ctx.strokeStyle = rgba(UI.gridMajor, 0.3);
      ctx.strokeRect(x + 0.5, yy + 0.5, SW, SH);
      ctx.fillStyle = luma(c) > 128 ? '#0b1020' : hex(UI.text);
      ctx.fillText(name.slice(0, 11), x + 4, yy + 4);
      ctx.fillText(hex(c), x + 4, yy + SH - 14);
    });
    y += Math.ceil(entries.length / PER_ROW) * (SH + GAP) + 10;
  }

  const rampW = PER_ROW * (SW + GAP) - GAP;
  ctx.fillStyle = hex(UI.text);
  ctx.fillText('1D RAMP LUT · 64단계 · 소프트 터미네이터 0.15 (§7.3-5)', LEFT_X, y);
  y += 15;
  for (const [name, spec] of RAMPS) {
    const lut = buildRamp(spec);
    const steps = lut.length / 3;
    for (let k = 0; k < steps; k++) {
      const a = Math.round((k * rampW) / steps);
      const b = Math.round(((k + 1) * rampW) / steps);
      ctx.fillStyle = `rgb(${lut[k * 3]},${lut[k * 3 + 1]},${lut[k * 3 + 2]})`;
      ctx.fillRect(LEFT_X + a, y, b - a, 26);
    }
    ctx.fillStyle = hex(UI.textDim);
    ctx.fillText(name, LEFT_X + 4, y + 7);
    y += 32;
  }

  // ── 우: 텍스처 (§11-4) ──────────────────────────────────────────
  const rx = LEFT_X + rampW + 40;
  let ry = 18;
  ctx.fillStyle = hex(UI.text);
  ctx.fillText('§11-4  옥상 텍스처 — "서울다움이 벽면에서 옥상으로 이동한다"의 조기 검증', rx, ry);
  ry += 15;
  const roofSize = Math.min(320, viewW - rx - 30);
  ctx.drawImage(tex.roof, rx, ry, roofSize, roofSize);
  ctx.strokeStyle = rgba(UI.gridMajor, 0.4);
  ctx.strokeRect(rx + 0.5, ry + 0.5, roofSize, roofSize);
  ctx.fillStyle = hex(UI.textDim);
  ctx.fillText('8x8m · 방수페인트 롤러자국 · 벗겨짐 · 균열 · 물자국 · 배수구 · 파라펫 AO', rx, ry + roofSize + 5);

  const cx2 = rx + roofSize + 24;
  ctx.fillStyle = hex(UI.text);
  ctx.fillText('노면 (§4.2 — 옥상과 함께 100% 가시)', cx2, ry - 15);
  const roadSize = Math.min(240, viewW - cx2 - 24);
  ctx.drawImage(tex.road, cx2, ry, roadSize, roadSize);
  ctx.strokeStyle = rgba(UI.gridMajor, 0.4);
  ctx.strokeRect(cx2 + 0.5, ry + 0.5, roadSize, roadSize);
  ctx.fillStyle = hex(UI.textDim);
  ctx.fillText('보수 패치 · 균열 · 맨홀 · 물웅덩이 · 가로등 낙하광', cx2, ry + roadSize + 5);

  ry += roofSize + 30;
  ctx.fillStyle = hex(UI.text);
  ctx.fillText('벽면 남측 (37%만 보인다 — 1~2층 파사드만 유효, §4.2)', rx, ry);
  ry += 15;
  const wallW = Math.min(300, viewW - rx - 30);
  const wallH = Math.round((wallW * 15) / 11);
  const clipH = Math.min(wallH, viewH - ry - 60);
  // 실제로 보이는 만큼(아래 37%)만 잘라서 보여준다
  const visible = Math.round(clipH * 0.37);
  ctx.drawImage(tex.wall, rx, ry, wallW, clipH);
  ctx.fillStyle = rgba(WORLD.sky, 0.78);
  ctx.fillRect(rx, ry, wallW, clipH - visible);
  ctx.strokeStyle = rgba(UI.warn, 0.7);
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(rx, ry + clipH - visible);
  ctx.lineTo(rx + wallW, ry + clipH - visible);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = hex(UI.warn);
  ctx.fillText('↑ 68°에서 잘려나가는 부분', rx + wallW + 8, ry + clipH - visible - 12);
  ctx.fillStyle = hex(UI.textDim);
  ctx.fillText('아래 37%만 화면에 남는다', rx + wallW + 8, ry + clipH - visible + 4);

  ctx.fillStyle = hex(UI.textDim);
  ctx.fillText('P — 닫기', LEFT_X, viewH - 22);
  ctx.restore();
}

function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
