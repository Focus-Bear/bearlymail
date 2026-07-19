import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import {
  MCPServerConfig,
  WorkflowAction,
  WorkflowActionArchive,
  WorkflowActionMCPTool,
  WorkflowActionReply,
  WorkflowActionWebhook,
} from './types';

interface ActionBuilderProps {
  actions: WorkflowAction[];
  mcpServers: MCPServerConfig[];
  onChange: (actions: WorkflowAction[]) => void;
}

const ACTION_TYPE = { MCP_TOOL: 'mcp_tool', REPLY: 'reply', WEBHOOK: 'webhook', ARCHIVE: 'archive' } as const;

type ActionType = (typeof ACTION_TYPE)[keyof typeof ACTION_TYPE];

/**
 * These labels document the `{{variable}}` / `{{ai:…}}` template syntax, so the
 * double-brace text must render literally. Overriding the interpolation
 * delimiters to `[[ ]]` stops i18next from treating `{{ }}` as interpolation.
 */
const LITERAL_BRACE_INTERPOLATION = { interpolation: { prefix: '[[', suffix: ']]' } } as const;

const getActionTypeLabels = (translate: TFunction): Record<ActionType, string> => ({
  mcp_tool: translate('settings.workflows.action.typeMcpTool'),
  reply: translate('settings.workflows.action.typeReply'),
  webhook: translate('settings.workflows.action.typeWebhook'),
  archive: translate('settings.workflows.action.typeArchive'),
});

/**
 * Builds the "Then" action list for a workflow rule.
 * Supports MCP tool calls, auto-replies, and webhooks.
 */
export const ActionBuilder: React.FC<ActionBuilderProps> = ({ actions, mcpServers, onChange }) => {
  const { t } = useTranslation();
  const actionTypeLabels = getActionTypeLabels(t);
  const [adding, setAdding] = useState<ActionType | null>(null);

  const addAction = (type: ActionType) => {
    let newAction: WorkflowAction;
    if (type === ACTION_TYPE.MCP_TOOL) {
      newAction = { type: 'mcp_tool', serverId: '', toolName: '', parameters: {}, label: '' } as WorkflowActionMCPTool;
    } else if (type === ACTION_TYPE.REPLY) {
      newAction = { type: 'reply', templateBody: '', label: '' } as WorkflowActionReply;
    } else if (type === ACTION_TYPE.ARCHIVE) {
      newAction = { type: 'archive', label: '' } as WorkflowActionArchive;
    } else {
      newAction = { type: 'webhook', url: '', method: 'POST', bodyTemplate: '{}', label: '' } as WorkflowActionWebhook;
    }
    onChange([...actions, newAction]);
    setAdding(null);
  };

  const removeAction = (index: number) => {
    const updated = [...actions];
    updated.splice(index, 1);
    onChange(updated);
  };

  const updateAction = (index: number, updated: WorkflowAction) => {
    const newActions = [...actions];
    newActions[index] = updated;
    onChange(newActions);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {actions.map((action, idx) => (
        <ActionForm
          key={idx}
          index={idx}
          action={action}
          mcpServers={mcpServers}
          onUpdate={updated => updateAction(idx, updated)}
          onRemove={() => removeAction(idx)}
        />
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: theme.spacing.xs }}>
          {(Object.keys(actionTypeLabels) as ActionType[]).map(type => (
            <button key={type} type="button" onClick={() => addAction(type)} style={addButtonStyle}>
              {actionTypeLabels[type]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAdding(null)}
            style={{ ...addButtonStyle, color: theme.colors.text.secondary }}
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding('mcp_tool')} style={addButtonStyle}>
          {t('settings.workflows.action.addAction')}
        </button>
      )}
    </div>
  );
};

interface ActionFormProps {
  index: number;
  action: WorkflowAction;
  mcpServers: MCPServerConfig[];
  onUpdate: (action: WorkflowAction) => void;
  onRemove: () => void;
}

const ActionForm: React.FC<ActionFormProps> = ({ index, action, mcpServers, onUpdate, onRemove }) => {
  const { t } = useTranslation();
  const actionTypeLabels = getActionTypeLabels(t);
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: theme.colors.text.secondary,
    marginBottom: 2,
    display: 'block',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${theme.colors.border.default}`,
    fontSize: 13,
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        padding: theme.spacing.md,
        background: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.default}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.sm,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {t('settings.workflows.action.actionHeading', {
            number: index + 1,
            label: actionTypeLabels[action.type as keyof typeof actionTypeLabels] ?? action.type,
          })}
        </span>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.colors.error.main,
            fontSize: 13,
          }}
        >
          {t('common.remove')}
        </button>
      </div>

      {action.type === ACTION_TYPE.MCP_TOOL && (
        <MCPToolActionForm
          action={action as WorkflowActionMCPTool}
          mcpServers={mcpServers}
          onChange={onUpdate}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
        />
      )}

      {action.type === ACTION_TYPE.REPLY && (
        <ReplyActionForm
          action={action as WorkflowActionReply}
          onChange={onUpdate}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
        />
      )}

      {action.type === ACTION_TYPE.WEBHOOK && (
        <WebhookActionForm
          action={action as WorkflowActionWebhook}
          onChange={onUpdate}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
        />
      )}

      {action.type === ACTION_TYPE.ARCHIVE && (
        <p style={{ margin: 0, fontSize: 13, color: theme.colors.text.secondary }}>
          {t('settings.workflows.action.archiveDescription')}
        </p>
      )}
    </div>
  );
};

const MCPToolActionForm: React.FC<{
  action: WorkflowActionMCPTool;
  mcpServers: MCPServerConfig[];
  onChange: (act: WorkflowAction) => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}> = ({ action, mcpServers, onChange, inputStyle, labelStyle }) => {
  const { t } = useTranslation();
  const selectedServer = mcpServers.find(server => server.id === action.serverId);
  const tools = selectedServer?.cachedTools ?? [];

  const updateParam = (key: string, value: string) => {
    onChange({ ...action, parameters: { ...action.parameters, [key]: value } });
  };

  const addParamRow = () => {
    onChange({ ...action, parameters: { ...action.parameters, '': '' } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <label style={labelStyle}>{t('settings.workflows.action.mcpServer')}</label>
        <select
          value={action.serverId}
          onChange={evt => onChange({ ...action, serverId: evt.target.value, toolName: '' })}
          style={inputStyle}
        >
          <option value="">{t('settings.workflows.action.selectServer')}</option>
          {mcpServers.map(server => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </select>
      </div>

      {action.serverId && (
        <div>
          <label style={labelStyle}>{t('settings.workflows.action.tool')}</label>
          <select
            value={action.toolName}
            onChange={evt => onChange({ ...action, toolName: evt.target.value })}
            style={inputStyle}
          >
            <option value="">{t('settings.workflows.action.selectTool')}</option>
            {tools.map(tool => (
              <option key={tool.name} value={tool.name}>
                {t('settings.workflows.action.toolOption', { name: tool.name, description: tool.description })}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={labelStyle}>{t('settings.workflows.action.parametersLabel', LITERAL_BRACE_INTERPOLATION)}</label>
        {Object.entries(action.parameters).map(([key, value], paramIdx) => (
          <div key={paramIdx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              value={key}
              onChange={evt => {
                const newParams = Object.fromEntries(
                  Object.entries(action.parameters).map(([paramKey, paramVal], idx) => [
                    idx === paramIdx ? evt.target.value : paramKey,
                    paramVal,
                  ])
                );
                onChange({ ...action, parameters: newParams });
              }}
              placeholder="parameter name"
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ lineHeight: '32px' }}>:</span>
            <input
              type="text"
              value={value}
              onChange={evt => updateParam(key, evt.target.value)}
              placeholder="{{subject}} or {{ai:instruction}}"
              style={{ ...inputStyle, flex: 2 }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addParamRow}
          style={{
            fontSize: 12,
            color: theme.colors.primary.main,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {t('settings.workflows.action.addParameter')}
        </button>
      </div>
    </div>
  );
};

const ReplyActionForm: React.FC<{
  action: WorkflowActionReply;
  onChange: (act: WorkflowAction) => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}> = ({ action, onChange, inputStyle, labelStyle }) => {
  const { t } = useTranslation();
  return (
    <div>
      <label style={labelStyle}>
        {t('settings.workflows.action.replyTemplateLabel', LITERAL_BRACE_INTERPOLATION)}
      </label>
      <textarea
        value={action.templateBody}
        onChange={evt => onChange({ ...action, templateBody: evt.target.value })}
        placeholder={'Hi {{fromName}},\n\n{{ai:Write a brief acknowledgement of this email.}}'}
        style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
      />
    </div>
  );
};

const WebhookActionForm: React.FC<{
  action: WorkflowActionWebhook;
  onChange: (act: WorkflowAction) => void;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
}> = ({ action, onChange, inputStyle, labelStyle }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <label style={labelStyle}>{t('settings.workflows.action.url')}</label>
        <input
          type="url"
          value={action.url}
          onChange={evt => onChange({ ...action, url: evt.target.value })}
          placeholder="https://..."
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>{t('settings.workflows.action.method')}</label>
        <select
          value={action.method}
          onChange={evt => onChange({ ...action, method: evt.target.value as 'POST' | 'PUT' })}
          style={inputStyle}
        >
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>
          {t('settings.workflows.action.bodyTemplateLabel', LITERAL_BRACE_INTERPOLATION)}
        </label>
        <textarea
          value={action.bodyTemplate}
          onChange={evt => onChange({ ...action, bodyTemplate: evt.target.value })}
          placeholder={'{"subject": "{{subject}}", "summary": "{{summary}}"}'}
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
        />
      </div>
    </div>
  );
};

const addButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 6,
  border: `1px solid ${theme.colors.border.default}`,
  background: theme.colors.background.paper,
  cursor: 'pointer',
  fontSize: 13,
  color: theme.colors.text.primary,
};
