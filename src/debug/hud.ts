import { UI, rgba } from '../art/palette';
import { cueLabel, type Cues, type HeightQuiz } from './heightCue';

const MONO = '12px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
const LINE = 15;

export interface HudInfo {
  fps: number;
  ms: number;
  world: { wx: number; wy: number; wz: number };
  supportZ: number;
  onGround: boolean;
  speed: number;
  slabsDrawn: number;
  slabsTotal: number;
  quads: number;
  cutaways: number;
  cues: Cues;
  /** 현재 높이에서 각 단서의 크기 */
  cueMagnitude: { gapPx: number; scalePct: number; offsetPx: number };
  quiz: HeightQuiz;
  jitter: { flips: number; maxStep: number; samples: number; settling: boolean; judging: boolean };
}

export function drawHud(ctx: CanvasRenderingContext2D, i: HudInfo): void {
  const h = i.world.wz - i.supportZ;
  const hidden = i.quiz.active;
  const lines: [string, string][] = [
    ['fps', `${i.fps.toFixed(0).padStart(3)}  ${i.ms.toFixed(2)}ms   슬래브 ${i.slabsDrawn}/${i.slabsTotal}  쿼드 ${i.quads}  컷어웨이 ${i.cutaways}`],
    ['world', hidden ? '  ??.??    ??.??    ??.??' : `${f(i.world.wx)} ${f(i.world.wy)} ${f(i.world.wz)}`],
    ['높이', hidden ? '  ??.?? m  (퀴즈 중)' : `${f(h)} m  접지면 ${f(i.supportZ)}  ${i.onGround ? 'ground' : 'air'}`],
    ['단서', `${cueLabel(i.cues).padEnd(16)} 간격 ${i.cueMagnitude.gapPx.toFixed(1)}px · 스케일 ${i.cueMagnitude.scalePct >= 0 ? '+' : ''}${i.cueMagnitude.scalePct.toFixed(1)}% · 오프셋 ${i.cueMagnitude.offsetPx.toFixed(1)}px`],
  ];

  const pad = 8;
  const w = 560;
  const rows = lines.length + (i.quiz.active ? 3 : 1);
  const boxH = pad * 2 + LINE * rows + 6;
  ctx.save();
  ctx.fillStyle = rgba(UI.panel, 0.8);
  ctx.fillRect(8, 8, w, boxH);
  ctx.strokeStyle = rgba(UI.gridMajor, 0.4);
  ctx.strokeRect(8.5, 8.5, w, boxH);
  ctx.font = MONO;
  ctx.textBaseline = 'top';

  let y = 8 + pad;
  for (const [k, v] of lines) {
    ctx.fillStyle = rgba(UI.textDim, 1);
    ctx.fillText(k.padEnd(6), 8 + pad, y);
    ctx.fillStyle = rgba(UI.text, 1);
    ctx.fillText(v, 8 + pad + 52, y);
    y += LINE;
  }

  y += 6;
  if (i.quiz.active) {
    ctx.fillStyle = rgba(UI.warn, 1);
    ctx.fillText('HEIGHT QUIZ', 8 + pad, y);
    ctx.fillStyle = rgba(UI.text, 1);
    ctx.fillText('1~6 으로 현재 높이를 맞히세요', 8 + pad + 110, y);
    y += LINE;
    ctx.fillStyle = rgba(UI.textDim, 1);
    ctx.fillText(i.quiz.summary, 8 + pad, y);
    y += LINE;
    ctx.fillStyle = rgba(
      i.quiz.lastResult.startsWith('정답') ? UI.ok : i.quiz.lastResult ? UI.bad : UI.textDim,
      1,
    );
    ctx.fillText(i.quiz.lastResult || '—', 8 + pad, y);
  } else {
    const j = i.jitter;
    ctx.fillStyle = rgba(UI.textDim, 1);
    ctx.fillText('JITTER'.padEnd(6), 8 + pad, y);
    const pass = j.flips === 0;
    ctx.fillStyle = rgba(j.settling ? UI.textDim : !j.judging ? UI.textDim : pass ? UI.ok : UI.bad, 1);
    ctx.fillText(
      j.settling
        ? 'settling…'
        : !j.judging
          ? `반전 ${j.flips}  최대 ${j.maxStep}px  (판정은 T 스윕에서)`
          : pass
            ? `PASS  부호반전 0  최대 스텝 ${j.maxStep}px  n=${j.samples}`
            : `FAIL  부호반전 ${j.flips}회`,
      8 + pad + 52,
      y,
    );
  }
  ctx.restore();
}

const HELP = [
  'WASD/화살표 이동   Space 점프   Shift 스프린트   [ ] 높이 조절   0~5 높이 타깃으로 이동',
  'C 단서 순환(오프셋/스케일/그림자)   K 높이 퀴즈   T 등속 스윕   V 검증 리포트(콘솔)',
  'Z 캐릭터 확대   M 실루엣 뷰   G 그리드   W 와이어프레임   X 컷어웨이   P 팔레트   H HUD',
];

export function drawHelp(ctx: CanvasRenderingContext2D, viewH: number): void {
  ctx.save();
  ctx.font = MONO;
  ctx.textBaseline = 'bottom';
  let y = viewH - 10;
  for (let k = HELP.length - 1; k >= 0; k--) {
    const t = HELP[k]!;
    const w = ctx.measureText(t).width;
    ctx.fillStyle = rgba(UI.panel, 0.72);
    ctx.fillRect(8, y - 13, w + 12, 15);
    ctx.fillStyle = rgba(UI.textDim, 1);
    ctx.fillText(t, 14, y);
    y -= 17;
  }
  ctx.restore();
}

function f(v: number): string {
  return v.toFixed(2).padStart(8);
}
