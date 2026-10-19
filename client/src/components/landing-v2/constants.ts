export const KEY_ENTER = 'Enter';
export const KEY_SPACE = ' ';
export const KEY_ESCAPE = 'Escape';

/** Where every landing "Get started / Sign up" CTA sends the visitor. The login
 * page hosts the Google/Microsoft/Zoho sign-in that creates and activates a new
 * account directly — there is no waitlist gate. */
export const SIGNUP_PATH = '/login';

/** Role-specific landing pages; shared by the router and the "Who it's for" links. */
export const ENGINEERING_MANAGER_LANDING_PATH = '/for/engineering-managers';
export const PRODUCT_MANAGER_LANDING_PATH = '/for/product-managers';

/** Focus Bear blocks distracting sites; recommended for keeping people out of
 * their original webmail once BearlyMail is their inbox. */
export const FOCUS_BEAR_URL = 'https://www.focusbear.io';

/** Embed URL for the hero product video (e.g. a YouTube/Vimeo embed link). While
 * empty, the hero renders a "video coming soon" placeholder in the same 16:9 slot. */
export const HERO_VIDEO_EMBED_URL = '';

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
