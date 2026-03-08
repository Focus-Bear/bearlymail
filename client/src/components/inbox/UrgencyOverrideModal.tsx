import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ModalBackdrop, ModalContent, ModalFooter, ModalHeader } from 'components/modal';
import { UrgencyScoreInput } from 'components/priority/override/UrgencyScoreInput';
import { API_URL } from 'config/api';
import { MAX_PERCENTAGE, MAX_URGENCY_SCORE } from 'constants/numbers';

interface UrgencyOverrideModalProps {
  threadId: string;
  currentUrgencyScore: number;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const UrgencyOverrideModal: React.FC<UrgencyOverrideModalProps> = ({
  threadId,
  currentUrgencyScore,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const [urgencyScore, setUrgencyScore] = useState(currentUrgencyScore);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      alert(t('priority.override.pleaseProvideReason'));
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/priority/${threadId}/override-urgency`, {
        urgencyScore: Math.max(0, Math.min(MAX_PERCENTAGE, urgencyScore)),
        reason: reason.trim(),
      });

      if (onSubmitted) {
        onSubmitted();
      }
      onClose();
    } catch (error) {
      console.error('Error submitting urgency override:', error);
      alert(t('priority.override.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <ModalContent>
        <ModalHeader title={t('priority.override.title')} />

        <p
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.md,
            lineHeight: theme.typography.lineHeight.relaxed,
          }}
        >
          {t('priority.override.currentScore', { score: currentUrgencyScore.toFixed(0), max: MAX_PERCENTAGE })}
          {currentUrgencyScore >= MAX_URGENCY_SCORE && (
            <span style={{ color: theme.colors.accent.error, fontWeight: 'bold' }}>
              {' '}
              {t('priority.override.critical')}
            </span>
          )}
        </p>

        <UrgencyScoreInput urgencyScore={urgencyScore} onScoreChange={setUrgencyScore} />

        <div style={{ marginBottom: theme.spacing.md }}>
          <label
            style={{
              display: 'block',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.xs,
            }}
          >
            {t('priority.override.reasonLabel')}:
          </label>
          <textarea
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder={t('priority.override.reasonPlaceholder')}
            style={{
              width: '100%',
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontFamily: theme.typography.fontFamily,
              resize: 'vertical',
              minHeight: '100px',
            }}
          />
        </div>

        <ModalFooter onCancel={onClose} onSubmit={handleSubmit} isSubmitting={submitting} canSubmit={!!reason.trim()} />
      </ModalContent>
    </ModalBackdrop>
  );
};
