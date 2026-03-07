import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { BlockedKeywordItem } from 'components/settings/email-delivery/BlockedKeywordItem';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_BLOCK } from 'constants/emojis';
import { INPUT_WIDTH_PX, OPACITY_HALF } from 'constants/numbers';
import { KEY_ENTER, STRING_NONE } from 'constants/strings';

interface BlockedKeyword {
  id: string;
  keyword: string;
  exactMatch: boolean;
  reason?: string;
  blockedAt: string;
}

interface BlockedKeywordsSectionProps {
  blockedKeywords: BlockedKeyword[];
  onUnblockKeyword: (id: string) => Promise<void>;
  onAddKeyword: (keyword: string, exactMatch: boolean, reason?: string) => Promise<void>;
}

export const BlockedKeywordsSection: React.FC<BlockedKeywordsSectionProps> = ({
  blockedKeywords,
  onUnblockKeyword,
  onAddKeyword,
}) => {
  const { t } = useTranslation();
  const [newKeyword, setNewKeyword] = useState('');
  const [exactMatch, setExactMatch] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const itemCount = blockedKeywords.length;

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;

    captureEvent('blocked_keyword_added', { exact_match: exactMatch });
    setIsAdding(true);
    try {
      await onAddKeyword(newKeyword.trim(), exactMatch);
      setNewKeyword('');
      setExactMatch(false);
    } catch (error) {
      console.error('Failed to add blocked keyword:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ENTER && !isAdding) {
      handleAddKeyword();
    }
  };

  return (
    <div id="blocked-keywords" style={{ marginBottom: theme.spacing.lg, border: `1px solid ${theme.colors.border.light}`, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.background.paper, }}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.primary, padding: `${theme.spacing.sm} ${theme.spacing.md}`, display: 'flex', alignItems: 'center', gap: theme.spacing.sm, cursor: 'pointer', backgroundColor: theme.colors.background.paper, borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none', borderRadius: isExpanded ? `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0` : theme.borderRadius.md, transition: theme.transitions.fast, scrollMarginTop: `${INPUT_WIDTH_PX}px`, }}
      >
        <span
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: theme.transitions.fast, fontSize: theme.typography.fontSize.base, color: theme.colors.text.secondary, }}
        >
          ▶
        </span>
        <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>
          {EMOJI_BLOCK} {t('settings.blockedKeywords.title')}
        </span>
        <span
          style={{ backgroundColor: theme.colors.greyscale[300], color: theme.colors.text.secondary, padding: `${theme.spacing.xs} ${theme.spacing.sm}`, borderRadius: theme.borderRadius.full, fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium, }}
        >
          {itemCount}
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: theme.spacing.md }}>
          <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.sm, }}>
            {t('settings.blockedKeywords.description')}
          </p>

          <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.lg, flexWrap: 'wrap', alignItems: 'center', }}>
            <input
              type="text"
              value={newKeyword}
              onChange={(event) => setNewKeyword(event.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={t('settings.blockedKeywords.placeholder')}
              style={{ flex: 1, minWidth: '200px', padding: theme.spacing.sm, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}`, fontSize: theme.typography.fontSize.sm, backgroundColor: theme.colors.background.subtle, color: theme.colors.text.primary, }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, cursor: 'pointer', }}>
              <input
                type="checkbox"
                checked={exactMatch}
                onChange={(event) => setExactMatch(event.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              {t('settings.blockedKeywords.exactMatchLabel')}
            </label>
            <button
              onClick={handleAddKeyword}
              disabled={!newKeyword.trim() || isAdding}
              style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}`, backgroundColor: theme.colors.primary.main, color: COLOR_NAMED_WHITE, border: STRING_NONE, borderRadius: theme.borderRadius.md, cursor: newKeyword.trim() && !isAdding ? 'pointer' : 'not-allowed', fontSize: theme.typography.fontSize.sm, opacity: newKeyword.trim() && !isAdding ? 1 : OPACITY_HALF, }}
            >
              {isAdding ? t('common.saving') : t('settings.blockedKeywords.addKeyword')}
            </button>
          </div>

          {blockedKeywords.length === 0 ? (
            <div style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.text.secondary, border: `2px dashed ${theme.colors.border.light}`, borderRadius: theme.borderRadius.md, }}>
              {t('settings.blockedKeywords.emptyState')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {blockedKeywords.map((keyword) => (
                <BlockedKeywordItem key={keyword.id} keyword={keyword} onUnblock={onUnblockKeyword} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
