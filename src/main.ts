import {
  ACTOR_FOOTPRINT,
  ACTOR_HEIGHT,
  MAX_FRAME_DT,
  SIM_DT,
  VIEW_H,
  VIEW_W,
} from './core/constants';
import { Actor } from './core/actor';
import { Camera } from './core/camera';
import { Input } from './core/input';
import {
  PX_PER_M_FOCUS,
  depthOf,
  makeProjected,
  project,
  screenDirToWorld,
} from './core/projection';
import { Surface } from './render/surface';
import { drawGrid, drawZRuler } from './render/grid';
import { NEAR_STRADDLE, aabbScreenBounds, makeBounds, type ScreenBounds } from './render/raster';
import { sortByOcclusion, type OrderItem } from './render/order';
import { STATS, drawGroundLine, drawSlab, resetStats, slabOnScreen, slabScreenBounds, updateCutaway } from './render/slab';
import { drawShadow, makeShadowInfo } from './render/shadow';
import { drawActorProxy, makeProxyResult, setSilhouette } from './render/actorProxy';
import { WORLD, hex } from './art/palette';
import { SPAWN, buildScene } from './world/scene';
import { moveAndCollide, supportZ as supportZAt } from './world/physics';
import { validateSlabs, type Slab } from './world/slab';
import { JitterProbe } from './debug/jitter';
import { SweepTest } from './debug/sweep';
import { drawHelp, drawHud } from './debug/hud';
import { drawPaletteView } from './debug/paletteView';
import { ALL_CUES, HeightQuiz, type Cues } from './debug/heightCue';
import { frustumReport, heightCueReport, jitterReport, projectionReport } from './debug/verify';
import { coverageReport, measureCoverage, type CoverageKey } from './debug/coverage';

// ── 셋업 ──────────────────────────────────────────────────────────────
const surface = new Surface(document.body);
const input = new Input();
input.attach();

const camera = new Camera();
const actor = new Actor();
const scene = buildScene();
const sweep = new SweepTest();
const quiz = new HeightQuiz();
const probeX = new JitterProbe();
const probeY = new JitterProbe();

/**
 * 겹침 밸리데이터 (§3.3). 경고가 아니라 로드 중단이다 —
 * §1.1에 따라 겹침이 1건이라도 있으면 정렬에 순환이 생겨 팝핑이 난다.
 */
const overlaps = validateSlabs(scene.slabs);
let loadHalted = false;
if (overlaps.length > 0) {
  loadHalted = true;
  for (const o of overlaps) console.error(o.message);
  console.error(`슬래브 겹침 ${overlaps.length}건 — 로드 중단 (§3.3)`);
}

/** 지터 앵커. 격자 밖 소수 좌표라야 반올림 오차가 실제로 드러난다. */
const ANCHOR = { x: 3.37, y: -2.11, z: 0.73 };

let showGrid = false;
let showHud = true;
let showPalette = false;
let wireframe = false;
let magnify = false;
let silhouetteView = false;
let cutawayEnabled = true;
let cues: Cues = { ...ALL_CUES };
let cueMode = 0;
const CUE_MODES: Cues[] = [
  { verticalOffset: true, scale: true, shadow: true },
  { verticalOffset: true, scale: true, shadow: false },
  { verticalOffset: true, scale: false, shadow: true },
  { verticalOffset: false, scale: true, shadow: true },
  { verticalOffset: true, scale: false, shadow: false },
  { verticalOffset: false, scale: false, shadow: true },
];

actor.wx = SPAWN.x;
actor.wy = SPAWN.y;
actor.wz = SPAWN.z;
camera.snapTo(actor.wx, actor.wy, actor.wz);
resetProbes();

// ── 시뮬 ──────────────────────────────────────────────────────────────
const moveDir = { wx: 0, wy: 0 };
let jumpQueued = false;
let timeSec = 0;
let heightHold: number | null = null;

function step(dt: number): void {
  timeSec += dt;

  if (sweep.active) {
    sweep.step(actor, dt, resetProbes);
    actor.wz = Math.max(actor.wz, supportZAt(scene.slabs, actor.wx, actor.wy, actor.wz + 0.01));
  } else {
    const ax = input.axisX();
    const ay = input.axisY();
    screenDirToWorld(ax, ay, moveDir);
    const moving = ax !== 0 || ay !== 0;
    // actor.step 은 속도·방향·가방 관성만 갱신한다.
    actor.step(
      dt,
      moving ? moveDir.wx : 0,
      moving ? moveDir.wy : 0,
      input.isDown('ShiftLeft', 'ShiftRight'),
      heightHold === null && jumpQueued,
    );
    jumpQueued = false;
    if (heightHold !== null) {
      actor.wz = heightHold;
      actor.vz = 0;
    }
    // 위치 적분과 AABB 충돌은 여기서 (§3.1)
    moveAndCollide(scene.slabs, actor, dt);
    if (heightHold !== null) actor.setHeight(heightHold);
  }
  camera.update(actor.wx, actor.wy, actor.wz, dt);
}

// ── 렌더 ──────────────────────────────────────────────────────────────
const shadowInfo = makeShadowInfo();
const proxy = makeProxyResult();
const P = makeProjected();

type Drawable = { slab: Slab | null; alpha: number };
const items: OrderItem<Drawable>[] = [];
const groupAlpha = new Map<string, number>();
const actorBounds = makeBounds();
const actorBox = { x: 0, y: 0, w: 0, d: 0, zBottom: 0, zTop: 0 };
const orderStats = { pairs: 0, edges: 0, cycles: 0 };
const lastOrder = { count: 0, actorIndex: -1, underIndex: -1 };
let slabsDrawn = 0;
let cutawayCount = 0;

/** 컷어웨이 페이드는 렌더 프레임마다 한 번 진행하므로 실제 프레임 dt가 필요하다. */
let frameDt = 1 / 60;

function render(): void {
  const ctx = surface.ctx;
  const cam = camera.pos;
  resetStats();
  const supportZ = supportZAt(scene.slabs, actor.wx, actor.wy, actor.wz + 0.01);

  // §6.8-1 SILHOUETTE: 캐릭터 100% 검정 / 배경 흰색.
  // 이 상태에서 직업이 안 읽히면 실루엣 실패다.
  if (silhouetteView) {
    surface.clear('#ffffff');
    drawActorProxy(cam, ctx, actor, supportZ, timeSec, cues, proxy, 0);
    if (magnify) drawMagnifier(ctx);
    return;
  }
  surface.clear(hex(WORLD.sky));

  // 액터도 하나의 AABB로 정렬에 참여시킨다. 이게 핵심이다 —
  // 액터를 정렬 밖에 두고 "적당한 위치에 끼워넣기"를 하면
  // 자기가 서 있는 8m 타일 뒤로 사라진다.
  const r = ACTOR_FOOTPRINT / 2;
  actorBox.x = actor.wx - r;
  actorBox.y = actor.wy - r;
  actorBox.w = r * 2;
  actorBox.d = r * 2;
  actorBox.zBottom = actor.wz;
  actorBox.zTop = actor.wz + ACTOR_HEIGHT;
  aabbScreenBounds(cam, actorBox, actorBounds);
  project(cam, actor.wx, actor.wy, actor.wz + ACTOR_HEIGHT * 0.5, P);
  const actorDepth = P.depth;

  items.length = 0;
  groupAlpha.clear();
  cutawayCount = 0;
  boundsUsed = 0;

  const visible: Slab[] = [];
  for (const s of scene.slabs) {
    if (!slabOnScreen(cam, s)) continue;
    visible.push(s);
    if (!cutawayEnabled) continue;
    const a = updateCutaway(cam, s, actor.wz, actorBounds, actorDepth, frameDt);
    if (s.group) groupAlpha.set(s.group, Math.min(groupAlpha.get(s.group) ?? 1, a));
  }
  for (const s of visible) {
    const alpha = !cutawayEnabled ? 1 : s.group ? (groupAlpha.get(s.group) ?? 1) : 1 - (s.fade ?? 0) * 0.7;
    if (alpha < 0.99) cutawayCount++;
    const b = makeBoundsFor(s);
    if (!b.ok) continue;
    items.push({
      item: { slab: s, alpha },
      box: s,
      bounds: b,
      depth: depthOf(cam, s.y + s.d / 2, (s.zBottom + s.zTop) / 2),
    });
  }
  items.push({ item: { slab: null, alpha: 1 }, box: actorBox, bounds: actorBounds, depth: actorDepth });
  slabsDrawn = items.length;

  const sorted = sortByOcclusion(cam, items, orderStats);
  // 계측: 액터가 자기 발밑 슬래브보다 뒤에 그려지면 사라진다. 그게 원래 증상이었다.
  lastOrder.count = sorted.length;
  lastOrder.actorIndex = -1;
  lastOrder.underIndex = -1;
  for (let k = 0; k < sorted.length; k++) {
    const sl = sorted[k]!.item.slab;
    if (sl === null) lastOrder.actorIndex = k;
    else if (
      sl.zTop <= actor.wz + 0.01 &&
      actor.wx > sl.x && actor.wx < sl.x + sl.w &&
      actor.wy > sl.y && actor.wy < sl.y + sl.d
    ) {
      lastOrder.underIndex = Math.max(lastOrder.underIndex, k);
    }
  }

  let gridDrawn = !showGrid;
  for (const it of sorted) {
    const d = it.item;
    if (!gridDrawn && (d.slab === null || d.slab.zTop > 0.01)) {
      drawGrid(cam, ctx);
      drawZRuler(cam, ctx);
      gridDrawn = true;
    }
    if (d.slab === null) {
      drawActor(ctx, supportZ);
    } else {
      drawSlab(cam, ctx, d.slab, { wireframe, alpha: d.alpha });
      if (d.alpha < 0.98) drawGroundLine(cam, ctx, d.slab, 1 - d.alpha);
    }
  }
  if (!gridDrawn) {
    drawGrid(cam, ctx);
    drawZRuler(cam, ctx);
  }

  if (magnify) drawMagnifier(ctx);

  if (loadHalted) {
    ctx.fillStyle = 'rgba(200,20,40,0.85)';
    ctx.fillRect(0, VIEW_H / 2 - 40, VIEW_W, 80);
    ctx.fillStyle = '#fff';
    ctx.font = '20px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`슬래브 겹침 ${overlaps.length}건 — 로드 중단 (§3.3). 콘솔 확인`, VIEW_W / 2, VIEW_H / 2 + 7);
    ctx.textAlign = 'left';
  }
}

/**
 * 캐릭터 확대 인스펙터 (Z).
 * 40.2px/m 에서 캐릭터는 가로 26px이다. 실루엣과 부피를 눈으로 판단하려면
 * 확대해서 봐야 한다. 최근접 확대라 실제 픽셀을 그대로 본다.
 */
const MAG = 6;
const MAG_SRC = 96;
function drawMagnifier(ctx: CanvasRenderingContext2D): void {
  const sx = Math.round(proxy.screenX - MAG_SRC / 2);
  const sy = Math.round(proxy.screenY - MAG_SRC * 0.72);
  const dw = MAG_SRC * MAG;
  const dx = VIEW_W - dw - 16;
  const dy = 16;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(surface.canvas, sx, sy, MAG_SRC, MAG_SRC, dx, dy, dw, dw);
  ctx.imageSmoothingEnabled = true;
  ctx.strokeStyle = 'rgba(120,180,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(dx + 0.5, dy + 0.5, dw, dw);
  ctx.strokeRect(sx + 0.5, sy + 0.5, MAG_SRC, MAG_SRC);
  ctx.restore();
}

const boundsPool: ScreenBounds[] = [];
let boundsUsed = 0;
function makeBoundsFor(s: Slab): ScreenBounds {
  if (boundsUsed >= boundsPool.length) boundsPool.push(makeBounds());
  const b = boundsPool[boundsUsed++]!;
  return slabScreenBounds(camera.pos, s, b);
}

function drawActor(ctx: CanvasRenderingContext2D, supportZ: number): void {
  const cam = camera.pos;
  if (cues.shadow) drawShadow(cam, ctx, actor.wx, actor.wy, actor.wz, supportZ, shadowInfo);
  else measureShadowOnly(supportZ);
  const rim = cutawayCount > 0 ? 0.5 : 0;
  drawActorProxy(cam, ctx, actor, supportZ, timeSec, cues, proxy, rim);
}

/** 그림자를 끈 상태에서도 단서 크기를 계측해야 HUD 숫자가 살아 있다. */
function measureShadowOnly(supportZ: number): void {
  const cam = camera.pos;
  project(cam, actor.wx, actor.wy, supportZ, P);
  const gy = P.y;
  project(cam, actor.wx, actor.wy, actor.wz, P);
  shadowInfo.supportZ = supportZ;
  shadowInfo.height = actor.wz - supportZ;
  shadowInfo.gapPx = gy - P.y;
}

/** 임의 높이에서 세 단서의 크기. HUD와 검증 리포트가 같은 함수를 쓴다. */
function measureCues(h: number): { gapPx: number; scalePct: number; offsetPx: number } {
  const cam = camera.pos;
  project(cam, actor.wx, actor.wy, 0, P);
  const y0 = P.y;
  const d0 = P.depth;
  project(cam, actor.wx, actor.wy, h, P);
  return {
    gapPx: y0 - P.y,
    scalePct: (d0 / P.depth - 1) * 100,
    offsetPx: y0 - P.y,
  };
}

// ── 루프 ──────────────────────────────────────────────────────────────
let last = performance.now();
let acc = 0;
let fps = 0;
let frameMs = 0;

function advance(rawDt: number): void {
  const dt = Math.min(rawDt, MAX_FRAME_DT);
  if (dt <= 0) return;
  frameDt = dt;
  fps += (1 / dt - fps) * 0.1;
  readHotkeys();

  acc += dt;
  let guard = 0;
  while (acc >= SIM_DT && guard++ < 8) {
    step(SIM_DT);
    acc -= SIM_DT;
  }

  const t0 = performance.now();
  render();
  frameMs += (performance.now() - t0 - frameMs) * 0.1;

  project(camera.pos, ANCHOR.x, ANCHOR.y, ANCHOR.z, P);
  probeX.sample(Math.round(P.x), dt);
  probeY.sample(Math.round(P.y), dt);

  if (showHud) {
    drawHud(surface.ctx, {
      fps,
      ms: frameMs,
      world: { wx: actor.wx, wy: actor.wy, wz: actor.wz },
      supportZ: shadowInfo.supportZ,
      onGround: actor.onGround,
      speed: actor.speed,
      slabsDrawn,
      slabsTotal: scene.slabs.length,
      quads: STATS.quads,
      cutaways: cutawayCount,
      cues,
      cueMagnitude: measureCues(actor.wz - shadowInfo.supportZ),
      quiz,
      jitter: {
        flips: probeX.flipCount + probeY.flipCount,
        maxStep: Math.max(probeX.maxStep, probeY.maxStep),
        samples: Math.min(probeX.samples, probeY.samples),
        settling: probeX.settling,
        judging: sweep.active,
      },
    });
    drawHelp(surface.ctx, VIEW_H);
  }
  if (showPalette) drawPaletteView(surface.ctx, VIEW_W, VIEW_H);
  input.endFrame();
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = (now - last) / 1000;
  last = now;
  advance(dt);
}

function readHotkeys(): void {
  if (input.wasPressed('Space')) jumpQueued = true;
  if (input.wasPressed('KeyG')) showGrid = !showGrid;
  if (input.wasPressed('KeyH')) showHud = !showHud;
  if (input.wasPressed('KeyP')) showPalette = !showPalette;
  if (input.wasPressed('KeyW')) wireframe = !wireframe;
  if (input.wasPressed('KeyZ')) magnify = !magnify;
  if (input.wasPressed('KeyM')) {
    silhouetteView = !silhouetteView;
    setSilhouette(silhouetteView);
  }
  if (input.wasPressed('KeyX')) cutawayEnabled = !cutawayEnabled;
  if (input.wasPressed('KeyT')) sweep.toggle(actor, resetProbes);
  if (input.wasPressed('KeyY')) sweep.cycleDir(actor, resetProbes);
  if (input.wasPressed('KeyR')) resetProbes();
  if (input.wasPressed('KeyU')) actor.urgency = actor.urgency >= 1 ? 0 : actor.urgency + 0.5;
  if (input.wasPressed('KeyC')) {
    cueMode = (cueMode + 1) % CUE_MODES.length;
    cues = { ...CUE_MODES[cueMode]! };
  }
  if (input.wasPressed('KeyK')) {
    if (quiz.active) quiz.stop();
    else {
      quiz.start(scene.heightTargets);
      applyQuizTarget();
    }
  }
  if (input.wasPressed('KeyV')) printVerify();

  // 높이 조절 — 68°에서 높이가 읽히는지 확인하는 주 도구 (§11-1)
  if (input.isDown('BracketRight')) setHold((heightHold ?? actor.wz) + 0.14);
  if (input.isDown('BracketLeft')) setHold(Math.max(actor.groundZ, (heightHold ?? actor.wz) - 0.14));
  if (input.wasPressed('Backslash')) heightHold = null;

  for (let d = 0; d < 6; d++) {
    if (!input.wasPressed(`Digit${d + 1}`)) continue;
    if (quiz.active) {
      quiz.guess(d);
      applyQuizTarget();
    } else {
      const t = scene.heightTargets[d];
      if (t) placeAt(t.x, t.y, t.z);
    }
  }
}

/** 높이 고정 모드. [ ] 로만 켠다 — 이동 중에 켜지면 충돌이 고정 z에서 판정돼 계단을 못 오른다. */
function setHold(z: number): void {
  heightHold = z;
  actor.setHeight(z);
}

/** 위치 이동. 높이 고정은 반드시 푼다. 그래야 물리가 정상 동작한다. */
function placeAt(x: number, y: number, z: number): void {
  heightHold = null;
  actor.wx = x;
  actor.wy = y;
  actor.vx = 0;
  actor.vy = 0;
  actor.vz = 0;
  actor.setHeight(z);
  actor.onGround = true;
  camera.snapTo(x, y, actor.wz);
}

function applyQuizTarget(): void {
  const t = quiz.target;
  if (!t) return;
  placeAt(t.x, t.y, t.z);
}

function resetProbes(settleSec?: number): void {
  probeX.reset(settleSec);
  probeY.reset(settleSec);
}

/** §4.2 아트 우선순위를 실측으로 확인한다. 카메라를 잠깐 옮겨서 잰다. */
function coverageAt(spots: [string, number, number, number][]): [string, Record<CoverageKey, number>][] {
  const saved = { x: actor.wx, y: actor.wy, z: actor.wz, hold: heightHold };
  const rows: [string, Record<CoverageKey, number>][] = [];
  for (const [label, x, y, z] of spots) {
    placeAt(x, y, z);
    rows.push([label, measureCoverage(camera.pos, scene.slabs)]);
  }
  placeAt(saved.x, saved.y, saved.z);
  heightHold = saved.hold;
  return rows;
}

/**
 * 캐릭터가 화면에서 실제로 몇 px인가. §6.1은 "약 70px"로 잡고 그 위에
 * 정체성 설계 전체를 얹었으므로, 숫자가 다르면 6장이 다시 계산돼야 한다.
 */
function actorScreenSize(): { heightPx: number; widthPx: number; bagPx: number } {
  const saved = { x: actor.wx, y: actor.wy, z: actor.wz, hold: heightHold };
  placeAt(SPAWN.x, SPAWN.y, 0);
  const cam = camera.pos;
  // 화면에서 가장 아래 = 카메라에 가장 가까운 발끝(-y), 가장 위 = 먼 쪽 머리(+y)
  const bx = actor.wx;
  const by = actor.wy;
  project(cam, bx, by - ACTOR_FOOTPRINT / 2, 0, P);
  const yBottom = P.y;
  project(cam, bx, by + ACTOR_FOOTPRINT / 2, ACTOR_HEIGHT, P);
  const yTop = P.y;
  project(cam, bx - ACTOR_FOOTPRINT / 2, by, ACTOR_HEIGHT * 0.8, P);
  const xL = P.x;
  project(cam, bx + ACTOR_FOOTPRINT / 2, by, ACTOR_HEIGHT * 0.8, P);
  const xR = P.x;
  const bag = 0.46 * 1.4 * P.scale;
  placeAt(saved.x, saved.y, saved.z);
  heightHold = saved.hold;
  return { heightPx: yBottom - yTop, widthPx: xR - xL, bagPx: bag };
}

function verify(): { pass: boolean; report: string } {
  const a = projectionReport();
  const sz = actorScreenSize();
  const szReport =
    `[F] 캐릭터 화면 크기 (§6.1 대조)\n` +
    `    세로 바운딩 ${sz.heightPx.toFixed(1)}px  가로 ${sz.widthPx.toFixed(1)}px  가방 폭 ${sz.bagPx.toFixed(1)}px\n` +
    `    기획서 §6.1은 "약 70px". 실측은 ${sz.heightPx.toFixed(0)}px — §6.1의 결론(얼굴 0%,\n` +
    `    가방 윗면이 최대 노출면)은 오히려 더 강해진다.`;
  const b = heightCueReport(measureCues);
  const c = frustumReport();
  const e = coverageReport(
    coverageAt([
      ['골목 (건물 사이)', 5.6, 2, 0],
      ['인도 (상가 앞)', 0, -6, 0],
      ['대로 한가운데', -4, -12, 0],
      ['저층 옥상 9m', -1.5, 15.5, 9],
      ['상가 옥상 15m', 13.7, 1.2, 15],
      ['육교 데크 5.8m', 2.5, -12, 5.75],
    ]),
  );
  const savedSweep = sweep.active;
  const savedPos = { x: actor.wx, y: actor.wy, z: actor.wz };
  const savedHold = heightHold;
  heightHold = null;
  const d = jitterReport({
    begin: (dirIndex) => {
      placeAt(SPAWN.x, SPAWN.y, 0);
      sweep.active = false;
      sweep.dirIndex = dirIndex;
      sweep.toggle(actor, resetProbes);
    },
    warm: (frames, dt) => {
      for (let k = 0; k < frames; k++) advance(dt);
    },
    reset: () => resetProbes(),
    measure: (frames, dt) => {
      for (let k = 0; k < frames; k++) advance(dt);
      return {
        flipsX: probeX.flipCount,
        flipsY: probeY.flipCount,
        maxStepX: probeX.maxStep,
        maxStepY: probeY.maxStep,
        samples: Math.min(probeX.samples, probeY.samples),
      };
    },
    end: () => {
      sweep.active = savedSweep;
      placeAt(savedPos.x, savedPos.y, savedPos.z);
      heightHold = savedHold;
      resetProbes();
    },
  });
  const pass = a.pass && d.pass && !loadHalted;
  return {
    pass,
    report: [
      `golmok M0 (기획서 v2) 검증  —  ${pass ? '합격' : '불합격'}`,
      `슬래브 ${scene.slabs.length}개 · 겹침 ${overlaps.length}건`,
      '',
      a.report, '', szReport, '', b, '', c, '', e, '', d.report,
    ].join('\n'),
  };
}

function printVerify(): void {
  const { pass, report } = verify();
  console.log(`%c${report}`, `color:${pass ? '#6ee6a0' : '#ff5a6e'}`);
}

declare global {
  interface Window {
    golmok: {
      actor: Actor;
      camera: Camera;
      scene: typeof scene;
      quiz: HeightQuiz;
      sweep: SweepTest;
      cues: () => Cues;
      setCues: (c: Partial<Cues>) => void;
      setHeight: (z: number) => void;
      teleport: (x: number, y: number, z: number) => void;
      tick: (frames: number, dt?: number) => void;
      verify: () => { pass: boolean; report: string };
      coverage: () => Record<string, number>;
      readout: () => Record<string, unknown>;
    };
  }
}

window.golmok = {
  actor,
  camera,
  scene,
  quiz,
  sweep,
  cues: () => cues,
  setCues: (c) => {
    cues = { ...cues, ...c };
  },
  /** 높이 고정 모드로 띄운다 (높이 단서 검증용) */
  setHeight: (z) => setHold(z),
  /** 위치 이동. 높이 고정을 풀고 물리에 맡긴다 */
  teleport: (x, y, z) => placeAt(x, y, z),
  tick: (frames, dt = 1 / 60) => {
    for (let k = 0; k < frames; k++) advance(dt);
    last = performance.now();
  },
  verify,
  coverage: () => measureCoverage(camera.pos, scene.slabs),
  readout: () => ({
    fps: Math.round(fps),
    renderMs: +frameMs.toFixed(2),
    world: [+actor.wx.toFixed(2), +actor.wy.toFixed(2), +actor.wz.toFixed(2)],
    supportZ: shadowInfo.supportZ,
    heightAboveSupport: +(actor.wz - shadowInfo.supportZ).toFixed(2),
    cues,
    cueMagnitude: measureCues(actor.wz - shadowInfo.supportZ),
    pxPerMFocus: +PX_PER_M_FOCUS.toFixed(2),
    slabs: { total: scene.slabs.length, drawn: slabsDrawn, cutaway: cutawayCount },
    quads: { faces: STATS.faces, quads: STATS.quads, textured: STATS.textured },
    order: {
      ...orderStats,
      ...lastOrder,
      nearStraddle: NEAR_STRADDLE.count,
      /** 액터가 발밑 슬래브보다 앞이어야 한다. false면 캐릭터가 사라진다. */
      actorInFront: lastOrder.underIndex < 0 || lastOrder.actorIndex > lastOrder.underIndex,
    },
    overlaps: overlaps.length,
    jitter: {
      flipsX: probeX.flipCount,
      flipsY: probeY.flipCount,
      maxStepX: probeX.maxStep,
      maxStepY: probeY.maxStep,
      samples: Math.min(probeX.samples, probeY.samples),
    },
  }),
};

requestAnimationFrame(frame);
