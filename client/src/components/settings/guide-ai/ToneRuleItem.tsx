import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ToneRuleItemProps {
  rule: string;
  index: number;
  onRemove: () => void;
}

export const ToneRuleItem: React.FC<ToneRuleItemProps> = ({ rule, index, onRemove }) => {
  const { t } = useTranslation();
  const emailIdMatch = rule.match(/\(email ([a-f0-9-]+)\)/i);
  const emailId = emailIdMatch ? emailIdMatch[1] : null;
  const displayRule = emailId ? rule.replace(/ \(email [a-f0-9-]+\)/i, '') : rule;

  return (
    <div key={`${displayRule}-${emailId || index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.sm, border: `1px solid ${theme.colors.border.light}`, borderRadius: theme.borderRadius.md }}>
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
        minWidth: 0,
      }}>
        {displayRule}
        {emailId && (
          <a 
            href={`/email/${emailId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ 
              marginLeft: theme.spacing.xs, 
              color: theme.colors.primary.main,
              fontSize: '0.85em',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            ({t('settings.tone.viewEmail')})
          </a>
        )}
      </span>
      <button
        onClick={onRemove}
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.colors.accent.error,
          cursor: 'pointer',
        }}
      >
        {t('common.remove')}
      </button>
    </div>
  );
};


