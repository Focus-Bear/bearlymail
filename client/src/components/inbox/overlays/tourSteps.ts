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
   * wins. Empty for the welcome card, which is intentionally centred.
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

export const INBOX_TOUR_STEPS: TourStepDefinition[] = [
  { titleKey: 'onboarding.tour.welcome', contentKey: 'onboarding.tour.welcomeContent', targets: [] },
  {
    titleKey: 'onboarding.tour.triageTitle',
    contentKey: 'onboarding.tour.triageContent',
    targets: [TOUR_TARGETS.TRIAGE_TAB],
    placement: 'bottom-start',
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
    // Falls back to the category header when every accordion is collapsed.
    targets: [TOUR_TARGETS.EMAIL_ROW, TOUR_TARGETS.CATEGORY_ACCORDION],
    placement: 'bottom',
  },
];

function isRendered(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** The first of the step's anchors that is actually laid out on screen, if any. */
export function findTourTarget(targets: TourTarget[], root: ParentNode = document): HTMLElement | null {
  for (const target of targets) {
    const element = root.querySelector<HTMLElement>(tourTargetSelector(target));
    if (element && isRendered(element)) {
      return element;
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
