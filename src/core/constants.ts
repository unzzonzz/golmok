/**
 * 전역 튜닝 상수 (기획서 v2). 수치는 전부 여기 모은다.
 * 다른 파일에 매직넘버가 생기면 그건 버그로 취급한다.
 */

// ── 뷰 ────────────────────────────────────────────────────────────────
export const VIEW_W = 1280;
export const VIEW_H = 720;

// ── 카메라 · 투영 (§2.1) ──────────────────────────────────────────────
/** 지면 기준 고도각. 90°가 완전 수직. */
export const ELEVATION_DEG = 68;
/**
 * 수직 FOV. §2.3 — "튜닝 대상이 아니다. 확정하고 건드리지 마세요."
 * 바꾸면 §4.4 건물 높이 정책이 전부 무효화된다.
 */
export const FOV_Y_DEG = 38;
export const CAM_DISTANCE = 26; // m
export const NEAR_PLANE = 0.35; // m

// ── 카메라 추종 (§2.4) ────────────────────────────────────────────────
/** 데드존 없음. 원근에서 데드존은 건물 기울기를 미묘하게 흔들어 더 눈에 띈다. */
export const CAM_STIFFNESS_XY = 120;
export const CAM_DAMPING_XY = 22; // zeta = 22 / (2*sqrt(120)) = 1.004, 사실상 임계감쇠
/** z 추종만 낮춘다. 점프에 카메라가 따라 튀면 높이 단서 3개가 전부 죽는다. */
export const CAM_STIFFNESS_Z = 40;
export const CAM_DAMPING_Z = 2 * Math.sqrt(40); // 같은 감쇠비 유지

// ── 시뮬레이션 ────────────────────────────────────────────────────────
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
export const MAX_FRAME_DT = 0.25;

// ── 액터 ──────────────────────────────────────────────────────────────
/** §3.1 — 충돌 구간이 [z, z+1.75] */
export const ACTOR_HEIGHT = 1.75;
export const ACTOR_FOOTPRINT = 0.62;
/** §3.1 — 이 이하 턱은 자동으로 오른다 */
export const STEP_UP = 0.35;
export const GRAVITY = 22;
export const JOG_SPEED = 3.4; // §6.4 "이 캐릭터는 걷지 않는다"
export const SPRINT_SPEED = 5.2;
export const JUMP_SPEED = 7.2; // 최고점 약 1.18m
export const ACCEL_GROUND = 34;
export const ACCEL_AIR = 12;

// ── 가방 관성 (§6.4-1) ────────────────────────────────────────────────
export const BAG_STIFFNESS = 140;
export const BAG_DAMPING = 18;
export const BAG_MAX_OFFSET = 0.06; // m
/** §6.6 — 시간 압박의 주 신호. 촉박 +40% */
export const BAG_SWAY_URGENT = 1.4;

// ── 방향 표시 (§6.4-4) ────────────────────────────────────────────────
/** 상체가 하체보다 이만큼 먼저 돈다 */
export const TORSO_LEAD_SEC = 0.08;
export const TURN_RATE = 12; // rad/s

// ── 그림자 = 높이의 주 신호 (§6.7) ────────────────────────────────────
export const SHADOW_BASE_RADIUS = 0.42; // m
export const SHADOW_RADIUS_FALLOFF = 0.12;
export const SHADOW_BASE_ALPHA = 0.55;
export const SHADOW_ALPHA_FALLOFF = 0.18;

// ── 컷어웨이 (§3.2) ───────────────────────────────────────────────────
export const CUTAWAY_MIN_HEIGHT_ABOVE = 2.0; // m
export const CUTAWAY_ALPHA = 0.3;
export const CUTAWAY_FADE_SEC = 0.12;
export const CUTAWAY_HYSTERESIS_PX = 8;

// ── 건물 높이 정책 (§4.4) ─────────────────────────────────────────────
export const MAX_HEIGHT_PLAY = 18;
export const MAX_HEIGHT_EDGE = 24;

// ── 쿼드 분할 (§7.1-5) ────────────────────────────────────────────────
export const QUAD_SPLIT_PX = 120;
export const QUAD_SPLIT_ECCENTRICITY = 0.5;

// ── 디버그 ────────────────────────────────────────────────────────────
export const GRID_MAJOR_EVERY = 8;
export const JITTER_WINDOW = 240;
export const JITTER_SETTLE_SEC = 0.6;
