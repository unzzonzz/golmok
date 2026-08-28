import { GRID_MAJOR_EVERY, VIEW_H, VIEW_W } from '../core/constants';
import { screenToPlane, type Vec3 } from '../core/projection';
import { UI, rgba } from '../art/palette';
import { strokePolygon, v3uv } from './raster';

/**
 * 원근 디버그 그리드.
 *
 * 프러스텀 상단이 수평선보다 49° 아래를 향하므로(고도각 68° − FOV/2 19°)
 * 수평선은 절대 화면에 없다. 즉 지면이 화면을 가득 채우고, 화면 네 모서리를
 * z=0 평면으로 역투영하면 보이는 지면이 항상 유한한 사각형으로 닫힌다.
 * 무한 평면 처리가 필요 없다.
 */
export interface GroundBounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const corner = { wx: 0, wy: 0, hit: false };

export function visibleGround(cam: Vec3, planeZ = 0, pad = 1): GroundBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const pts: readonly [number, number][] = [
    [0, 0],
    [VIEW_W, 0],
    [0, VIEW_H],
    [VIEW_W, VIEW_H],
  ];
  for (const [sx, sy] of pts) {
    screenToPlane(cam, sx, sy, planeZ, corner);
    if (!corner.hit) continue;
    if (corner.wx < minX) minX = corner.wx;
    if (corner.wx > maxX) maxX = corner.wx;
    if (corner.wy < minY) minY = corner.wy;
    if (corner.wy > maxY) maxY = corner.wy;
  }
  return {
    x0: Math.floor(minX) - pad,
    x1: Math.ceil(maxX) + pad,
    y0: Math.floor(minY) - pad,
    y1: Math.ceil(maxY) + pad,
  };
}

export function drawGrid(cam: Vec3, ctx: CanvasRenderingContext2D, planeZ = 0): void {
  const b = visibleGround(cam, planeZ);
  ctx.save();
  for (let gy = b.y0; gy <= b.y1; gy++) {
    strokePolygon(cam, ctx, [v3uv(b.x0, gy, planeZ), v3uv(b.x1, gy, planeZ)], lineColor(gy, UI.axisX), 1, false);
  }
  for (let gx = b.x0; gx <= b.x1; gx++) {
    strokePolygon(cam, ctx, [v3uv(gx, b.y0, planeZ), v3uv(gx, b.y1, planeZ)], lineColor(gx, UI.axisY), 1, false);
  }
  ctx.restore();
}

/** 원점 수직 자. 높이 1m가 만드는 화면 이동을 눈으로 대조하는 기준자. */
export function drawZRuler(cam: Vec3, ctx: CanvasRenderingContext2D, meters = 18): void {
  strokePolygon(cam, ctx, [v3uv(0, 0, 0), v3uv(0, 0, meters)], rgba(UI.axisZ, 0.85), 1, false);
  for (let m = 1; m <= meters; m++) {
    const t = m % 3 === 0 ? 0.35 : 0.15;
    strokePolygon(
      cam, ctx,
      [v3uv(-t, 0, m), v3uv(t, 0, m)],
      rgba(UI.axisZ, m % 3 === 0 ? 0.9 : 0.45),
      1, false,
    );
  }
}

function lineColor(index: number, axis: typeof UI.axisX): string {
  if (index === 0) return rgba(axis, 0.85);
  if (index % GRID_MAJOR_EVERY === 0) return rgba(UI.gridMajor, 0.5);
  return rgba(UI.gridMinor, 0.35);
}
