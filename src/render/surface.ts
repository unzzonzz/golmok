import { VIEW_H, VIEW_W } from '../core/constants';

/**
 * 고정 해상도 백버퍼 + 정수 디바이스 픽셀 배율 표시.
 *
 * 백버퍼는 항상 1280x720. 창 크기에 맞추되 "디바이스 픽셀 기준 정수 배율"로만
 * 확대한다. 비정수 배율로 리샘플하면 움직이는 화면에 물결(shimmer)이 생겨서
 * M0 합격 기준이 렌더 파이프라인이 아니라 표시 단계에서 무너진다.
 */
export class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly w = VIEW_W;
  readonly h = VIEW_H;
  scale = 1;

  constructor(mount: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d 컨텍스트를 만들 수 없습니다');
    this.ctx = ctx;
    mount.appendChild(this.canvas);
    this.fit();
    window.addEventListener('resize', this.fit);
  }

  private readonly fit = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth * dpr;
    const availH = window.innerHeight * dpr;
    let s = Math.min(availW / VIEW_W, availH / VIEW_H);
    // 1배 이상이면 정수 배율만 쓴다. 그 이하면 어쩔 수 없이 축소.
    s = s >= 1 ? Math.floor(s) : s;
    this.scale = s;
    this.canvas.style.width = `${(VIEW_W * s) / dpr}px`;
    this.canvas.style.height = `${(VIEW_H * s) / dpr}px`;
    // 정수 확대일 때만 nearest. 축소 때 pixelated는 오히려 계단이 심해진다.
    this.canvas.style.imageRendering = s >= 1 ? 'pixelated' : 'auto';
  };

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }
}
