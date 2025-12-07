import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from '../../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface PriorityExplanation {
  score: number;
  dimensions: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

interface PriorityTooltipProps {
  emailId: string;
  priorityScore: number;
  children: React.ReactNode;
  onOverride?: (explanation: string) => void;
}

export const PriorityTooltip: React.FC<PriorityTooltipProps> = ({
  emailId,
  priorityScore,
  children,
  onOverride,
}) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);
  const [explanation, setExplanation] = useState<PriorityExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideExplanation, setOverrideExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
        setShowOverrideForm(false);
      }
    };

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTooltip]);

  const fetchExplanation = async () => {
    if (explanation || loading) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/emails/${emailId}/priority-explanation`);
      console.log('Priority explanation response:', response.data);
      if (response.data && response.data.dimensions) {
        setExplanation(response.data);
      } else {
        console.warn('Unexpected response format:', response.data);
      }
    } catch (error: any) {
      console.error('Error fetching priority explanation:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: `${API_URL}/emails/${emailId}/priority-explanation`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    setShowTooltip(true);
    if (!explanation && !loading) {
      fetchExplanation();
    }
  };

  // Position tooltip after it's shown
  useEffect(() => {
    if (showTooltip && tooltipRef.current && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      
      // Position below the trigger
      tooltip.style.left = `${triggerRect.left}px`;
      tooltip.style.top = `${triggerRect.bottom + 8}px`;
      
      // Adjust if tooltip would go off screen
      requestAnimationFrame(() => {
        if (tooltip) {
          const tooltipRect = tooltip.getBoundingClientRect();
          if (tooltipRect.right > window.innerWidth) {
            tooltip.style.left = `${window.innerWidth - tooltipRect.width - 16}px`;
          }
          if (tooltipRect.bottom > window.innerHeight) {
            tooltip.style.top = `${triggerRect.top - tooltipRect.height - 8}px`;
          }
          if (tooltipRect.left < 0) {
            tooltip.style.left = '16px';
          }
        }
      });
    }
  }, [showTooltip]);

  const handleOverrideSubmit = async () => {
    if (!overrideExplanation.trim()) return;
    
    setSubmitting(true);
    try {
      if (onOverride) {
        await onOverride(overrideExplanation);
      }
      setShowOverrideForm(false);
      setOverrideExplanation('');
    } catch (error) {
      console.error('Error submitting override:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const getFactorIcon = (type: string): string => {
    switch (type) {
      case 'VIP_CONTACT':
        return '⭐';
      case 'GOAL_ALIGNMENT':
        return '🎯';
      case 'CURRENT_PROJECT':
        return '📁';
      case 'NOT_IMPORTANT':
        return '❌';
      case 'SENTIMENT':
        return '⚡';
      case 'SENDER_ROLE':
        return '👔';
      case 'RECENCY':
        return '⏰';
      case 'URGENT_KEYWORDS':
        return '🚨';
      default:
        return '•';
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        ref={triggerRef}
        data-priority-badge={emailId}
        onMouseEnter={(e) => handleMouseEnter(e)}
        onMouseLeave={() => {
          // Don't hide immediately on mouse leave - let click outside handle it
        }}
      >
        {children}
      </div>
      
      {showTooltip && (
        <div
          ref={tooltipRef}
          data-priority-tooltip={emailId}
          style={{
            position: 'fixed',
            zIndex: 10000,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.md,
            boxShadow: theme.shadows.xl,
            minWidth: '300px',
            maxWidth: '400px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div style={{ marginBottom: theme.spacing.sm }}>
            <div style={{
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.xs,
              borderBottom: `1px solid ${theme.colors.border.light}`,
              paddingBottom: theme.spacing.xs,
            }}>
              Priority Score: {priorityScore.toFixed(0)}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: theme.spacing.md, textAlign: 'center' }}>
              <div style={{
                display: 'inline-block',
                width: '16px',
                height: '16px',
                border: `2px solid ${theme.colors.primary.main}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
            </div>
          ) : explanation && explanation.dimensions ? (
            <>
              {/* Dimensions */}
              <div style={{ marginBottom: theme.spacing.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>🔥 Urgency</span>
                  <span style={{ fontWeight: 'bold' }}>{explanation.dimensions.urgency?.score?.toFixed(0) || '0'}</span>
                </div>
                {explanation.dimensions.urgency?.reasons && explanation.dimensions.urgency.reasons.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                    {explanation.dimensions.urgency.reasons.slice(0, 2).join('; ')}
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: theme.spacing.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>🎯 Goal Alignment</span>
                  <span style={{ fontWeight: 'bold' }}>{explanation.dimensions.goalAlignment?.score?.toFixed(0) || '0'}</span>
                </div>
                {explanation.dimensions.goalAlignment?.reasons && explanation.dimensions.goalAlignment.reasons.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                    {explanation.dimensions.goalAlignment.reasons.slice(0, 2).join('; ')}
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: theme.spacing.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>⭐ VIP Contact</span>
                  <span style={{ fontWeight: 'bold' }}>{explanation.dimensions.vipContact?.score?.toFixed(0) || '0'}</span>
                </div>
                {explanation.dimensions.vipContact?.reasons && explanation.dimensions.vipContact.reasons.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                    {explanation.dimensions.vipContact.reasons.slice(0, 2).join('; ')}
                  </div>
                )}
              </div>

              {!showOverrideForm ? (
                <button
                  onClick={() => setShowOverrideForm(true)}
                  style={{
                    width: '100%',
                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                    backgroundColor: theme.colors.background.subtle,
                    color: theme.colors.text.primary,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.sm,
                    cursor: 'pointer',
                    fontSize: theme.typography.fontSize.xs,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}
                >
                  Override Priority
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
                  <textarea
                    value={overrideExplanation}
                    onChange={(e) => setOverrideExplanation(e.target.value)}
                    placeholder="Explain why this isn't urgent/goal aligned..."
                    style={{
                      width: '100%',
                      padding: theme.spacing.xs,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.fontSize.xs,
                      fontFamily: theme.typography.fontFamily,
                      resize: 'vertical',
                      minHeight: '60px',
                    }}
                  />
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    <button
                      onClick={handleOverrideSubmit}
                      disabled={!overrideExplanation.trim() || submitting}
                      style={{
                        flex: 1,
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: overrideExplanation.trim() && !submitting
                          ? theme.colors.primary.main
                          : theme.colors.background.subtle,
                        color: overrideExplanation.trim() && !submitting ? 'white' : theme.colors.text.tertiary,
                        border: 'none',
                        borderRadius: theme.borderRadius.sm,
                        cursor: overrideExplanation.trim() && !submitting ? 'pointer' : 'not-allowed',
                        fontSize: theme.typography.fontSize.xs,
                        fontWeight: theme.typography.fontWeight.medium,
                      }}
                    >
                      {submitting ? 'Submitting...' : 'Submit'}
                    </button>
                    <button
                      onClick={() => {
                        setShowOverrideForm(false);
                        setOverrideExplanation('');
                      }}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: 'transparent',
                        color: theme.colors.text.secondary,
                        border: `1px solid ${theme.colors.border.medium}`,
                        borderRadius: theme.borderRadius.sm,
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.xs,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
              padding: theme.spacing.sm,
              textAlign: 'center',
            }}>
              {loading ? 'Loading...' : 'Unable to load explanation. Please try again.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

