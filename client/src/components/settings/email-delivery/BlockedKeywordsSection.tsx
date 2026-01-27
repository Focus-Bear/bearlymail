import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { BlockedKeywordItem } from 'components/settings/email-delivery/BlockedKeywordItem';
import { EMOJI_BLOCK } from 'constants/emojis';
import { captureEvent } from 'utils/posthog';

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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isAdding) {
      handleAddKeyword();
    }
  };
  
  return (
    <div id="blocked-keywords" style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
      boxShadow: theme.shadows.md,
    }}>
      <h3 style={{
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.xl,
        scrollMarginTop: `${INPUT_WIDTH_PX}px`,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {EMOJI_BLOCK} {t('settings.blockedKeywords.title')}
      </h3>
      <p style={{
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
      }}>
        {t('settings.blockedKeywords.description')}
      </p>

      <div style={{
        display: 'flex',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.lg,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <input
          type="text"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t('settings.blockedKeywords.placeholder')}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.light}`,
            fontSize: theme.typography.fontSize.sm,
            backgroundColor: theme.colors.background.subtle,
            color: theme.colors.text.primary,
          }}
        />
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={exactMatch}
            onChange={(e) => setExactMatch(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          {t('settings.blockedKeywords.exactMatchLabel')}
        </label>
        <button
          onClick={handleAddKeyword}
          disabled={!newKeyword.trim() || isAdding}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.accent.primary,
            color: theme.colors.text.inverse,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: newKeyword.trim() && !isAdding ? 'pointer' : 'not-allowed',
            fontSize: theme.typography.fontSize.sm,
            opacity: newKeyword.trim() && !isAdding ? 1 : 0.5,
          }}
        >
          {isAdding ? t('common.saving') : t('settings.blockedKeywords.addKeyword')}
        </button>
      </div>
      
      {blockedKeywords.length === 0 ? (
        <div style={{
          padding: theme.spacing.xl,
          textAlign: 'center',
          color: theme.colors.text.secondary,
          border: `2px dashed ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
        }}>
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
  );
};
