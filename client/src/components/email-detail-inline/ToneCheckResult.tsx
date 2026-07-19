import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { SanitizedHTML } from 'components/common/SanitizedHTML';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_CHECK, EMOJI_WARNING } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

import { hasSendTimingSuggestion } from './toneCheckResult.helpers';

interface DisputeResult {
  accepted: boolean;
  rulesToRemove: string[];
  explanation: string;
  rulesUpdated: boolean;
  remainingRules: string[];
}

interface AutoSendCountdownBannerProps {
  countdown: number;
  onSendNow: () => void;
  onCancel: () => void;
}

const AutoSendCountdownBanner: React.FC<AutoSendCountdownBannerProps> = ({ countdown, onSendNow, onCancel }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.primary.light,
        border: `1px solid ${theme.colors.primary.main}`,
        borderRadius: theme.borderRadius.sm,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <span style={{ flex: 1, color: theme.colors.primary.dark }}>
        {t('emailDetail.autoSendingIn', { seconds: countdown })}
      </span>
      <button
        onClick={onSendNow}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('emailDetail.sendNow')}
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
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

interface ToneCheckResultProps {
  toneCheckResult: {
    isOk: boolean;
    suggestions: string[];
    revisedText?: string;
    inappropriateTiming?: string | null;
  } | null;
  onUseRevisedText: (text: string) => void;
  /** Called when the user dismisses the tone check and wants to keep their original draft. */
  onDismiss?: () => void;
  emailText?: string;
  onDispute?: (emailText: string, suggestions: string[], argument: string) => Promise<DisputeResult | null>;
  disputing?: boolean;
  disputeResult?: DisputeResult | null;
  onScheduleForMorning?: () => void;
  /** Countdown in seconds before auto-send fires; null means not active */
  autoSendCountdown?: number | null;
  onCancelAutoSend?: () => void;
  onSendNow?: () => void;
}

interface DisputeResultDisplayProps {
  disputeResult: DisputeResult;
}

const DisputeResultDisplay: React.FC<DisputeResultDisplayProps> = ({ disputeResult }) => {
  const { t } = useTranslation();
  const bgColor = disputeResult.accepted ? theme.colors.sunray.light4 : theme.colors.background.default;
  const borderColor = disputeResult.accepted ? theme.colors.accent.success : theme.colors.border.medium;
  const titleColor = disputeResult.accepted ? theme.colors.accent.success : theme.colors.text.primary;

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <div style={{ fontWeight: 'bold', color: titleColor, marginBottom: theme.spacing.xs }}>
        {disputeResult.accepted ? t('emailDetail.disputeAccepted') : t('emailDetail.disputeRejected')}
      </div>
      <div style={{ color: theme.colors.text.secondary }}>{disputeResult.explanation}</div>
      {disputeResult.accepted && disputeResult.rulesToRemove.length > 0 && (
        <div style={{ marginTop: theme.spacing.sm }}>
          <div style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.xs }}>
            {t('emailDetail.rulesRemoved', { count: disputeResult.rulesToRemove.length })}
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: theme.spacing.lg,
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {disputeResult.rulesToRemove.map(rule => (
              <li key={rule} style={{ marginBottom: theme.spacing.xs }}>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

interface DisputeFormProps {
  disputing: boolean;
  isSubmitDisabled: boolean;
  disputeArgument: string;
  onArgumentChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const DisputeForm: React.FC<DisputeFormProps> = ({
  disputing,
  isSubmitDisabled,
  disputeArgument,
  onArgumentChange,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ marginTop: theme.spacing.sm }}>
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('emailDetail.disputeExplanation')}
      </div>
      <textarea
        value={disputeArgument}
        onChange={event => onArgumentChange(event.target.value)}
        placeholder={t('emailDetail.disputePlaceholder')}
        style={{
          width: '100%',
          minHeight: '80px',
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.sm,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        <button
          onClick={onSubmit}
          disabled={isSubmitDisabled}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.secondary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            opacity: isSubmitDisabled ? OPACITY_DISABLED : 1,
          }}
        >
          {disputing ? t('emailDetail.disputeSubmitting') : t('emailDetail.disputeSubmit')}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

interface DisputeSectionProps {
  emailText: string;
  suggestions: string[];
  disputing: boolean;
  disputeResult?: DisputeResult | null;
  onDispute: (emailText: string, suggestions: string[], argument: string) => Promise<DisputeResult | null>;
}

const DisputeSection: React.FC<DisputeSectionProps> = ({
  emailText,
  suggestions,
  disputing,
  disputeResult,
  onDispute,
}) => {
  const { t } = useTranslation();
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeArgument, setDisputeArgument] = useState('');

  const handleDisputeSubmit = async () => {
    if (!disputeArgument.trim()) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.TONE_CHECK_DISPUTE_SUBMITTED);
    await onDispute(emailText, suggestions, disputeArgument);
    setDisputeArgument('');
    setShowDisputeForm(false);
  };

  const isSubmitDisabled = !disputeArgument.trim() || disputing;

  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        borderTop: `1px solid ${theme.colors.border.light}`,
        paddingTop: theme.spacing.md,
      }}
    >
      {disputeResult && <DisputeResultDisplay disputeResult={disputeResult} />}

      {!showDisputeForm && !disputeResult?.accepted && (
        <button
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.TONE_CHECK_DISPUTE_FORM_OPENED);
            setShowDisputeForm(true);
          }}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('emailDetail.disputeToneCheck')}
        </button>
      )}

      {showDisputeForm && (
        <DisputeForm
          disputing={disputing}
          isSubmitDisabled={isSubmitDisabled}
          disputeArgument={disputeArgument}
          onArgumentChange={setDisputeArgument}
          onSubmit={handleDisputeSubmit}
          onCancel={() => {
            setShowDisputeForm(false);
            setDisputeArgument('');
          }}
        />
      )}
    </div>
  );
};

interface ToneIssuesListProps {
  suggestions: string[];
  revisedText?: string;
  inappropriateTiming?: string | null;
  onUseRevisedText: (text: string) => void;
  onScheduleForMorning?: () => void;
}

const ToneIssuesList: React.FC<ToneIssuesListProps> = ({
  suggestions,
  revisedText,
  inappropriateTiming,
  onUseRevisedText,
  onScheduleForMorning,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {inappropriateTiming && (
        <div
          style={{
            marginBottom: theme.spacing.sm,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.background.default,
            border: `1px solid ${theme.colors.accent.warning ?? theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          🕐 <strong>{t('emailDetail.inappropriateTiming', 'Timing note:')}</strong> {inappropriateTiming}
        </div>
      )}
      <ul style={{ margin: 0, paddingLeft: theme.spacing.lg, color: theme.colors.text.primary }}>
        {suggestions.map(suggestion => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
      {onScheduleForMorning && hasSendTimingSuggestion(suggestions, inappropriateTiming) && (
        <button
          onClick={() => {
            captureEvent(ANALYTICS_EVENTS.TONE_CHECK_SCHEDULE_FOR_MORNING_CLICKED);
            onScheduleForMorning();
          }}
          style={{
            marginTop: theme.spacing.sm,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.primary.light,
            color: theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          🌅 {t('emailDetail.scheduleForMorning')}
        </button>
      )}
      {revisedText && (
        <div style={{ marginTop: theme.spacing.md }}>
          <div style={{ fontWeight: 'bold', fontSize: theme.typography.fontSize.sm }}>
            {t('emailDetail.suggestedRevision')}
          </div>
          <div
            style={{
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.background.default,
              borderRadius: theme.borderRadius.sm,
              marginTop: theme.spacing.xs,
              whiteSpace: 'pre-wrap',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            <SanitizedHTML html={revisedText} />
          </div>
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.TONE_CHECK_REVISED_TEXT_USED);
              onUseRevisedText(revisedText);
            }}
            style={{
              marginTop: theme.spacing.sm,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('emailDetail.useRevisedText')}
          </button>
        </div>
      )}
    </>
  );
};

export const ToneCheckResult: React.FC<ToneCheckResultProps> = ({
  toneCheckResult,
  onUseRevisedText,
  onDismiss,
  emailText,
  onDispute,
  disputing = false,
  disputeResult,
  onScheduleForMorning,
  autoSendCountdown = null,
  onCancelAutoSend,
  onSendNow,
}) => {
  const { t } = useTranslation();

  if (!toneCheckResult) {
    return null;
  }

  if (toneCheckResult.isOk) {
    // Even when tone is OK, show a timing warning if the scheduled time is inappropriate
    if (toneCheckResult.inappropriateTiming) {
      return (
        <div
          style={{
            marginTop: theme.spacing.md,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.sunray.light4,
            border: `1px solid ${theme.colors.accent.warning ?? theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
            <span>{EMOJI_CHECK}</span>
            <span style={{ color: theme.colors.accent.success }}>{t('emailDetail.toneCheckPassed')}</span>
          </div>
          <div style={{ color: theme.colors.text.secondary }}>
            🕐 <strong>{t('emailDetail.inappropriateTiming', 'Timing note:')}</strong>{' '}
            {toneCheckResult.inappropriateTiming}
          </div>
          {onScheduleForMorning && (
            <button
              onClick={() => {
                captureEvent(ANALYTICS_EVENTS.TONE_CHECK_SCHEDULE_FOR_MORNING_CLICKED);
                onScheduleForMorning();
              }}
              style={{
                marginTop: theme.spacing.sm,
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: theme.colors.primary.light,
                color: theme.colors.primary.main,
                border: `1px solid ${theme.colors.primary.main}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              🌅 {t('emailDetail.scheduleForMorning')}
            </button>
          )}
        </div>
      );
    }

    return (
      <div
        style={{
          marginTop: theme.spacing.md,
          padding: theme.spacing.sm,
          backgroundColor: theme.colors.sunray.light4,
          border: `1px solid ${theme.colors.accent.success}`,
          borderRadius: theme.borderRadius.md,
          color: theme.colors.accent.success,
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <span>{EMOJI_CHECK}</span> {t('emailDetail.toneCheckPassed')}
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.sunray.light4,
        border: `1px solid ${theme.colors.accent.error}`,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div style={{ color: theme.colors.accent.error, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
        {EMOJI_WARNING} {t('emailDetail.toneCheckIssues')}
      </div>
      <ToneIssuesList
        suggestions={toneCheckResult.suggestions}
        revisedText={toneCheckResult.revisedText}
        inappropriateTiming={toneCheckResult.inappropriateTiming}
        onUseRevisedText={onUseRevisedText}
        onScheduleForMorning={onScheduleForMorning}
      />
      {onDismiss && (
        <div style={{ marginTop: theme.spacing.sm }}>
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.TONE_CHECK_DISMISSED);
              onDismiss();
            }}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('emailDetail.keepOriginal')}
          </button>
        </div>
      )}
      {onDispute && emailText && (
        <DisputeSection
          emailText={emailText}
          suggestions={toneCheckResult.suggestions}
          disputing={disputing}
          disputeResult={disputeResult}
          onDispute={onDispute}
        />
      )}
      {autoSendCountdown !== null && onCancelAutoSend && onSendNow && (
        <AutoSendCountdownBanner countdown={autoSendCountdown} onSendNow={onSendNow} onCancel={onCancelAutoSend} />
      )}
    </div>
  );
};
