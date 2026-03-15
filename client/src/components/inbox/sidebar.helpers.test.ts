import { getSettingsNavItems, makeScrollToSection, SettingsSubNavGroup,SIDEBAR_SCROLL_DELAY_MS } from './sidebar.helpers';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const translateMock = (key: string): string => key;

function isGroup(item: unknown): item is SettingsSubNavGroup {
  return Array.isArray((item as { items?: unknown } | null)?.items);
}

// ---------------------------------------------------------------------------
// getSettingsNavItems
// ---------------------------------------------------------------------------

describe('getSettingsNavItems', () => {
  it('returns exactly 4 top-level nav groups', () => {
    const items = getSettingsNavItems(translateMock);
    expect(items).toHaveLength(4);
    expect(items.every(isGroup)).toBe(true);
  });

  it('uses the translate function for group labels', () => {
    const items = getSettingsNavItems(translateMock);
    const groups = items.filter(isGroup);
    expect(groups[0].label).toBe('settings.nav.emailDelivery');
    expect(groups[1].label).toBe('settings.nav.guideOurAI');
    expect(groups[2].label).toBe('settings.nav.schedulingPreferences');
    expect(groups[3].label).toBe('settings.nav.integrations');
  });

  it('uses the translate function for item labels', () => {
    const items = getSettingsNavItems(translateMock);
    const emailDeliveryGroup = items[0] as SettingsSubNavGroup;
    expect(emailDeliveryGroup.items[0].label).toBe('settings.nav.googleAccounts');
  });

  it('returns 3 items in the Email Delivery group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[0] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(3);
  });

  it('returns 5 items in the Guide Our AI group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[1] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(5);
  });

  it('returns 4 items in the Scheduling Preferences group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[2] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(4);
  });

  it('returns 2 items in the Integrations group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[3] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(2);
  });

  it('each item has an id, label, and anchor', () => {
    const items = getSettingsNavItems(translateMock);
    items.filter(isGroup).forEach(group => {
      group.items.forEach(item => {
        expect(item.id).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.anchor).toBeTruthy();
      });
    });
  });

  it('item anchors match item ids', () => {
    const items = getSettingsNavItems(translateMock);
    items.filter(isGroup).forEach(group => {
      group.items.forEach(item => {
        expect(item.anchor).toBe(item.id);
      });
    });
  });

  it('returns different output when translate returns different values', () => {
    const customTranslate = (key: string): string => `TRANSLATED:${key}`;
    const items = getSettingsNavItems(customTranslate);
    const firstGroup = items[0] as SettingsSubNavGroup;
    expect(firstGroup.label).toBe('TRANSLATED:settings.nav.emailDelivery');
  });
});

// ---------------------------------------------------------------------------
// makeScrollToSection
// ---------------------------------------------------------------------------

describe('makeScrollToSection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('calls navigate with the correct /settings# path', () => {
    const navigate = jest.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('email-batching');
    expect(navigate).toHaveBeenCalledWith('/settings#email-batching', { replace: true });
  });

  it('does not navigate a second time after the delay', () => {
    const navigate = jest.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('context');
    jest.runAllTimers();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('calls scrollIntoView on the matched element after the delay', () => {
    const scrollIntoView = jest.fn();
    const element = { scrollIntoView } as unknown as HTMLElement;
    jest.spyOn(document, 'getElementById').mockReturnValue(element);

    const navigate = jest.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('blocked-senders');

    // scrollIntoView not called yet — timeout still pending
    expect(scrollIntoView).not.toHaveBeenCalled();

    jest.advanceTimersByTime(SIDEBAR_SCROLL_DELAY_MS);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('does not throw when the anchor element is not found in the DOM', () => {
    jest.spyOn(document, 'getElementById').mockReturnValue(null);
    const navigate = jest.fn();
    const scrollTo = makeScrollToSection(navigate);
    expect(() => {
      scrollTo('non-existent-anchor');
      jest.runAllTimers();
    }).not.toThrow();
  });

  it('passes the correct anchor to getElementById', () => {
    const getElementByIdSpy = jest.spyOn(document, 'getElementById').mockReturnValue(null);
    const navigate = jest.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('api-key');
    jest.runAllTimers();
    expect(getElementByIdSpy).toHaveBeenCalledWith('api-key');
  });
});
