import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import {
  SETTINGS_TAB_DATA_ATTRIBUTE,
  SETTINGS_TABS,
  settingsPanelDomId,
  settingsTabDomId,
  type SettingsTabId,
} from './settings-tabs';

const KEY_STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

interface SettingsTabBarProps {
  activeTab: SettingsTabId;
  onSelect: (tab: SettingsTabId) => void;
}

/**
 * The row of Settings tabs. Follows the WAI-ARIA tabs pattern: arrow keys,
 * Home and End move between tabs, and only the active tab is in the Tab order.
 * Scrolls sideways on narrow screens instead of wrapping.
 */
export const SettingsTabBar: React.FC<SettingsTabBarProps> = ({ activeTab, onSelect }) => {
  const { t } = useTranslation();
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Partial<Record<SettingsTabId, HTMLButtonElement | null>>>({});

  // On a phone the row scrolls sideways: bring a tab opened by a link into view.
  // Only the row scrolls, so this never fights the page scrolling to the section.
  useEffect(() => {
    const tabList = tabListRef.current;
    const tab = tabRefs.current[activeTab];
    if (tabList && tab) {
      tabList.scrollLeft = tab.offsetLeft - tabList.offsetLeft;
    }
  }, [activeTab]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = KEY_STEPS[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = SETTINGS_TABS[step(index, SETTINGS_TABS.length)];
    onSelect(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div ref={tabListRef} role="tablist" aria-label={t('settings.tabs.label')} style={tabListStyle}>
      {SETTINGS_TABS.map((tab, index) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={element => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={settingsTabDomId(tab.id)}
            aria-selected={isActive}
            aria-controls={settingsPanelDomId(tab.id)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={event => handleKeyDown(event, index)}
            style={tabStyle(isActive)}
          >
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
};

interface SettingsTabPanelProps {
  tabId: SettingsTabId;
  activeTab: SettingsTabId;
  children: React.ReactNode;
}

/**
 * One tab's sections. Inactive panels stay mounted but hidden, so unsaved edits
 * and loaded data survive switching tabs, and links can still find a section
 * in a hidden tab (findSettingsTabOf).
 */
export const SettingsTabPanel: React.FC<SettingsTabPanelProps> = ({ tabId, activeTab, children }) => (
  <div
    role="tabpanel"
    id={settingsPanelDomId(tabId)}
    aria-labelledby={settingsTabDomId(tabId)}
    hidden={tabId !== activeTab}
    {...{ [SETTINGS_TAB_DATA_ATTRIBUTE]: tabId }}
  >
    {children}
  </div>
);

const tabListStyle: React.CSSProperties = {
  display: 'flex',
  gap: theme.spacing.xs,
  overflowX: 'auto',
  // The cut-off last tab already shows the row scrolls; a scrollbar here drew a grey bar under the tabs.
  scrollbarWidth: 'none',
  borderBottom: `1px solid ${theme.colors.border.light}`,
  marginBottom: theme.spacing.xl,
};

const tabStyle = (isActive: boolean): React.CSSProperties => ({
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  border: STRING_NONE,
  borderBottom: `2px solid ${isActive ? theme.colors.primary.main : COLOR_TRANSPARENT}`,
  backgroundColor: COLOR_TRANSPARENT,
  color: isActive ? theme.colors.text.primary : theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.base,
  fontWeight: isActive ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  flexShrink: 0,
});
