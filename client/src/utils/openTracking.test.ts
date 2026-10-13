import { OpenTrackingSummary } from 'types/email';

import { OPEN_TRACKING_STATE } from 'constants/openTracking';

import { formatRelativeTime, getOpenTrackingState } from './openTracking';
import { stripTrackingPixels } from './trackingPixel';

const baseSummary: OpenTrackingSummary = {
  sentAt: '2026-10-10T09:00:00.000Z',
  recipientCount: 1,
  openCount: 0,
  firstOpenedAt: null,
  lastOpenedAt: null,
  automaticOpenCount: 0,
  lastAutomaticOpenAt: null,
};

describe('getOpenTrackingState', () => {
  it('is "sent" until anything opens it', () => {
    expect(getOpenTrackingState(baseSummary)).toBe(OPEN_TRACKING_STATE.SENT);
  });

  it('flags messages only opened by Apple Mail Privacy Protection', () => {
    expect(getOpenTrackingState({ ...baseSummary, automaticOpenCount: 2 })).toBe(OPEN_TRACKING_STATE.MAYBE_AUTOMATIC);
  });

  it('prefers reliable opens over automatic ones', () => {
    expect(getOpenTrackingState({ ...baseSummary, openCount: 1, automaticOpenCount: 2 })).toBe(
      OPEN_TRACKING_STATE.OPENED
    );
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-13T12:00:00.000Z');

  it('formats hours ago in the requested locale', () => {
    expect(formatRelativeTime('2026-10-13T10:00:00.000Z', 'en', now)).toMatch(/2 hr\.? ago/);
    expect(formatRelativeTime('2026-10-13T10:00:00.000Z', 'es', now)).toMatch(/hace 2 h/);
  });

  it('collapses sub-minute differences to "now"', () => {
    expect(formatRelativeTime('2026-10-13T11:59:50.000Z', 'en', now)).toMatch(/this minute|now/);
  });
});

describe('stripTrackingPixels', () => {
  it('removes only the open-tracking pixel', () => {
    const html =
      '<p>Hi</p><img src="https://api.bearlymail.com/t/o/AbCdEfGhIjKlMnOpQrStUv.gif" width="1" height="1" />' +
      '<img src="https://cdn.example.com/logo.png">';
    const stripped = stripTrackingPixels(html);
    expect(stripped).not.toContain('/t/o/');
    expect(stripped).toContain('logo.png');
  });
});
