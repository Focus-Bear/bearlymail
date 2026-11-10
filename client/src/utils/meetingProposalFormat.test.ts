import type { TFunction } from 'i18next';

import {
  buildAcceptanceDraft,
  buildAlternativesDraft,
  describeProposedSlot,
  formatInZone,
  formatSlotForReply,
  zoneLabel,
} from './meetingProposalFormat';

/** Echoes the key and its interpolation values so assertions can see what was asked for. */
const translate = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key.split('.').pop()}(${Object.values(values).join('|')})` : key.split('.').pop()) as unknown as TFunction;

const PERTH = 'Australia/Perth';
const MELBOURNE = 'Australia/Melbourne';
/** 11:30 in Perth on Tue 10 Nov 2026 = 14:30 in Melbourne (AEDT). */
const PROPOSED = '2026-11-10T03:30:00.000Z';
const LOCALE = 'en-AU';

describe('formatInZone', () => {
  it('formats in an IANA zone', () => {
    expect(formatInZone(PROPOSED, PERTH, LOCALE, { hour: 'numeric', minute: '2-digit', hour12: false })).toBe('11:30');
  });

  it('applies a fixed UTC offset from an abbreviation such as AEST', () => {
    expect(formatInZone(PROPOSED, 'UTC+10', LOCALE, { hour: 'numeric', minute: '2-digit', hour12: false })).toBe('13:30');
    expect(formatInZone(PROPOSED, 'UTC+5:30', LOCALE, { hour: 'numeric', minute: '2-digit', hour12: false })).toBe('09:00');
    expect(formatInZone(PROPOSED, 'UTC-5', LOCALE, { hour: 'numeric', minute: '2-digit', hour12: false })).toBe('22:30');
  });
});

describe('zoneLabel', () => {
  it.each([
    [PERTH, 'Perth'],
    ['America/New_York', 'New York'],
    ['UTC+10', 'UTC+10'],
    ['UTC', 'UTC'],
  ])('labels %s as %s', (zone, label) => {
    expect(zoneLabel(zone)).toBe(label);
  });
});

describe('describeProposedSlot', () => {
  it("shows 11:30 Perth as 2:30 in the user's Melbourne time", () => {
    const slot = describeProposedSlot(PROPOSED, PERTH, MELBOURNE, LOCALE);

    expect(slot.senderTime).toMatch(/^11:30\s?am$/i);
    expect(slot.senderZone).toBe('Perth');
    expect(slot.localTime).toMatch(/^2:30\s?pm$/i);
    expect(slot.localDate).toMatch(/Tue.*10.*Nov/);
    expect(slot.isSameWallClock).toBe(false);
  });

  it('collapses to one time when the sender shares the user zone', () => {
    expect(describeProposedSlot(PROPOSED, MELBOURNE, MELBOURNE, LOCALE).isSameWallClock).toBe(true);
  });

  it('uses the user zone when the sender zone is unknown', () => {
    const slot = describeProposedSlot(PROPOSED, null, MELBOURNE, LOCALE);

    expect(slot.senderZone).toBeNull();
    expect(slot.isSameWallClock).toBe(true);
  });
});

describe('reply drafts', () => {
  it("writes reply slots in the sender's zone so they read their own time", () => {
    const text = formatSlotForReply(translate, PROPOSED, PERTH, MELBOURNE, LOCALE);

    expect(text).toMatch(/^slotInZone\(Tue.*10 Nov\|11:30\s?am\|Perth\)$/i);
  });

  it('builds an acceptance draft greeting the sender by first name', () => {
    const draft = buildAcceptanceDraft(translate, 'Example Access Team', 'SLOT');

    expect(draft).toBe('draftGreetingNamed(Example)\n\ndraftAcceptBody(SLOT)\n\ndraftSignOff');
  });

  it('drops markup characters from the greeting name', () => {
    expect(buildAcceptanceDraft(translate, '<b>Sam</b>', 'SLOT')).toMatch(/^draftGreetingNamed\(bSam\/b\)/);
  });

  it('builds an alternatives draft listing each free slot', () => {
    const draft = buildAlternativesDraft(translate, null, 'PROPOSED', ['FIRST', 'SECOND']);

    expect(draft).toBe('draftGreeting\n\ndraftAlternativesIntro(PROPOSED)\n\n- FIRST\n- SECOND\n\ndraftSignOff');
  });
});
