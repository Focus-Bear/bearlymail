import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from '../../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface PriorityExplanation {
  score: number;
  factors: Array<{
    type: string;
    description: string;
    contribution: number;
  }>;
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
      const response = await axios.get(`${API_URL}/priority/${emailId}/explanation`);
      setExplanation(response.data);
    } catch (error) {
      console.error('Error fetching priority explanation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseEnter = () => {
    setShowTooltip(true);
    if (!explanation && !loading) {
      fetchExplanation();
    }
  };

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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => {
          // Don't hide immediately on mouse leave - let click outside handle it
        }}
      >
        {children}
      </div>
      
      {showTooltip && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.md,
            boxShadow: theme.shadows.lg,
            minWidth: '300px',
            maxWidth: '400px',
            marginTop: theme.spacing.xs,
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
            }}>
              🎯 Goal Alignment: {priorityScore.toFixed(0)}
            </div>
            <div style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}>
              Why this score?
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
          ) : explanation ? (
            <>
              <div style={{ marginBottom: theme.spacing.md }}>
                {explanation.factors.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
                    {explanation.factors.map((factor, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: theme.spacing.xs,
                          padding: theme.spacing.xs,
                          backgroundColor: factor.contribution > 0 
                            ? theme.colors.primary.subtle 
                            : theme.colors.background.subtle,
                          borderRadius: theme.borderRadius.sm,
                        }}
                      >
                        <span style={{ fontSize: '0.9rem' }}>
                          {getFactorIcon(factor.type)}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: theme.typography.fontSize.xs,
                            fontWeight: theme.typography.fontWeight.medium,
                            color: theme.colors.text.primary,
                          }}>
                            {factor.description}
                          </div>
                          <div style={{
                            fontSize: theme.typography.fontSize.xs,
                            color: factor.contribution > 0 
                              ? theme.colors.primary.main 
                              : theme.colors.text.secondary,
                          }}>
                            {factor.contribution > 0 ? '+' : ''}{factor.contribution.toFixed(0)} points
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.text.secondary,
                    fontStyle: 'italic',
                  }}>
                    No specific factors identified. Base score: 50
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
            }}>
              Unable to load explanation
            </div>
          )}
        </div>
      )}
    </div>
  );
};

