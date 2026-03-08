import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { PriorityFeedbackActions } from 'components/priority/feedback/PriorityFeedbackActions';
import { PriorityFeedbackForm } from 'components/priority/feedback/PriorityFeedbackForm';
import { API_URL } from 'config/api';

interface PriorityFeedbackModalProps {
  emailId: string;
  currentPriorityScore: number;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const PriorityFeedbackModal: React.FC<PriorityFeedbackModalProps> = ({
  emailId,
  currentPriorityScore,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState('');
  const [expectedPriority, setExpectedPriority] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) {
      alert(t('priority.feedback.pleaseExplain'));
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/priority/${emailId}/feedback`, {
        feedback: feedback.trim(),
        expectedPriority: expectedPriority,
      });

      if (onSubmitted) {
        onSubmitted();
      }
      onClose();
    } catch (error) {
      console.error('Error submitting priority feedback:', error);
      alert(t('priority.feedback.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <ModalContent maxWidth="500px" maxHeight="80vh">
        <h3 style={{ marginTop: 0, marginBottom: theme.spacing.md }}>{t('priority.feedback.title')}</h3>
        <PriorityFeedbackForm
          feedback={feedback}
          expectedPriority={expectedPriority}
          currentPriorityScore={currentPriorityScore}
          onFeedbackChange={setFeedback}
          onExpectedPriorityChange={setExpectedPriority}
        />
        <PriorityFeedbackActions
          submitting={submitting}
          hasFeedback={!!feedback.trim()}
          onCancel={onClose}
          onSubmit={handleSubmit}
        />
      </ModalContent>
    </ModalBackdrop>
  );
};
