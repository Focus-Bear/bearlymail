/**
 * The "Your emails" step used to cram prioritising, archiving and blocking into
 * one card (founder feedback: "needs to be more granular"). Each now has its own
 * step pointing at the control it explains, falling back to the email card and
 * then a centred card when that control isn't on screen.
 */
import { findTourTarget, INBOX_TOUR_STEPS, toJoyrideStep, TOUR_PLACEMENT_CENTER, TourStep } from 'components/inbox/overlays/tourSteps';
import { TOUR_TARGETS, TourTarget } from 'constants/tour';

const VISIBLE_RECT = { x: 0, y: 0, top: 0, left: 0, width: 100, height: 30, right: 100, bottom: 30 };
const HIDDEN_RECT = { ...VISIBLE_RECT, width: 0, height: 0 };

function mountTarget(target: TourTarget, rect: Partial<DOMRect> = VISIBLE_RECT): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('data-tour', target);
  element.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

function stepFor(titleKey: string): TourStep {
  const definition = INBOX_TOUR_STEPS.find(step => step.titleKey === titleKey);
  if (!definition) {
    throw new Error(`No tour step ${titleKey}`);
  }
  return { title: definition.titleKey, content: definition.contentKey, targets: definition.targets, placement: definition.placement };
}

const PRIORITISE_STEP = 'onboarding.tour.prioritiseTitle';
const ARCHIVE_STEP = 'onboarding.tour.archiveTitle';
const BLOCK_STEP = 'onboarding.tour.blockTitle';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('inbox tour — email card steps', () => {
  it('explains the card, then prioritising, archiving and blocking as separate steps, in that order', () => {
    expect(INBOX_TOUR_STEPS.map(step => step.titleKey).slice(-4)).toEqual([
      'onboarding.tour.assistantTitle',
      PRIORITISE_STEP,
      ARCHIVE_STEP,
      BLOCK_STEP,
    ]);
  });

  it.each([
    [PRIORITISE_STEP, TOUR_TARGETS.EMAIL_PRIORITY],
    [ARCHIVE_STEP, TOUR_TARGETS.EMAIL_ARCHIVE],
    [BLOCK_STEP, TOUR_TARGETS.EMAIL_MORE_ACTIONS],
  ])('%s points at its control on the email card', (titleKey, control) => {
    mountTarget(TOUR_TARGETS.EMAIL_ROW);
    const element = mountTarget(control);

    expect(toJoyrideStep(stepFor(titleKey)).target).toBe(element);
  });

  it.each([PRIORITISE_STEP, ARCHIVE_STEP, BLOCK_STEP])(
    '%s falls back to the email card when its control is not on screen',
    titleKey => {
      const row = mountTarget(TOUR_TARGETS.EMAIL_ROW);

      expect(toJoyrideStep(stepFor(titleKey)).target).toBe(row);
    }
  );

  it.each([PRIORITISE_STEP, ARCHIVE_STEP, BLOCK_STEP])('%s becomes a centred card when there are no emails', titleKey => {
    expect(toJoyrideStep(stepFor(titleKey)).placement).toBe(TOUR_PLACEMENT_CENTER);
  });
});

describe('findTourTarget', () => {
  it('skips a copy of a repeated anchor that is not laid out (e.g. in a collapsed category)', () => {
    mountTarget(TOUR_TARGETS.EMAIL_ARCHIVE, HIDDEN_RECT);
    const visible = mountTarget(TOUR_TARGETS.EMAIL_ARCHIVE);

    expect(findTourTarget([TOUR_TARGETS.EMAIL_ARCHIVE])).toBe(visible);
  });
});
