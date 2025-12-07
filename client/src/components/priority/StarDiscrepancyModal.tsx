import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from '../../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface StarDiscrepancyModalProps {
  emailId: string;
  userStarCount: number;
  predictedStarCount: number;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const StarDiscrepancyModal: React.FC<StarDiscrepancyModalProps> = ({
  emailId,
  userStarCount,
  predictedStarCount,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!explanation.trim()) return;

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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          maxWidth: '500px',
          width: '90%',
          boxShadow: theme.shadows.xl,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}>
          Help Us Learn
        </h3>

        <p style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          We predicted this email would be {predictedStarCount === 0 ? 'not starred' : `${predictedStarCount} star${predictedStarCount > 1 ? 's' : ''}`}, 
          but you gave it {userStarCount === 0 ? 'no stars' : `${userStarCount} star${userStarCount > 1 ? 's' : ''}`}.
        </p>

        <p style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}>
          Why did you {userStarCount > predictedStarCount ? 'prioritize' : 'deprioritize'} this email?
        </p>

        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="e.g., This is from my manager, This relates to an urgent deadline, This is just a newsletter..."
          style={{
            width: '100%',
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            fontFamily: theme.typography.fontFamily,
            resize: 'vertical',
            minHeight: '100px',
            marginBottom: theme.spacing.md,
          }}
        />

        <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: 'transparent',
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!explanation.trim() || submitting}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: explanation.trim() && !submitting
                ? theme.colors.primary.main
                : theme.colors.background.subtle,
              color: explanation.trim() && !submitting ? 'white' : theme.colors.text.tertiary,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: explanation.trim() && !submitting ? 'pointer' : 'not-allowed',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};



