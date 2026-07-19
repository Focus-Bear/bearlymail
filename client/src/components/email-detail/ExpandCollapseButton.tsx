import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ExpandCollapseButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * A subtle full-width button shown at the bottom of a truncated email body.
 * Clicking it expands or collapses the full forwarded/quoted content.
 */
export const ExpandCollapseButton: React.FC<ExpandCollapseButtonProps> = ({ isExpanded, onToggle }) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        width: '100%',
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        marginTop: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        border: 'none',
        borderTop: `1px solid ${theme.colors.border.light}`,
        borderRadius: `0 0 ${theme.borderRadius.md} ${theme.borderRadius.md}`,
        color: theme.colors.text.tertiary,
        fontSize: theme.typography.fontSize.sm,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      aria-expanded={isExpanded}
      aria-label={isExpanded ? t('emailDetail.hideQuotedContent') : t('emailDetail.showFullMessage')}
    >
      <span style={{ fontSize: '0.65em' }}>{isExpanded ? '▲' : '▼'}</span>
      <span>{isExpanded ? t('emailDetail.hideQuotedContent') : t('emailDetail.showFullMessage')}</span>
    </button>
  );
};
