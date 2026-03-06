import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

interface ToneRuleItemProps {
  rule: string;
  index: number;
  onRemove: () => void;
  onEdit?: (index: number, newValue: string) => void;
}

export const ToneRuleItem: React.FC<ToneRuleItemProps> = ({ rule, index, onRemove, onEdit }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(rule);
  
  const emailIdMatch = rule.match(/\(email ([a-f0-9-]+)\)/i);
  const emailId = emailIdMatch ? emailIdMatch[1] : null;
  const displayRule = emailId ? rule.replace(/ \(email [a-f0-9-]+\)/i, '') : rule;

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== rule && onEdit) {
      captureEvent('tone_rule_edited');
      onEdit(index, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(rule);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEY_ENTER) {
      handleSaveEdit();
    } else if (e.key === KEY_ESCAPE) {
      handleCancelEdit();
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', padding: theme.spacing.sm, border: `1px solid ${theme.colors.primary.main}`, borderRadius: theme.borderRadius.md }}>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{ flex: 1, padding: theme.spacing.xs, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.sm, fontSize: theme.typography.fontSize.sm, }}
        />
        <button
          onClick={handleSaveEdit}
          disabled={!editValue.trim()}
          style={{ background: theme.colors.primary.main, color: COLOR_NAMED_WHITE, border: STRING_NONE, padding: `${theme.spacing.xs} ${theme.spacing.sm}`, borderRadius: theme.borderRadius.sm, cursor: editValue.trim() ? 'pointer' : 'not-allowed', fontSize: theme.typography.fontSize.sm, }}
        >
          {t('common.save')}
        </button>
        <button
          onClick={handleCancelEdit}
          style={{ background: 'transparent', border: `1px solid ${theme.colors.border.medium}`, padding: `${theme.spacing.xs} ${theme.spacing.sm}`, borderRadius: theme.borderRadius.sm, cursor: 'pointer', fontSize: theme.typography.fontSize.sm, }}
        >
          {t('common.cancel')}
        </button>
      </div>
    );
  }

  return (
    <div key={`${displayRule}-${emailId || index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.sm, border: `1px solid ${theme.colors.border.light}`, borderRadius: theme.borderRadius.md }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, }}>
        {displayRule}
        {emailId && (
          <a 
            href={`/email/${emailId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: theme.spacing.xs, color: theme.colors.primary.main, fontSize: '0.85em', textDecoration: 'none', whiteSpace: 'nowrap', }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            ({t('settings.tone.viewEmail')})
          </a>
        )}
      </span>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {onEdit && (
          <button
            onClick={() => setIsEditing(true)}
            style={{ background: 'transparent', border: STRING_NONE, color: theme.colors.primary.main, cursor: 'pointer', }}
          >
            {t('common.edit')}
          </button>
        )}
        <button
          onClick={() => {
            captureEvent('tone_rule_removed');
            onRemove();
          }}
          style={{ background: 'transparent', border: STRING_NONE, color: theme.colors.accent.error, cursor: 'pointer', }}
        >
          {t('common.remove')}
        </button>
      </div>
    </div>
  );
};


