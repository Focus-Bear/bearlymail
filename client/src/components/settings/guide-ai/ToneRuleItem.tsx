import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

interface ToneRuleItemProps {
  rule: string;
  index: number;
  onRemove: () => void;
  onEdit?: (index: number, newValue: string) => void;
}

interface ToneRuleEditViewProps {
  editValue: string;
  onEditValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const ToneRuleEditView: React.FC<ToneRuleEditViewProps> = ({ editValue, onEditValueChange, onSave, onCancel }) => {
  const { t } = useTranslation();

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ENTER) {
      onSave();
    } else if (event.key === KEY_ESCAPE) {
      onCancel();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: theme.spacing.sm,
        alignItems: 'center',
        padding: theme.spacing.sm,
        border: `1px solid ${theme.colors.primary.main}`,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <input
        type="text"
        value={editValue}
        onChange={event => onEditValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        style={{
          flex: 1,
          padding: theme.spacing.xs,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.sm,
        }}
      />
      <button
        onClick={onSave}
        disabled={!editValue.trim()}
        style={{
          background: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          cursor: editValue.trim() ? 'pointer' : 'not-allowed',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.save')}
      </button>
      <button
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: `1px solid ${theme.colors.border.medium}`,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};

interface ToneRuleDisplayViewProps {
  rule: string;
  index: number;
  displayRule: string;
  emailId: string | null;
  onRemove: () => void;
  onEdit?: (index: number, newValue: string) => void;
  onStartEdit: () => void;
}

const ToneRuleDisplayView: React.FC<ToneRuleDisplayViewProps> = ({
  index,
  displayRule,
  emailId,
  onRemove,
  onEdit,
  onStartEdit,
}) => {
  const { t } = useTranslation();

  return (
    <div
      key={`${displayRule}-${emailId || index}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.sm,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
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
            onClick={event => {
              event.stopPropagation();
            }}
          >
            ({t('settings.tone.viewEmail')})
          </a>
        )}
      </span>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {onEdit && (
          <button
            onClick={onStartEdit}
            style={{
              background: 'transparent',
              border: STRING_NONE,
              color: theme.colors.primary.main,
              cursor: 'pointer',
            }}
          >
            {t('common.edit')}
          </button>
        )}
        <button
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.TONE_RULE_REMOVED);
            onRemove();
          }}
          style={{
            background: 'transparent',
            border: STRING_NONE,
            color: theme.colors.accent.error,
            cursor: 'pointer',
          }}
        >
          {t('common.remove')}
        </button>
      </div>
    </div>
  );
};

export const ToneRuleItem: React.FC<ToneRuleItemProps> = ({ rule, index, onRemove, onEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(rule);

  const emailIdMatch = rule.match(/\(email ([a-f0-9-]+)\)/i);
  const emailId = emailIdMatch ? emailIdMatch[1] : null;
  const displayRule = emailId ? rule.replace(/ \(email [a-f0-9-]+\)/i, '') : rule;

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== rule && onEdit) {
      captureEvent(ANALYTICS_EVENTS.TONE_RULE_EDITED);
      onEdit(index, editValue.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(rule);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <ToneRuleEditView
        editValue={editValue}
        onEditValueChange={setEditValue}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
      />
    );
  }

  return (
    <ToneRuleDisplayView
      rule={rule}
      index={index}
      displayRule={displayRule}
      emailId={emailId}
      onRemove={onRemove}
      onEdit={onEdit}
      onStartEdit={() => setIsEditing(true)}
    />
  );
};
