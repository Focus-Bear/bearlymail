import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_CHECK, EMOJI_WARNING } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface DisputeResult {
  accepted: boolean;
  rulesToRemove: string[];
  explanation: string;
  rulesUpdated: boolean;
  remainingRules: string[];
}

interface ToneCheckResultProps {
  toneCheckResult: {
    isOk: boolean;
    suggestions: string[];
    revisedText?: string;
  } | null;
  onUseRevisedText: (text: string) => void;
  emailText?: string;
  onDispute?: (emailText: string, suggestions: string[], argument: string) => Promise<DisputeResult | null>;
  disputing?: boolean;
  disputeResult?: DisputeResult | null;
  onScheduleForMorning?: () => void;
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
    captureEvent('tone_check_dispute_submitted');
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
            captureEvent('tone_check_dispute_form_opened');
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

/** Returns true if any suggestion hint relates to timing (late night / weekend send). */
const hasSendTimingSuggestion = (suggestions: string[]): boolean => {
  const timingKeywords = [
    'late',
    'night',
    'weekend',
    'early',
    'morning',
    'timing',
    'hour',
    'after hours',
    'business hours',
    'off hours',
  ];
  return suggestions.some(suggestion => timingKeywords.some(kw => suggestion.toLowerCase().includes(kw)));
};

interface ToneIssuesListProps {
  suggestions: string[];
  revisedText?: string;
  onUseRevisedText: (text: string) => void;
  onScheduleForMorning?: () => void;
}

const ToneIssuesList: React.FC<ToneIssuesListProps> = ({
  suggestions,
  revisedText,
  onUseRevisedText,
  onScheduleForMorning,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <ul style={{ margin: 0, paddingLeft: theme.spacing.lg, color: theme.colors.text.primary }}>
        {suggestions.map(suggestion => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
      {onScheduleForMorning && hasSendTimingSuggestion(suggestions) && (
        <button
          onClick={() => {
            captureEvent('tone_check_schedule_for_morning_clicked');
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
            {revisedText}
          </div>
          <button
            onClick={() => {
              captureEvent('tone_check_revised_text_used');
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
  emailText,
  onDispute,
  disputing = false,
  disputeResult,
  onScheduleForMorning,
}) => {
  const { t } = useTranslation();

  if (!toneCheckResult) {
    return null;
  }

  if (toneCheckResult.isOk) {
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
        onUseRevisedText={onUseRevisedText}
        onScheduleForMorning={onScheduleForMorning}
      />
      {onDispute && emailText && (
        <DisputeSection
          emailText={emailText}
          suggestions={toneCheckResult.suggestions}
          disputing={disputing}
          disputeResult={disputeResult}
          onDispute={onDispute}
        />
      )}
    </div>
  );
};
