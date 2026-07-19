/**
 * AskAiPanel — the "Ask AI" tab in the email action sidebar.
 *
 * Free-form Q&A grounded in the single email/thread the user has open. Posts to
 * the NestJS `/llm/ask-email` endpoint via {@link useAskAi}. The conversation is
 * in-memory only and resets when a different email is opened.
 */
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSearch, FiSend, FiTool, FiZap } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { KEY_ENTER, STRING_NONE } from 'constants/strings';
import { ASK_AI_ROLE_USER, AskAiMessage, AskAiToolActivity, useAskAi } from 'hooks/useAskAi';

const SUGGESTED_PROMPT_KEYS = [
  'inbox.askAi.prompt1',
  'inbox.askAi.prompt2',
  'inbox.askAi.prompt3',
  'inbox.askAi.prompt4',
] as const;

interface AskAiPanelProps {
  /** Id of the email the conversation is grounded in. */
  emailId?: string;
}

const AskAiHeader: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, color: theme.colors.text.primary }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          borderRadius: theme.borderRadius.full,
          backgroundColor: theme.colors.primary.subtle,
          color: theme.colors.primary.main,
          flexShrink: 0,
        }}
      >
        <FiZap size={15} />
      </span>
      <span style={{ fontSize: theme.typography.fontSize.lg, fontWeight: theme.typography.fontWeight.semibold }}>
        {t('inbox.askAi.title')}
      </span>
    </div>
  );
};

/** Built-in email-search tool name (mirrors the server's SEARCH_EMAILS_TOOL). */
const SEARCH_EMAILS_TOOL = 'search_emails';

const ToolActivityChips: React.FC<{ activity: NonNullable<AskAiMessage['toolActivity']> }> = ({ activity }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.xs }}>
    {activity.map((item, index) => (
      <span
        key={`${item.tool}-${index}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: `2px ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.full,
          backgroundColor: theme.colors.primary.subtle,
          color: theme.colors.primary.main,
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {item.tool === SEARCH_EMAILS_TOOL ? <FiSearch size={11} /> : <FiTool size={11} />}
        {item.label}
      </span>
    ))}
  </div>
);

const MessageBubble: React.FC<{ message: AskAiMessage }> = ({ message }) => {
  const isUser = message.role === ASK_AI_ROLE_USER;
  const hasActivity = !isUser && Boolean(message.toolActivity?.length);
  return (
    <div style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      {hasActivity && <ToolActivityChips activity={message.toolActivity!} />}
      <div
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          borderRadius: theme.borderRadius.lg,
          backgroundColor: isUser ? theme.colors.primary.main : theme.colors.background.subtle,
          color: isUser ? theme.colors.text.inverse : theme.colors.text.primary,
          border: isUser ? STRING_NONE : `1px solid ${theme.colors.border.light}`,
          fontSize: theme.typography.fontSize.sm,
          lineHeight: theme.typography.lineHeight.normal,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
    </div>
  );
};

interface AskAiConversationProps {
  messages: AskAiMessage[];
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string | null;
  liveActivity: AskAiToolActivity[];
  onSuggested: (prompt: string) => void;
}

const AskAiConversation: React.FC<AskAiConversationProps> = ({
  messages,
  isLoading,
  hasError,
  errorMessage,
  liveActivity,
  onSuggested,
}) => {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading, hasError]);

  const isEmpty = messages.length === 0;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <AskAiHeader />
      {isEmpty ? (
        <>
          <p
            style={{
              margin: 0,
              fontSize: theme.typography.fontSize.md,
              color: theme.colors.text.tertiary,
              lineHeight: theme.typography.lineHeight.normal,
            }}
          >
            {t('inbox.askAi.subtitle')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <span
              style={{
                fontSize: theme.typography.fontSize.xs,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.tertiary,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('inbox.askAi.suggestedHeading')}
            </span>
            {SUGGESTED_PROMPT_KEYS.map(key => (
              <button
                key={key}
                type="button"
                onClick={() => onSuggested(t(key))}
                style={{
                  textAlign: 'left',
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: theme.colors.background.subtle,
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                  cursor: 'pointer',
                }}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <Link
            to="/settings#workflows"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.primary.main,
              textDecoration: 'none',
            }}
          >
            <FiTool size={12} />
            {t('inbox.askAi.connectTools')}
          </Link>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {messages.map((message, index) => (
            <MessageBubble key={`${message.role}-${index}`} message={message} />
          ))}
          {isLoading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
              {liveActivity.length > 0 && <ToolActivityChips activity={liveActivity} />}
              <span
                style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.tertiary,
                  fontStyle: 'italic',
                }}
              >
                {t('inbox.askAi.thinking')}
              </span>
            </div>
          )}
          {hasError && (
            <span style={{ alignSelf: 'flex-start', fontSize: theme.typography.fontSize.sm, color: theme.colors.error.main }}>
              {errorMessage ?? t('inbox.askAi.error')}
            </span>
          )}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
};

interface AskAiInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}

const AskAiInput: React.FC<AskAiInputProps> = ({ value, onChange, onSubmit, disabled }) => {
  const { t } = useTranslation();
  const canSend = value.trim().length > 0 && !disabled;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === KEY_ENTER && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSubmit();
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
          backgroundColor: theme.colors.background.paper,
        }}
      >
        <input
          type="text"
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={t('inbox.askAi.inputPlaceholder')}
          aria-label={t('inbox.askAi.inputPlaceholder')}
          style={{
            flex: 1,
            minWidth: 0,
            border: STRING_NONE,
            backgroundColor: COLOR_TRANSPARENT,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.primary,
            outline: STRING_NONE,
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label={t('inbox.askAi.send')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: theme.borderRadius.md,
            border: STRING_NONE,
            backgroundColor: canSend ? theme.colors.primary.main : theme.colors.primary.subtle,
            color: canSend ? theme.colors.text.inverse : theme.colors.primary.main,
            cursor: canSend ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          <FiSend size={15} />
        </button>
      </div>
      <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, textAlign: 'center' }}>
        {t('inbox.askAi.disclaimer')}
      </span>
    </div>
  );
};

export const AskAiPanel: React.FC<AskAiPanelProps> = ({ emailId }) => {
  const { messages, input, setInput, isLoading, hasError, errorMessage, liveActivity, send } = useAskAi(emailId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: theme.spacing.md }}>
      <AskAiConversation
        messages={messages}
        isLoading={isLoading}
        hasError={hasError}
        errorMessage={errorMessage}
        liveActivity={liveActivity}
        onSuggested={prompt => send(prompt)}
      />
      <AskAiInput
        value={input}
        onChange={setInput}
        onSubmit={() => send(input)}
        disabled={isLoading || !emailId}
      />
    </div>
  );
};
