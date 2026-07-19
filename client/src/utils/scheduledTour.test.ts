import { dismissScheduledTour, markScheduledEmailSent, shouldShowScheduledTour } from './scheduledTour';

describe('scheduledTour', () => {
  beforeEach(() => localStorage.clear());

  it('does not show until a scheduled email is sent', () => {
    expect(shouldShowScheduledTour()).toBe(false);
  });

  it('shows after a scheduled email is sent', () => {
    markScheduledEmailSent();
    expect(shouldShowScheduledTour()).toBe(true);
  });

  it('does not show again once dismissed', () => {
    markScheduledEmailSent();
    dismissScheduledTour();
    expect(shouldShowScheduledTour()).toBe(false);
  });

  it('stays dismissed even if another scheduled email is later sent', () => {
    markScheduledEmailSent();
    dismissScheduledTour();
    markScheduledEmailSent();
    expect(shouldShowScheduledTour()).toBe(false);
  });
});
