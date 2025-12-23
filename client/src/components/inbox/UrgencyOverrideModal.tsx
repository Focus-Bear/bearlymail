import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from '../../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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
      alert('Please provide a reason for the override.');
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/priority/${threadId}/override-urgency`, {
        urgencyScore: Math.max(0, Math.min(100, urgencyScore)),
        reason: reason.trim(),
      });
      
      if (onSubmitted) {
        onSubmitted();
      }
      onClose();
    } catch (error) {
      console.error('Error submitting urgency override:', error);
      alert('Failed to submit override. Please try again.');
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
          Override Urgency Score
        </h3>

        <p style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          Current urgency score: {currentUrgencyScore.toFixed(0)}/100
          {currentUrgencyScore >= 90 && (
            <span style={{ color: theme.colors.accent.error, fontWeight: 'bold' }}> (CRITICAL)</span>
          )}
        </p>

        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{
            display: 'block',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}>
            New Urgency Score (0-100):
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={urgencyScore}
            onChange={(e) => setUrgencyScore(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
            style={{
              width: '100%',
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontFamily: theme.typography.fontFamily,
            }}
          />
          <div style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            marginTop: theme.spacing.xs,
          }}>
            {urgencyScore >= 90 && '🚨 Critical urgency - will bypass all batching'}
            {urgencyScore >= 60 && urgencyScore < 90 && '⚠️ High urgency'}
            {urgencyScore >= 30 && urgencyScore < 60 && '📋 Moderate urgency'}
            {urgencyScore < 30 && '✅ Low urgency'}
          </div>
        </div>

        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{
            display: 'block',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}>
            Reason for override (required):
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you're changing the urgency score..."
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
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason.trim() || submitting}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: reason.trim() && !submitting
                ? theme.colors.primary.main
                : theme.colors.background.subtle,
              color: reason.trim() && !submitting ? 'white' : theme.colors.text.tertiary,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: reason.trim() && !submitting ? 'pointer' : 'not-allowed',
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



