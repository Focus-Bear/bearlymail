/**
 * Stable `data-tour` anchors the inbox onboarding tour spotlights. Elements carry
 * `data-tour={TOUR_TARGETS.X}`; the tour finds them with tourTargetSelector so
 * restyling or restructuring a component can't silently orphan a step.
 */
export const TOUR_TARGETS = {
  TRIAGE_TAB: 'triage-tab',
  ACTION_TAB: 'action-tab',
  BATCH_DELIVERY: 'batch-delivery',
  EMAIL_ROW: 'email-row',
  EMAIL_PRIORITY: 'email-priority',
  EMAIL_ARCHIVE: 'email-archive',
  EMAIL_SNOOZE: 'email-snooze',
  EMAIL_MORE_ACTIONS: 'email-more-actions',
  CATEGORY_ACCORDION: 'category-accordion',
  BACKGROUND_SORTING: 'background-sorting',
} as const;

export type TourTarget = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];

export function tourTargetSelector(target: TourTarget): string {
  return `[data-tour="${target}"]`;
}

/**
 * Skipping the tour takes a deliberate press-and-hold: BearlyMail works quite
 * differently from other email clients, and people were skipping straight past
 * the explanation.
 */
export const TOUR_SKIP_HOLD_DURATION_MS = 10_000;

/** Marks the hold-to-skip button so the tour's Enter-to-advance shortcut leaves its key presses alone. */
export const TOUR_HOLD_TO_SKIP_ATTRIBUTE = 'data-tour-hold-to-skip';
