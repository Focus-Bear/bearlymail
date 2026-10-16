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
  CATEGORY_ACCORDION: 'category-accordion',
} as const;

export type TourTarget = (typeof TOUR_TARGETS)[keyof typeof TOUR_TARGETS];

export function tourTargetSelector(target: TourTarget): string {
  return `[data-tour="${target}"]`;
}
