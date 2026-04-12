import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_HALF } from 'constants/numbers';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

interface AutoResponderExclusionSettingsProps {
  customExclusionRules: string[];
  onChange: (rules: string[]) => void;
}

interface ExclusionRuleRowProps {
  rule: string;
  index: number;
  editingIndex: number | null;
  editValue: string;
  onEdit: (i: number) => void;
  onDelete: (i: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onEditValueChange: (v: string) => void;
  t: (tKey: string) => string;
}

const ExclusionRuleRow: React.FC<ExclusionRuleRowProps> = ({
  rule,
  index,
  editingIndex,
  editValue,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onEditValueChange,
  t,
}) => (
  <div
    key={rule}
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.sm,
      border: `1px solid ${theme.colors.border.light}`,
    }}
  >
    {editingIndex === index ? (
      <div style={{ display: 'flex', flex: 1, gap: theme.spacing.sm }}>
        <input
          type="text"
          value={editValue}
          onChange={event => onEditValueChange(event.target.value)}
          style={{
            flex: 1,
            padding: theme.spacing.xs,
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${theme.colors.border.medium}`,
          }}
          onKeyDown={event => {
            if (event.key === KEY_ENTER) {
              onSave();
            }
            if (event.key === KEY_ESCAPE) {
              onCancel();
            }
          }}
          autoFocus
        />
        <button
          onClick={onSave}
          style={{ cursor: 'pointer', color: theme.colors.primary.main, border: STRING_NONE, background: STRING_NONE }}
        >
          {t('common.save')}
        </button>
        <button
          onClick={onCancel}
          style={{
            cursor: 'pointer',
            color: theme.colors.text.secondary,
            border: STRING_NONE,
            background: STRING_NONE,
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    ) : (
      <>
        <span style={{ ...theme.typography.body.large, color: theme.colors.text.primary }}>{rule}</span>
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button
            onClick={() => onEdit(index)}
            style={{
              cursor: 'pointer',
              color: theme.colors.primary.main,
              border: STRING_NONE,
              background: STRING_NONE,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.edit')}
          </button>
          <button
            onClick={() => onDelete(index)}
            style={{
              cursor: 'pointer',
              color: theme.colors.accent.error,
              border: STRING_NONE,
              background: STRING_NONE,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      </>
    )}
  </div>
);

interface AddExclusionFormProps {
  newRule: string;
  isAdding: boolean;
  onRuleChange: (v: string) => void;
  onAdd: () => void;
  onStartAdding: () => void;
  onCancelAdding: () => void;
  t: (tKey: string) => string;
}

const AddExclusionForm: React.FC<AddExclusionFormProps> = ({
  newRule,
  isAdding,
  onRuleChange,
  onAdd,
  onStartAdding,
  onCancelAdding,
  t,
}) => {
  if (!isAdding) {
    return (
      <button
        onClick={onStartAdding}
        style={{
          alignSelf: 'flex-start',
          marginTop: theme.spacing.xs,
          background: 'transparent',
          border: `1px dashed ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          color: theme.colors.text.secondary,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        <span>+</span> {t('settings.autoResponder.exclusion.addRule')}
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
      <input
        type="text"
        value={newRule}
        onChange={event => onRuleChange(event.target.value)}
        placeholder="e.g., Automated emails, Newsletters, Cold outreach..."
        autoFocus
        style={{
          flex: 1,
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.primary.main}`,
        }}
        onKeyDown={event => {
          if (event.key === KEY_ENTER) {
            onAdd();
          }
          if (event.key === KEY_ESCAPE) {
            onCancelAdding();
          }
        }}
      />
      <button
        onClick={onAdd}
        disabled={!newRule.trim()}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: newRule.trim() ? 'pointer' : 'not-allowed',
          opacity: newRule.trim() ? 1 : OPACITY_HALF,
        }}
      >
        {t('common.add')}
      </button>
      <button
        onClick={onCancelAdding}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: STRING_NONE,
          cursor: 'pointer',
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};

function useExclusionRulesState(customExclusionRules: string[], onChange: (rules: string[]) => void) {
  const [isAdding, setIsAdding] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAddRule = () => {
    if (newRule.trim()) {
      onChange([...customExclusionRules, newRule.trim()]);
      setNewRule('');
      setIsAdding(false);
    }
  };

  const handleDeleteRule = (index: number) => {
    onChange(customExclusionRules.filter((_, i) => i !== index));
  };

  const handleEditRule = (index: number) => {
    setEditingIndex(index);
    setEditValue(customExclusionRules[index]);
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null && editValue.trim()) {
      const updatedRules = [...customExclusionRules];
      updatedRules[editingIndex] = editValue.trim();
      onChange(updatedRules);
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  return {
    isAdding,
    setIsAdding,
    newRule,
    setNewRule,
    editingIndex,
    editValue,
    setEditValue,
    handleAddRule,
    handleDeleteRule,
    handleEditRule,
    handleSaveEdit,
    handleCancelEdit,
  };
}

export const AutoResponderExclusionSettings: React.FC<AutoResponderExclusionSettingsProps> = ({
  customExclusionRules,
  onChange,
}) => {
  const { t } = useTranslation();
  const {
    isAdding,
    setIsAdding,
    newRule,
    setNewRule,
    editingIndex,
    editValue,
    setEditValue,
    handleAddRule,
    handleDeleteRule,
    handleEditRule,
    handleSaveEdit,
    handleCancelEdit,
  } = useExclusionRulesState(customExclusionRules, onChange);

  return (
    <div
      style={{
        marginTop: theme.spacing.lg,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
      }}
    >
      <h3
        style={{
          ...theme.typography.heading.h6,
          color: theme.colors.text.primary,
          marginTop: 0,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('settings.autoResponder.exclusion.title')}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {customExclusionRules.length > 0 ? (
          customExclusionRules.map((rule, index) => (
            <ExclusionRuleRow
              key={rule}
              rule={rule}
              index={index}
              editingIndex={editingIndex}
              editValue={editValue}
              onEdit={handleEditRule}
              onDelete={handleDeleteRule}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
              onEditValueChange={setEditValue}
              t={t}
            />
          ))
        ) : (
          <div
            style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm, fontStyle: 'italic' }}
          >
            {t('settings.autoResponder.exclusion.noRules')}
          </div>
        )}
        <AddExclusionForm
          newRule={newRule}
          isAdding={isAdding}
          onRuleChange={setNewRule}
          onAdd={handleAddRule}
          onStartAdding={() => setIsAdding(true)}
          onCancelAdding={() => {
            setIsAdding(false);
            setNewRule('');
          }}
          t={t}
        />
      </div>

      <p
        style={{
          ...theme.typography.body.medium,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.md,
          marginBottom: 0,
          fontStyle: 'italic',
        }}
      >
        {t('settings.autoResponder.exclusion.aiInterpretNote')}
      </p>
    </div>
  );
};
