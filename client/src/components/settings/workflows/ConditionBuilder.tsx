import React, { useState } from 'react';
import { theme } from 'theme/theme';

import { WorkflowCondition } from './types';

interface ConditionBuilderProps {
  condition: WorkflowCondition;
  onChange: (condition: WorkflowCondition) => void;
}

/**
 * Builds the "When" condition part of a workflow rule.
 * Supports from/subject patterns and optional natural-language condition.
 */
export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({ condition, onChange }) => {
  const [fromInput, setFromInput] = useState('');
  const [subjectInput, setSubjectInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(condition.naturalLanguageCondition));

  const addPattern = (field: 'fromPatterns' | 'subjectPatterns', value: string, clearInput: () => void) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    onChange({ ...condition, [field]: [...(condition[field] ?? []), trimmed] });
    clearInput();
  };

  const removePattern = (field: 'fromPatterns' | 'subjectPatterns', index: number) => {
    const updated = [...(condition[field] ?? [])];
    updated.splice(index, 1);
    onChange({ ...condition, [field]: updated });
  };

  const labelStyle: React.CSSProperties = {
    ...theme.typography.body.small,
    fontWeight: 600,
    color: theme.colors.text.primary,
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {/* From patterns */}
      <div>
        <label style={labelStyle}>From (sender patterns)</label>
        <p style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, marginBottom: 4 }}>
          Glob (*@upwork.com), regex (/billing/i), or plain text. Empty = match any sender.
        </p>
        <PatternTagInput
          patterns={condition.fromPatterns}
          inputValue={fromInput}
          onInputChange={setFromInput}
          onAdd={inputVal => addPattern('fromPatterns', inputVal, () => setFromInput(''))}
          onRemove={idx => removePattern('fromPatterns', idx)}
          placeholder="*@upwork.com"
        />
      </div>

      {/* Subject patterns */}
      <div>
        <label style={labelStyle}>Subject patterns</label>
        <p style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, marginBottom: 4 }}>
          Glob, regex, or plain text substring. Empty = match any subject.
        </p>
        <PatternTagInput
          patterns={condition.subjectPatterns}
          inputValue={subjectInput}
          onInputChange={setSubjectInput}
          onAdd={inputVal => addPattern('subjectPatterns', inputVal, () => setSubjectInput(''))}
          onRemove={idx => removePattern('subjectPatterns', idx)}
          placeholder="billing summary"
        />
      </div>

      {/* Advanced: natural language condition */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.colors.primary.main,
            fontSize: 13,
            padding: 0,
          }}
        >
          {showAdvanced ? '▲ Hide advanced' : '▼ Advanced (AI condition)'}
        </button>
        {showAdvanced && (
          <div style={{ marginTop: theme.spacing.sm }}>
            <label style={labelStyle}>Natural-language condition (optional)</label>
            <p style={{ ...theme.typography.body.small, color: theme.colors.text.secondary, marginBottom: 4 }}>
              Evaluated by AI after pattern matching. E.g. "billing summary with line items from a freelancer platform".
            </p>
            <textarea
              value={condition.naturalLanguageCondition ?? ''}
              onChange={evt => onChange({ ...condition, naturalLanguageCondition: evt.target.value || null })}
              placeholder="Describe when this workflow should trigger…"
              style={{
                width: '100%',
                minHeight: 80,
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${theme.colors.border.default}`,
                fontSize: 13,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

interface PatternTagInputProps {
  patterns: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}

const PatternTagInput: React.FC<PatternTagInputProps> = ({
  patterns,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  placeholder,
}) => (
  <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
      {patterns.map((pattern, idx) => (
        <span
          key={idx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: theme.colors.background.subtle,
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
          }}
        >
          <code style={{ fontSize: 12 }}>{pattern}</code>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        type="text"
        value={inputValue}
        onChange={evt => onInputChange(evt.target.value)}
        onKeyDown={evt => {
          if (evt.key === 'Enter' || evt.key === ',') {
            evt.preventDefault();
            onAdd(inputValue);
          }
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '6px 10px',
          borderRadius: 6,
          border: `1px solid ${theme.colors.border.default}`,
          fontSize: 13,
        }}
      />
      <button
        type="button"
        onClick={() => onAdd(inputValue)}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: `1px solid ${theme.colors.border.default}`,
          background: theme.colors.background.paper,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        Add
      </button>
    </div>
  </div>
);
