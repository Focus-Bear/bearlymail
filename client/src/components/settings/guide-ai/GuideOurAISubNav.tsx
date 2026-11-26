import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { SETTINGS_ANCHORS, settingsAnchorPath } from 'constants/settingsAnchors';

interface GuideOurAISubNavSection {
  anchorId: string;
  /** Reuses each section's own heading key, so the link always matches what it jumps to. */
  labelKey: string;
}

/** The Guide Our AI sections, in page order. */
export const GUIDE_OUR_AI_SUB_NAV_SECTIONS: readonly GuideOurAISubNavSection[] = [
  { anchorId: SETTINGS_ANCHORS.CONTEXT, labelKey: 'settings.contextAboutMeTitle' },
  { anchorId: SETTINGS_ANCHORS.EMAIL_CATEGORIES, labelKey: 'settings.contextSections.emailCategories' },
  { anchorId: SETTINGS_ANCHORS.Q_AND_A, labelKey: 'settings.contextSections.qanda' },
  { anchorId: SETTINGS_ANCHORS.CATEGORY_RULES, labelKey: 'settings.deterministicCategoryRules.sectionTitle' },
  { anchorId: SETTINGS_ANCHORS.CATEGORY_FAMILIES, labelKey: 'settings.categoryFamilies.title' },
  { anchorId: SETTINGS_ANCHORS.PRIORITY_RULES, labelKey: 'settings.priorityRules.sectionTitle' },
  { anchorId: SETTINGS_ANCHORS.TONE_SETTINGS, labelKey: 'settings.howIWrite' },
  { anchorId: SETTINGS_ANCHORS.SUMMARIZATION_RULES, labelKey: 'settings.summarizationRules' },
];

const PROGRAMMATIC_FOCUS_TAB_INDEX = '-1';

/**
 * Moves keyboard focus to the section the link jumped to, so the next Tab
 * continues from there instead of from the sub-nav. The router link doesn't
 * do this the way a native `#hash` link would. useSettingsAnchorScroll does
 * the scrolling, so focusing must not scroll as well.
 */
function focusSection(anchorId: string): void {
  const section = document.getElementById(anchorId);
  if (!section) {
    return;
  }
  if (!section.hasAttribute('tabindex')) {
    section.setAttribute('tabindex', PROGRAMMATIC_FOCUS_TAB_INDEX);
  }
  section.focus({ preventScroll: true });
}

/**
 * Jump links under the Guide Our AI heading. Each is a `/settings#<section>`
 * link, so it reuses the Settings anchor scroll (useSettingsAnchorScroll), and
 * a collapsed section opens itself when linked to (useOpenForLinkedSection).
 * The links wrap onto more rows at phone width rather than scrolling sideways.
 */
export const GuideOurAISubNav: React.FC = () => {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('settings.guideAI.sectionNavLabel')} style={{ marginBottom: theme.spacing.lg }}>
      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {GUIDE_OUR_AI_SUB_NAV_SECTIONS.map(({ anchorId, labelKey }) => (
          <li key={anchorId}>
            <Link
              to={settingsAnchorPath(anchorId)}
              onClick={() => focusSection(anchorId)}
              style={{
                display: 'inline-block',
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.full,
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                textDecoration: 'none',
              }}
            >
              {t(labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
