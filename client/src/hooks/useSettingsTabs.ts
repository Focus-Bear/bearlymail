import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { DEFAULT_SETTINGS_TAB, findSettingsTabOf, type SettingsTabId } from 'components/settings/settings-tabs';
import { ANCHOR_FIND_TIMEOUT_MS, ANCHOR_POLL_MS } from 'hooks/useSettingsAnchorScroll';

/**
 * Which Settings tab is showing. A `/settings#<section>` link (sidebar item or
 * deep link from elsewhere) opens the tab holding that section; sections that
 * load their own data appear late, so it keeps looking for a few seconds, like
 * the anchor scroll does. Clicking a tab only changes local state.
 */
export function useSettingsTabs(isReady: boolean): {
  activeTab: SettingsTabId;
  setActiveTab: (tab: SettingsTabId) => void;
} {
  const { hash, key } = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB);

  useEffect(() => {
    const anchorId = decodeURIComponent(hash.replace(/^#/, ''));
    if (!isReady || !anchorId) {
      return undefined;
    }
    const startedAt = Date.now();
    let timer: number | undefined;
    const openTabOfAnchor = () => {
      const tab = findSettingsTabOf(document.getElementById(anchorId));
      if (tab) {
        setActiveTab(tab);
      } else if (Date.now() - startedAt < ANCHOR_FIND_TIMEOUT_MS) {
        timer = window.setTimeout(openTabOfAnchor, ANCHOR_POLL_MS);
      }
    };
    openTabOfAnchor();
    return () => window.clearTimeout(timer);
  }, [isReady, hash, key]);

  return { activeTab, setActiveTab };
}
