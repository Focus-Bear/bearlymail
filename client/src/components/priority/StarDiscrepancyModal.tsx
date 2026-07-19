import React, { useState } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { StarDiscrepancyActions } from 'components/priority/star/StarDiscrepancyActions';
import { StarDiscrepancyForm } from 'components/priority/star/StarDiscrepancyForm';
import { StarDiscrepancyHeader } from 'components/priority/star/StarDiscrepancyHeader';
import { API_URL } from 'config/api';

interface StarDiscrepancyModalProps {
  emailId: string;
  userStarCount: number;
  predictedStarCount: number;
  emailSubject?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const StarDiscrepancyModal: React.FC<StarDiscrepancyModalProps> = ({
  emailId,
  userStarCount,
  predictedStarCount,
  emailSubject,
  onClose,
  onSubmitted,
}) => {
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!explanation.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/priority/star-feedback`, {
        emailId,
        userStarCount,
        predictedStarCount,
        explanation: explanation.trim(),
      });

      if (onSubmitted) {
        onSubmitted();
      }
      onClose();
    } catch (error) {
      console.error('Error submitting star feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} zIndex={2000}>
      <ModalContent maxWidth="500px">
        {emailSubject && (
          <p
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              backgroundColor: theme.colors.background.subtle,
              borderRadius: theme.borderRadius.sm,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              marginBottom: theme.spacing.sm,
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {emailSubject}
          </p>
        )}
        <StarDiscrepancyHeader predictedStarCount={predictedStarCount} userStarCount={userStarCount} />
        <StarDiscrepancyForm explanation={explanation} onExplanationChange={setExplanation} />
        <StarDiscrepancyActions
          explanation={explanation}
          submitting={submitting}
          onCancel={onClose}
          onSubmit={handleSubmit}
        />
      </ModalContent>
    </ModalBackdrop>
  );
};
