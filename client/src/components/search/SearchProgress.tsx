import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MAX_TEXTAREA_HEIGHT_PX } from 'constants/numbers';

const SLOW_SEARCH_FEEDBACK_DELAY_MS = 2000;

interface SearchProgressProps {
  progressStep: string;
}

export const SearchProgress: React.FC<SearchProgressProps> = ({ progressStep }) => {
  const { t } = useTranslation();
  const [showSlowFeedback, setShowSlowFeedback] = useState(false);

  // Show "still searching…" secondary message after 2s to reassure users
  useEffect(() => {
    setShowSlowFeedback(false);
    const timer = setTimeout(() => {
      setShowSlowFeedback(true);
    }, SLOW_SEARCH_FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [progressStep]);

  const getEmoji = () => {
    if (progressStep.includes('Crafting')) {
      return '✏️';
    }
    if (progressStep.includes('Searching for emails')) {
      return '🔍';
    }
    if (progressStep.includes('Filtering')) {
      return '🤖';
    }
    if (progressStep.includes('Generating explanations')) {
      return '💡';
    }
    return '🔍';
  };

  return (
    <div
      style={{
        textAlign: 'center',
        padding: theme.spacing['3xl'],
        color: theme.colors.text.secondary,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize['2xl'],
          marginBottom: theme.spacing.md,
        }}
      >
        {getEmoji()}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.medium,
          marginBottom: theme.spacing.sm,
          color: theme.colors.text.primary,
        }}
      >
        {progressStep || t('search.searching')}
      </div>
      {showSlowFeedback && (
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.sm,
            fontStyle: 'italic',
          }}
        >
          {t('search.stillSearching', 'Still searching…')}
        </div>
      )}
      <div
        style={{
          width: `${MAX_TEXTAREA_HEIGHT_PX}px`,
          height: '4px',
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.full,
          margin: '0 auto',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: theme.colors.primary.main,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
