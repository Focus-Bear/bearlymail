import {
  getSettingsNavItems,
  makeScrollToSection,
  SettingsSubNavGroup,
  SIDEBAR_SCROLL_DELAY_MS,
} from './sidebar.helpers';

const translateMock = (key: string): string => key;

function isGroup(item: unknown): item is SettingsSubNavGroup {
  return Array.isArray((item as { items?: unknown } | null)?.items);
}

describe('getSettingsNavItems', () => {
  it('returns exactly 7 top-level nav groups', () => {
    const items = getSettingsNavItems(translateMock);
    expect(items).toHaveLength(7);
    expect(items.every(isGroup)).toBe(true);
  });

  it('uses the translate function for group labels', () => {
    const items = getSettingsNavItems(translateMock);
    const groups = items.filter(isGroup);
    expect(groups[0].label).toBe('settings.nav.accountSecurity');
    expect(groups[1].label).toBe('settings.nav.emailDelivery');
    expect(groups[2].label).toBe('settings.nav.guideOurAI');
    expect(groups[3].label).toBe('settings.nav.schedulingPreferences');
    expect(groups[4].label).toBe('settings.nav.integrationsApps');
    expect(groups[5].label).toBe('settings.nav.teamPlan');
    expect(groups[6].label).toBe('settings.nav.dataAccount');
  });

  it('uses the translate function for item labels', () => {
    const items = getSettingsNavItems(translateMock);
    const emailDeliveryGroup = items[1] as SettingsSubNavGroup;
    expect(emailDeliveryGroup.items[0].label).toBe('settings.nav.googleAccounts');
  });

  it('omits the MFA item for non-admin users', () => {
    const items = getSettingsNavItems(translateMock);
    const accountGroup = items[0] as SettingsSubNavGroup;
    expect(accountGroup.items.map(item => item.id)).toEqual(['set-password']);
  });

  it('includes the MFA item for admin users', () => {
    const items = getSettingsNavItems(translateMock, { isAdmin: true });
    const accountGroup = items[0] as SettingsSubNavGroup;
    expect(accountGroup.items.map(item => item.id)).toEqual(['set-password', 'mfa']);
  });

  it('returns 4 items in the Email Delivery group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[1] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(4);
  });

  it('returns 5 items in the Guide Our AI group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[2] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(5);
  });

  it('returns 6 items in the Scheduling group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[3] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(6);
  });

  it('returns 5 items in the Integrations & Apps group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[4] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(5);
  });

  it('returns 3 items in the Team & Plan group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[5] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(3);
  });

  it('returns 3 items in the Data & Account group', () => {
    const items = getSettingsNavItems(translateMock);
    const group = items[6] as SettingsSubNavGroup;
    expect(group.items).toHaveLength(3);
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
    expect(firstGroup.label).toBe('TRANSLATED:settings.nav.accountSecurity');
  });
});

describe('makeScrollToSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls navigate with the correct /settings# path', () => {
    const navigate = vi.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('email-batching');
    expect(navigate).toHaveBeenCalledWith('/settings#email-batching', { replace: true });
  });

  it('does not navigate a second time after the delay', () => {
    const navigate = vi.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('context');
    vi.runAllTimers();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('calls scrollIntoView on the matched element after the delay', () => {
    const scrollIntoView = vi.fn();
    const element = { scrollIntoView } as unknown as HTMLElement;
    vi.spyOn(document, 'getElementById').mockReturnValue(element);

    const navigate = vi.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('blocked-senders');

    // scrollIntoView not called yet — timeout still pending
    expect(scrollIntoView).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SIDEBAR_SCROLL_DELAY_MS);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('does not throw when the anchor element is not found in the DOM', () => {
    vi.spyOn(document, 'getElementById').mockReturnValue(null);
    const navigate = vi.fn();
    const scrollTo = makeScrollToSection(navigate);
    expect(() => {
      scrollTo('non-existent-anchor');
      vi.runAllTimers();
    }).not.toThrow();
  });

  it('passes the correct anchor to getElementById', () => {
    const getElementByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue(null);
    const navigate = vi.fn();
    const scrollTo = makeScrollToSection(navigate);
    scrollTo('api-key');
    vi.runAllTimers();
    expect(getElementByIdSpy).toHaveBeenCalledWith('api-key');
  });
});
