/**
 * Approval card shown in the Ask AI conversation when the assistant wants to
 * use a connected tool that is not read-only (e.g. share a file, send a
 * message). Shows which tool, which connected server, and the exact arguments
 * that will run, with Approve / Deny. Nothing runs until the user approves.
 */
import React, { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheck, FiX } from 'react-icons/fi';
import { theme } from 'theme/theme';

import type { AskAiPendingToolCall } from 'hooks/useAskAi';

interface AskAiToolApprovalCardProps {
  pendingToolCall: AskAiPendingToolCall;
  onDecide: (approved: boolean) => void;
  /** Disables both buttons while a decision is being sent. */
  disabled?: boolean;
}

const JSON_INDENT = 2;
const ARGUMENTS_MAX_HEIGHT_PX = 220;

const buttonBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  flex: 1,
  minHeight: '36px',
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
};

export const AskAiToolApprovalCard: React.FC<AskAiToolApprovalCardProps> = ({
  pendingToolCall,
  onDecide,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const argumentsId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const hasArguments = Object.keys(pendingToolCall.arguments).length > 0;
  const toolLabel = pendingToolCall.toolTitle
    ? `${pendingToolCall.toolTitle} (${pendingToolCall.toolName})`
    : pendingToolCall.toolName;

  // Move focus to the new card so keyboard and screen-reader users notice it.
  useEffect(() => {
    cardRef.current?.focus();
  }, [pendingToolCall.approvalId]);

  return (
    <div
      ref={cardRef}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid="ask-ai-tool-approval"
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.warning.main}`,
        backgroundColor: theme.colors.background.paper,
        color: theme.colors.text.primary,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <FiAlertTriangle size={16} aria-hidden="true" style={{ color: theme.colors.warning.main, flexShrink: 0 }} />
        <h3
          id={titleId}
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.md,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {t('inbox.askAi.approval.title')}
        </h3>
      </div>
      <p style={{ margin: 0, fontSize: theme.typography.fontSize.sm, lineHeight: theme.typography.lineHeight.normal }}>
        {t('inbox.askAi.approval.description', { tool: toolLabel, server: pendingToolCall.serverName })}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, minWidth: 0 }}>
        <span
          id={argumentsId}
          style={{
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.secondary,
          }}
        >
          {t('inbox.askAi.approval.argumentsLabel')}
        </span>
        {hasArguments ? (
          <pre
            aria-labelledby={argumentsId}
            tabIndex={0}
            data-testid="ask-ai-tool-approval-arguments"
            style={{
              margin: 0,
              padding: theme.spacing.sm,
              maxHeight: `${ARGUMENTS_MAX_HEIGHT_PX}px`,
              overflow: 'auto',
              borderRadius: theme.borderRadius.md,
              backgroundColor: theme.colors.background.subtle,
              border: `1px solid ${theme.colors.border.light}`,
              fontSize: theme.typography.fontSize.xs,
              lineHeight: theme.typography.lineHeight.normal,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(pendingToolCall.arguments, null, JSON_INDENT)}
          </pre>
        ) : (
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('inbox.askAi.approval.noArguments')}
          </span>
        )}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          lineHeight: theme.typography.lineHeight.normal,
        }}
      >
        {t('inbox.askAi.approval.warning')}
      </p>
      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onDecide(false)}
          disabled={disabled}
          style={{
            ...buttonBase,
            backgroundColor: theme.colors.background.paper,
            color: theme.colors.text.primary,
            border: `1px solid ${theme.colors.border.medium}`,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <FiX size={14} aria-hidden="true" />
          {t('inbox.askAi.approval.deny')}
        </button>
        <button
          type="button"
          onClick={() => onDecide(true)}
          disabled={disabled}
          style={{
            ...buttonBase,
            backgroundColor: theme.colors.primary.main,
            color: theme.colors.text.inverse,
            border: `1px solid ${theme.colors.primary.main}`,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <FiCheck size={14} aria-hidden="true" />
          {t('inbox.askAi.approval.approve')}
        </button>
      </div>
    </div>
  );
};
