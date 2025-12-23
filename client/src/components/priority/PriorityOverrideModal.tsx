import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from '../../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export enum OverrideReasonType {
  WRONG_SENDER_PRIORITY = 'wrong_sender_priority',
  WRONG_URGENCY = 'wrong_urgency',
  TOPIC_MISMATCH = 'topic_mismatch',
  OTHER = 'other',
}

interface PriorityOverrideModalProps {
  emailId: string;
  originalPriorityScore: number;
  newPriorityScore: number;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const PriorityOverrideModal: React.FC<PriorityOverrideModalProps> = ({
  emailId,
  originalPriorityScore,
  newPriorityScore,
  onClose,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState<OverrideReasonType | ''>('');
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      alert('Failed to submit override. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reasonOptions = [
    { value: OverrideReasonType.WRONG_SENDER_PRIORITY, label: 'Wrong sender priority' },
    { value: OverrideReasonType.WRONG_URGENCY, label: 'Wrong urgency' },
    { value: OverrideReasonType.TOPIC_MISMATCH, label: 'Topic mismatch' },
    { value: OverrideReasonType.OTHER, label: 'Other' },
  ];

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
          Why did you change this priority?
        </h3>

        <p style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          Priority changed from {originalPriorityScore.toFixed(0)} to {newPriorityScore.toFixed(0)}.
          Help us understand why so we can improve future scoring.
        </p>

        <div style={{ marginBottom: theme.spacing.md }}>
          {reasonOptions.map((option) => (
            <label
              key={option.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: theme.spacing.sm,
                marginBottom: theme.spacing.xs,
                cursor: 'pointer',
                borderRadius: theme.borderRadius.sm,
                backgroundColor: selectedReason === option.value
                  ? theme.colors.primary.subtle
                  : 'transparent',
                transition: 'background-color 0.2s',
              }}
            >
              <input
                type="radio"
                name="reasonType"
                value={option.value}
                checked={selectedReason === option.value}
                onChange={(e) => setSelectedReason(e.target.value as OverrideReasonType)}
                style={{
                  marginRight: theme.spacing.sm,
                  cursor: 'pointer',
                }}
              />
              <span style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
              }}>
                {option.label}
              </span>
            </label>
          ))}
        </div>

        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{
            display: 'block',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}>
            Additional details (optional):
          </label>
          <textarea
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Provide more context about why you changed the priority..."
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
            disabled={!selectedReason || submitting}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: selectedReason && !submitting
                ? theme.colors.primary.main
                : theme.colors.background.subtle,
              color: selectedReason && !submitting ? 'white' : theme.colors.text.tertiary,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: selectedReason && !submitting ? 'pointer' : 'not-allowed',
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



