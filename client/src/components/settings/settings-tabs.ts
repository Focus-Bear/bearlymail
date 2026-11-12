/**
 * The Settings page is split into these tabs (#442), in this order. Email
 * comes first because connecting and managing mailboxes is what people come
 * to Settings for most; account and security come last.
 */
export const SETTINGS_TAB = {
  EMAIL: 'email',
  AI: 'ai',
  SCHEDULING: 'scheduling',
  INTEGRATIONS: 'integrations',
  TEAM: 'team',
  ACCOUNT: 'account',
} as const;

export type SettingsTabId = (typeof SETTINGS_TAB)[keyof typeof SETTINGS_TAB];

export interface SettingsTab {
  id: SettingsTabId;
  labelKey: string;
}

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: SETTINGS_TAB.EMAIL, labelKey: 'settings.nav.emailDelivery' },
  { id: SETTINGS_TAB.AI, labelKey: 'settings.nav.guideOurAI' },
  { id: SETTINGS_TAB.SCHEDULING, labelKey: 'settings.nav.schedulingPreferences' },
  { id: SETTINGS_TAB.INTEGRATIONS, labelKey: 'settings.nav.integrationsApps' },
  { id: SETTINGS_TAB.TEAM, labelKey: 'settings.nav.teamPlan' },
  { id: SETTINGS_TAB.ACCOUNT, labelKey: 'settings.tabs.account' },
];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = SETTINGS_TAB.EMAIL;

/** Data attribute on each tab panel, naming its tab. */
export const SETTINGS_TAB_DATA_ATTRIBUTE = 'data-settings-tab';

const TAB_IDS: readonly string[] = SETTINGS_TABS.map(tab => tab.id);

/**
 * The tab whose panel contains `element` (e.g. the section a `/settings#anchor`
 * link points at), or null when it isn't inside one. Every panel stays mounted,
 * so this works for sections in hidden tabs too, and no list of anchors has to
 * be kept in sync with where each section lives.
 */
export function findSettingsTabOf(element: Element | null): SettingsTabId | null {
  const tabId = element?.closest(`[${SETTINGS_TAB_DATA_ATTRIBUTE}]`)?.getAttribute(SETTINGS_TAB_DATA_ATTRIBUTE);
  return tabId && TAB_IDS.includes(tabId) ? (tabId as SettingsTabId) : null;
}

export const settingsTabDomId = (tabId: SettingsTabId): string => `settings-tab-${tabId}`;
export const settingsPanelDomId = (tabId: SettingsTabId): string => `settings-panel-${tabId}`;
