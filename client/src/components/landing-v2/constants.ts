export const KEY_ENTER = 'Enter';
export const KEY_SPACE = ' ';
export const KEY_ESCAPE = 'Escape';

export type DemoTab = 'triage' | 'action' | 'followup';
export type PrioChoice = 'can-wait' | 'get-on-it' | 'oh-shit';

export const TAB_TRIAGE: DemoTab = 'triage';
export const TAB_ACTION: DemoTab = 'action';
export const TAB_FOLLOWUP: DemoTab = 'followup';

export const PRIO_CAN_WAIT: PrioChoice = 'can-wait';
export const PRIO_GET_ON_IT: PrioChoice = 'get-on-it';
export const PRIO_OH_SHIT: PrioChoice = 'oh-shit';

export const FLY_ANIMATION_MS = 720;
export const RESET_AFTER_MS = 30_000;
export const TOAST_VISIBLE_MS = 3_800;
export const BUMP_HIGHLIGHT_MS = 600;
export const STEP_AUTOCYCLE_MS = 4_500;
export const STEP_COUNT = 4;

export const INITIAL_TRIAGE = 1;
export const INITIAL_ACTION = 10;
export const INITIAL_FOLLOWUP = 89;

export const INITIAL_COUNTS: Record<DemoTab, number> = {
  [TAB_TRIAGE]: INITIAL_TRIAGE,
  [TAB_ACTION]: INITIAL_ACTION,
  [TAB_FOLLOWUP]: INITIAL_FOLLOWUP,
};

export const PRIO_ROUTES: Record<PrioChoice, { dest: Exclude<DemoTab, 'triage'>; toastKeySuffix: string }> = {
  [PRIO_CAN_WAIT]: { dest: TAB_FOLLOWUP, toastKeySuffix: 'routed.canWait' },
  [PRIO_GET_ON_IT]: { dest: TAB_ACTION, toastKeySuffix: 'routed.getOnIt' },
  [PRIO_OH_SHIT]: { dest: TAB_ACTION, toastKeySuffix: 'routed.ohShit' },
};

/** i18n ids (under <prefix>.skeleton.*) for the static placeholder rows that
 * pad the Action tab so "top of Action" is visually meaningful. */
export const SKELETON_ROW_IDS = ['first', 'second', 'third'] as const;

/* =========================================================================
 * Rich demo (default landing page only) — multi-email triage, click-to-read,
 * guided pulse sequence, reply lock and a mini product tour. Ports the design
 * in Landing.html. The persona landing pages keep using the simpler LiveDemo.
 * ========================================================================= */

export type RowAction = 'archive' | 'snooze' | 'block';
/** Recommended action the guided pulse highlights on the top Triage card. */
export type PulseTarget = PrioChoice | 'archive';
export type CardTier = 'high' | 'med' | 'low';
export type CardVariant = 'urgent' | 'followup' | 'normal';
/** Transient per-card animation state in the rich demo. */
export type CardAnim = 'flying' | 'snoozing' | 'just-moved';

export const ROW_ACTION_ARCHIVE: RowAction = 'archive';
export const ROW_ACTION_SNOOZE: RowAction = 'snooze';
export const ROW_ACTION_BLOCK: RowAction = 'block';
export const PULSE_ARCHIVE = 'archive';
export const CARD_VARIANT_NORMAL: CardVariant = 'normal';
export const CARD_VARIANT_URGENT: CardVariant = 'urgent';
export const CARD_VARIANT_FOLLOWUP: CardVariant = 'followup';
export const CARD_ANIM_FLYING: CardAnim = 'flying';
export const CARD_ANIM_SNOOZING: CardAnim = 'snoozing';
export const CARD_ANIM_JUST_MOVED: CardAnim = 'just-moved';
export const TOUR_STEP_PRIORITY_SCORE = 'priorityScore';
export const TOUR_STEP_SORTED = 'sortedByPriority';
export const TOUR_STEP_PULSING = 'pulsingReaction';

/** Structural description of a demo email. The human-readable text lives in
 * i18n under `landing.v2.demo.cards.<id>`; this just carries layout + behaviour. */
export interface RichDemoCard {
  id: string;
  /** Priority score (0–100). Drives ranked insertion into Action. */
  score: number;
  tier: CardTier;
  variant: CardVariant;
  /** Guided-sequence pulse target while the card sits at the top of Triage. */
  pulse?: PulseTarget;
  rowActions: RowAction[];
}

export const RICH_TRIAGE_CARDS: RichDemoCard[] = [
  { id: 'aria', score: 74, tier: 'high', variant: 'urgent', pulse: PRIO_OH_SHIT, rowActions: ['archive', 'block'] },
  { id: 'sam', score: 28, tier: 'med', variant: 'normal', pulse: PRIO_GET_ON_IT, rowActions: ['archive', 'block'] },
  { id: 'notion', score: 9, tier: 'low', variant: 'normal', pulse: 'archive', rowActions: ['archive', 'block'] },
];

export const RICH_ACTION_CARDS: RichDemoCard[] = [
  { id: 'daniel', score: 68, tier: 'high', variant: 'normal', rowActions: ['archive', 'snooze'] },
  { id: 'acme', score: 61, tier: 'high', variant: 'normal', rowActions: ['archive', 'snooze'] },
];

export const RICH_FOLLOWUP_CARDS: RichDemoCard[] = [
  { id: 'morgan', score: 0, tier: 'low', variant: 'followup', rowActions: ['archive'] },
  { id: 'jordan', score: 0, tier: 'low', variant: 'followup', rowActions: ['archive'] },
  { id: 'taylor', score: 0, tier: 'low', variant: 'followup', rowActions: ['archive'] },
];

export const RICH_CARDS_BY_ID: Record<string, RichDemoCard> = [
  ...RICH_TRIAGE_CARDS,
  ...RICH_ACTION_CARDS,
  ...RICH_FOLLOWUP_CARDS,
].reduce<Record<string, RichDemoCard>>((acc, card) => ({ ...acc, [card.id]: card }), {});

export const RICH_INITIAL_LISTS: Record<DemoTab, string[]> = {
  triage: RICH_TRIAGE_CARDS.map(card => card.id),
  action: RICH_ACTION_CARDS.map(card => card.id),
  followup: RICH_FOLLOWUP_CARDS.map(card => card.id),
};

/** Where each Triage reaction routes the card, and the toast it raises. */
export const RICH_PRIO_ROUTES: Record<PrioChoice, { snooze?: boolean; dest?: Exclude<DemoTab, 'triage'>; toast: string }> = {
  'can-wait': { snooze: true, toast: 'routed.canWait' },
  'get-on-it': { dest: TAB_ACTION, toast: 'routed.getOnIt' },
  'oh-shit': { dest: TAB_ACTION, toast: 'routed.ohShit' },
};

export const RICH_TOUR_STEPS = [
  TOUR_STEP_PRIORITY_SCORE,
  TOUR_STEP_SORTED,
  TOUR_STEP_PULSING,
] as const;
export type RichTourStep = (typeof RICH_TOUR_STEPS)[number];

export const SNOOZE_OUT_MS = 470;
export const JUST_MOVED_MS = 1_800;
export const RICH_RESET_AFTER_MS = 16_000;
export const RICH_TOAST_VISIBLE_MS = 3_600;
export const TOUR_AUTORUN_DELAY_MS = 1_000;
export const TOUR_SESSION_KEY = 'bm_tour_v1';
export const TOUR_SPOTLIGHT_PAD = 6;
export const TOUR_POP_GAP = 12;
export const TOUR_EDGE_GAP = 8;
