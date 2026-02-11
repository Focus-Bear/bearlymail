import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { PRIORITY_MEDIUM_THRESHOLD } from 'constants/numbers';
import { ModalBackdrop, ModalContent, ModalHeader, ModalFooter } from 'components/modal';
import { ReasonTypeSelector } from 'components/priority/override/ReasonTypeSelector';
import { OverrideReasonType } from 'components/priority/types';

import { API_URL } from 'config/api';

interface PriorityOverrideModalProps {
  emailId: string;
  originalPriorityScore: number;
  newPriorityScore: number;
  onClose: () => void;
  onSubmitted?: () => void;
  context?: 'archive' | 'star' | 'manual'; // Context for why we're asking
}

export const PriorityOverrideModal: React.FC<PriorityOverrideModalProps> = ({
  emailId,
  originalPriorityScore,
  newPriorityScore,
  onClose,
  onSubmitted,
  context = 'manual',
}) => {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState<OverrideReasonType | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isHighPriority = originalPriorityScore > PRIORITY_MEDIUM_THRESHOLD;
  const priorityLabel = isHighPriority 
    ? t('priority.high') 
    : originalPriorityScore >= 0 
      ? t('priority.low') 
      : t('priority.veryLow');

  const handleSubmit = async () => {
    if (!selectedReason) return;

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/priority/${emailId}/override`, {
        priorityScore: newPriorityScore,
        reasonType: selectedReason,
        reasonText: reasonText.trim() || undefined,
      });
      
      if (onSubmitted) {
        onSubmitted();
      }
      onClose();
    } catch (error) {
      console.error('Error submitting priority override:', error);
      alert(t('priority.override.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  // Get context-specific description
  const getDescription = () => {
    if (context === 'archive') {
      if (isHighPriority) {
        return t('priority.override.archiveHighPriority', { 
          score: originalPriorityScore.toFixed(0),
          priority: priorityLabel 
        });
      } else {
        return t('priority.override.archiveLowPriority', { 
          score: originalPriorityScore.toFixed(0),
          priority: priorityLabel 
        });
      }
    }
    // Default description for manual/star changes
    return t('priority.override.description', { 
      from: originalPriorityScore.toFixed(0), 
      to: newPriorityScore.toFixed(0) 
    });
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <ModalContent>
        <ModalHeader title={t('priority.override.title')} />

        <p style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          {getDescription()}
        </p>

        <ReasonTypeSelector
          selectedReason={selectedReason}
          onReasonChange={setSelectedReason}
        />

        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{
            display: 'block',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}>
            {t('priority.override.additionalDetails')}:
          </label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder={t('priority.override.placeholder')}
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

        <ModalFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          canSubmit={!!selectedReason}
        />
      </ModalContent>
    </ModalBackdrop>
  );
};





