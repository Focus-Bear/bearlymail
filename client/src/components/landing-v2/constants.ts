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
export const RESET_AFTER_MS = 12_000;
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
