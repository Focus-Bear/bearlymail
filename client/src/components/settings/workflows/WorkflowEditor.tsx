import React, { useState } from 'react';
import { theme } from 'theme/theme';

import { ActionBuilder } from './ActionBuilder';
import { ConditionBuilder } from './ConditionBuilder';
import { MCPServerConfig, WorkflowAction, WorkflowCondition, WorkflowRule, WorkflowRuleFormValues } from './types';

interface WorkflowEditorProps {
  rule: WorkflowRule | null;
  mcpServers: MCPServerConfig[];
  onSave: (values: WorkflowRuleFormValues) => Promise<void>;
  onCancel: () => void;
}

const emptyCondition: WorkflowCondition = {
  fromPatterns: [],
  subjectPatterns: [],
  categories: [],
  priorityLevels: [],
  naturalLanguageCondition: null,
};

/**
 * Modal-style editor for creating and editing workflow rules.
 * Part of feature #1483 — Automated Email Workflows.
 */
export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ rule, mcpServers, onSave, onCancel }) => {
  const [name, setName] = useState(rule?.name ?? '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [condition, setCondition] = useState<WorkflowCondition>(rule?.condition ?? { ...emptyCondition });
  const [actions, setActions] = useState<WorkflowAction[]>(rule?.actions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a name for this workflow.');
      return;
    }
    if (actions.length === 0) {
      setError('Please add at least one action.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), enabled, condition, actions });
    } catch (err) {
      setError((err as Error).message ?? 'Failed to save workflow.');
    } finally {
      setSaving(false);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: theme.colors.overlay.dark,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: theme.colors.background.paper,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: theme.shadows.xl,
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.md,
    background: theme.colors.background.subtle,
    borderRadius: theme.borderRadius.md,
  };

  const sectionTitleStyle: React.CSSProperties = {
    ...theme.typography.body.large,
    fontWeight: 700,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
  };

  const handleOverlayClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    if (evt.target === evt.currentTarget) {
      onCancel();
    }
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={modalStyle}>
        <h2 style={{ ...theme.typography.heading.h2, marginBottom: theme.spacing.lg }}>
          {rule ? 'Edit Workflow' : 'New Workflow'}
        </h2>

        {/* Name */}
        <div style={{ marginBottom: theme.spacing.lg }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={evt => setName(evt.target.value)}
            placeholder="e.g. Upwork billing → Focus Bear task"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: `1px solid ${theme.colors.border.default}`,
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Condition */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>When (condition)</div>
          <ConditionBuilder condition={condition} onChange={setCondition} />
        </div>

        {/* Actions */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Then (actions)</div>
          <ActionBuilder actions={actions} mcpServers={mcpServers} onChange={setActions} />
        </div>

        {/* Enabled toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: theme.spacing.lg }}>
          <input
            id="workflow-enabled"
            type="checkbox"
            checked={enabled}
            onChange={evt => setEnabled(evt.target.checked)}
          />
          <label htmlFor="workflow-enabled" style={{ fontSize: 14, cursor: 'pointer' }}>
            Enable this workflow immediately
          </label>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              background: theme.colors.error.light,
              borderRadius: 6,
              color: theme.colors.error.dark,
              fontSize: 13,
              marginBottom: theme.spacing.md,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: `1px solid ${theme.colors.border.default}`,
              background: theme.colors.background.paper,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              background: saving ? theme.colors.background.disabled : theme.colors.primary.main,
              color: theme.colors.background.paper,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {saving ? 'Saving…' : 'Save Workflow'}
          </button>
        </div>
      </div>
    </div>
  );
};
