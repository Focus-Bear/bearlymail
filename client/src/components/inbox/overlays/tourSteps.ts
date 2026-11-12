import type { Placement, Step } from 'react-joyride';

import { TOUR_TARGETS, TourTarget, tourTargetSelector } from 'constants/tour';

/** Joyride's placement for a step with nothing to point at (a centred card). */
export const TOUR_PLACEMENT_CENTER = 'center' as const;
const TOUR_FALLBACK_TARGET = 'body';

export interface TourStepDefinition {
  titleKey: string;
  contentKey: string;
  /**
   * Anchors to spotlight, in preference order — the first one rendered on screen
   * wins. Missing targets fall back to a centred card.
   */
  targets: TourTarget[];
  placement?: Placement;
}

/** A tour step with its copy translated, ready for the overlay. */
export interface TourStep {
  title: string;
  content: string;
  targets: TourTarget[];
  placement?: Placement;
}

/**
 * The first email card, else its category header when every accordion is
 * collapsed. The per-control steps fall back to these when the control isn't
 * on screen (no emails yet, or a layout that hides it), then to a centred card.
 */
const EMAIL_CARD_TARGETS: TourTarget[] = [TOUR_TARGETS.EMAIL_ROW, TOUR_TARGETS.CATEGORY_ACCORDION];

export const INBOX_TOUR_STEPS: TourStepDefinition[] = [
  {
    titleKey: 'onboarding.tour.triageTitle',
    contentKey: 'onboarding.tour.triageContent',
    targets: [TOUR_TARGETS.TRIAGE_TAB],
    placement: 'bottom-start',
  },
  {
    // Onboarding unlocks the inbox once its newest emails are sorted; this
    // explains the rest moving into categories. Without the progress banner
    // (sorting already finished, or a replayed tour) it shows as a centred card.
    titleKey: 'onboarding.tour.backgroundSortingTitle',
    contentKey: 'onboarding.tour.backgroundSortingContent',
    targets: [TOUR_TARGETS.BACKGROUND_SORTING],
    placement: 'bottom',
  },
  {
    titleKey: 'onboarding.tour.actionTitle',
    contentKey: 'onboarding.tour.actionContent',
    targets: [TOUR_TARGETS.ACTION_TAB],
    placement: 'bottom-start',
  },
  {
    titleKey: 'onboarding.tour.deliveryTitle',
    contentKey: 'onboarding.tour.deliveryContent',
    targets: [TOUR_TARGETS.BATCH_DELIVERY],
    placement: 'bottom',
  },
  {
    titleKey: 'onboarding.tour.assistantTitle',
    contentKey: 'onboarding.tour.assistantContent',
    targets: EMAIL_CARD_TARGETS,
    placement: 'bottom',
  },
  {
    titleKey: 'onboarding.tour.prioritiseTitle',
    contentKey: 'onboarding.tour.prioritiseContent',
    targets: [TOUR_TARGETS.EMAIL_PRIORITY, ...EMAIL_CARD_TARGETS],
    placement: 'top-start',
  },
  {
    titleKey: 'onboarding.tour.snoozeTitle',
    contentKey: 'onboarding.tour.snoozeContent',
    targets: [TOUR_TARGETS.EMAIL_SNOOZE, ...EMAIL_CARD_TARGETS],
    placement: 'top',
  },
  {
    titleKey: 'onboarding.tour.archiveTitle',
    contentKey: 'onboarding.tour.archiveContent',
    targets: [TOUR_TARGETS.EMAIL_ARCHIVE, ...EMAIL_CARD_TARGETS],
    placement: 'top',
  },
  {
    titleKey: 'onboarding.tour.blockTitle',
    contentKey: 'onboarding.tour.blockContent',
    targets: [TOUR_TARGETS.EMAIL_MORE_ACTIONS, ...EMAIL_CARD_TARGETS],
    placement: 'top-end',
  },
];

function isRendered(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * The first of the step's anchors that is actually laid out on screen, if any.
 * Per-email anchors repeat on every card, so the first visible copy wins — the
 * first in the DOM may sit in a collapsed category.
 */
export function findTourTarget(targets: TourTarget[], root: ParentNode = document): HTMLElement | null {
  for (const target of targets) {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(tourTargetSelector(target)));
    const rendered = elements.find(isRendered);
    if (rendered) {
      return rendered;
    }
  }
  return null;
}

/**
 * Builds the Joyride step: anchored to its element when it is on screen, else a
 * centred card (e.g. no emails loaded yet, or a layout that hides the element)
 * so the tour never points at nothing.
 */
export function toJoyrideStep(step: TourStep, root: ParentNode = document): Step {
  const element = findTourTarget(step.targets, root);
  if (!element) {
    return toCentredStep(step);
  }
  return { target: element, placement: step.placement, title: step.title, content: step.content };
}

function toCentredStep(step: TourStep): Step {
  return { target: TOUR_FALLBACK_TARGET, placement: TOUR_PLACEMENT_CENTER, title: step.title, content: step.content };
}

/**
 * Only the active step is resolved against the live DOM: a later step's element
 * may not exist yet (e.g. emails still loading), so it is looked up when shown.
 */
export function toJoyrideSteps(steps: TourStep[], activeIndex: number, root: ParentNode = document): Step[] {
  return steps.map((step, index) => (index === activeIndex ? toJoyrideStep(step, root) : toCentredStep(step)));
}
