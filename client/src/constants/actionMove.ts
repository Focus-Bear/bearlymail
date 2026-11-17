/**
 * Feedback shown when a prioritised email leaves Triage for the Action tab.
 * The first move is deliberately loud (testers lost track of where the email went);
 * every later move uses the quieter variant.
 */

export const ACTION_TAB_EMPHASIS = {
  FIRST_TIME: 'first-time',
  SUBTLE: 'subtle',
} as const;

export type ActionTabEmphasis = (typeof ACTION_TAB_EMPHASIS)[keyof typeof ACTION_TAB_EMPHASIS];

/** CSS class (App.css) that animates the Action tab for each emphasis level. */
export const ACTION_TAB_EMPHASIS_CLASS: Record<ActionTabEmphasis, string> = {
  [ACTION_TAB_EMPHASIS.FIRST_TIME]: 'animate-tab-bounce',
  [ACTION_TAB_EMPHASIS.SUBTLE]: 'animate-tab-pulse',
};

/** Per-user localStorage flag: the user has seen the first-prioritise celebration. */
export const FIRST_PRIORITISE_SEEN_STORAGE_KEY_PREFIX = 'bearlymail_firstPrioritiseSeen_';

export interface ActionMoveFlightStyle {
  durationMs: number;
  /** How far the flight path bows upwards between the email and the tab. */
  arcHeightPx: number;
  /** Ghost size relative to the email row when it reaches the tab. */
  endScale: number;
  ghostClassName: string;
}

export const ACTION_MOVE_FLIGHT_STYLE: Record<ActionTabEmphasis, ActionMoveFlightStyle> = {
  [ACTION_TAB_EMPHASIS.FIRST_TIME]: {
    durationMs: 1100,
    arcHeightPx: 140,
    endScale: 0.18,
    ghostClassName: 'action-move-ghost action-move-ghost--first-time',
  },
  [ACTION_TAB_EMPHASIS.SUBTLE]: {
    durationMs: 550,
    arcHeightPx: 40,
    endScale: 0.12,
    ghostClassName: 'action-move-ghost',
  },
};

/** The first-move toast stays long enough to read and reach the View button. */
export const ACTION_MOVE_TOAST_DURATION_MS = 8000;

/** Where along the flight (0–1) the ghost reaches the top of its arc. */
export const ACTION_MOVE_FLIGHT_ARC_PEAK_OFFSET = 0.45;

/** Ghost opacity on arrival — still visible as it lands on the tab. */
export const ACTION_MOVE_GHOST_END_OPACITY = 0.6;

export const ACTION_MOVE_GHOST_TEST_ID = 'action-move-ghost';
