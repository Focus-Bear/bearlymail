import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme/theme';

interface PriorityExplanation {
  score: number;
  dimensions?: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
    sentiment: { score: number; type: string; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
}

interface PriorityTooltipProps {
  emailId: string;
  emailThreadId?: string;
  priorityExplanation: PriorityExplanation | null;
  loadingPriorityExplanation: boolean;
  urgencyScore?: number;
  urgencyExplanation?: string | null;
  onClose: () => void;
  onOverrideUrgency?: () => void;
}

export const PriorityTooltip: React.FC<PriorityTooltipProps> = ({
  emailId,
  emailThreadId,
  priorityExplanation,
  loadingPriorityExplanation,
  urgencyScore,
  urgencyExplanation,
  onClose,
  onOverrideUrgency,
}) => {
  const navigate = useNavigate();

  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PriorityTooltip.tsx:30',message:'PriorityTooltip render check',data:{emailId,hasPriorityExplanation:!!priorityExplanation,loadingPriorityExplanation},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }
  // #endregion
  // Always show the tooltip if it's the hovered email, even if loading or no explanation yet
  // This prevents the blank popup from auto-closing
  if (!priorityExplanation && !loadingPriorityExplanation) {
    // Show a loading state instead of returning null
    return (
      <div
        data-priority-tooltip={emailId}
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          boxShadow: theme.shadows.xl,
          zIndex: 10000,
          minWidth: '350px',
          maxWidth: '500px',
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
          Loading priority explanation...
        </div>
      </div>
    );
  }

  return (
    <div
      data-priority-tooltip={emailId}
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        boxShadow: theme.shadows.xl,
        zIndex: 10000,
        minWidth: '350px',
        maxWidth: '500px',
        maxHeight: '80vh',
        overflowY: 'auto',
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.primary,
        textAlign: 'left',
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {loadingPriorityExplanation ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
          Loading...
        </div>
      ) : priorityExplanation ? (
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.sm, borderBottom: `1px solid ${theme.colors.border.light}`, paddingBottom: theme.spacing.sm }}>
            Priority Score: {priorityExplanation.score.toFixed(0)}
          </div>

          {/* Breakdown: Show how the score is calculated */}
          {priorityExplanation.breakdown && priorityExplanation.breakdown.length > 0 && (
            <div style={{ marginBottom: theme.spacing.sm }}>
              <div style={{ fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                SCORE BREAKDOWN
              </div>
              {priorityExplanation.breakdown.map((item, idx) => (
                <div key={idx} style={{ 
                  marginBottom: theme.spacing.sm,
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.background.subtle,
                  borderRadius: theme.borderRadius.sm,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>{item.factor}</span>
                    <span style={{ fontWeight: 'bold', color: item.value >= 0 ? theme.colors.accent.success : theme.colors.accent.error }}>
                      {item.value >= 0 ? '+' : ''}{item.value.toFixed(0)}
                    </span>
                  </div>
                  {item.description && (
                    <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginTop: '2px' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              ))}
              {/* Show total of breakdown - should equal the priority score */}
              {(() => {
                const breakdownTotal = priorityExplanation.breakdown.reduce((sum, item) => sum + (item.value || 0), 0);
                return (
                  <div style={{ 
                    marginTop: theme.spacing.sm,
                    padding: theme.spacing.sm,
                    backgroundColor: theme.colors.primary.subtle,
                    borderRadius: theme.borderRadius.sm,
                    borderTop: `2px solid ${theme.colors.border.medium}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span>Total:</span>
                      <span style={{ color: breakdownTotal >= 0 ? theme.colors.accent.success : theme.colors.accent.error }}>
                        {breakdownTotal >= 0 ? '+' : ''}{breakdownTotal.toFixed(0)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          
          {/* Primary Factors - Goal Alignment & Sentiment */}
          {priorityExplanation.dimensions && (
            <div style={{ marginBottom: theme.spacing.sm, padding: theme.spacing.sm, backgroundColor: theme.colors.primary.subtle, borderRadius: theme.borderRadius.sm }}>
              <div style={{ fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                PRIMARY FACTORS
              </div>
              
              <div style={{ marginBottom: theme.spacing.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                    <span>🎯 Goal Alignment</span>
                    {priorityExplanation.dimensions.goalAlignment.reasons.length > 0 && (
                      <span 
                        title={priorityExplanation.dimensions.goalAlignment.reasons.join('; ')}
                        style={{ 
                          cursor: 'help',
                          fontSize: '0.7rem',
                          color: theme.colors.text.secondary,
                          textDecoration: 'underline dotted',
                        }}
                      >
                        ℹ️
                      </span>
                    )}
                  </span>
                  <span style={{ fontWeight: 'bold', color: theme.colors.primary.main }}>
                    {(() => {
                      const goalBreakdown = priorityExplanation.breakdown?.filter(b => b.factor.includes('🎯') || b.factor.includes('Goal')) || [];
                      const total = goalBreakdown.reduce((sum, b) => sum + (b.value || 0), 0);
                      return total >= 0 ? `+${total.toFixed(0)}` : total.toFixed(0);
                    })()}
                  </span>
                </div>
                {priorityExplanation.dimensions.goalAlignment.reasons.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md, marginTop: '2px' }}>
                    {priorityExplanation.dimensions.goalAlignment.reasons.slice(0, 2).join('; ')}
                  </div>
                )}
              </div>
            
            {/* Sentiment */}
            {priorityExplanation.dimensions.sentiment && (
              <div style={{ marginBottom: theme.spacing.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>
                    {priorityExplanation.dimensions.sentiment.type === 'negative' ? '😟' : 
                     priorityExplanation.dimensions.sentiment.type === 'positive' ? '😊' : '😐'} 
                    Sentiment ({priorityExplanation.dimensions.sentiment.type})
                  </span>
                  <span style={{ fontWeight: 'bold', color: theme.colors.primary.main }}>
                    {priorityExplanation.dimensions.sentiment.score.toFixed(0)}
                  </span>
                </div>
                {priorityExplanation.dimensions.sentiment.reasons.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                    {priorityExplanation.dimensions.sentiment.reasons.slice(0, 2).join('; ')}
                  </div>
                )}
              </div>
            )}

            {/* Urgency - only show if > 0, and include override button */}
            {priorityExplanation.dimensions.urgency.score > 0 && (
              <div style={{ marginBottom: theme.spacing.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', alignItems: 'center' }}>
                  <span>🔥 Urgency</span>
                  <span style={{ fontWeight: 'bold' }}>{priorityExplanation.dimensions.urgency.score.toFixed(0)}/100</span>
                </div>
                {priorityExplanation.dimensions.urgency.reasons.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md, marginTop: '2px' }}>
                    {priorityExplanation.dimensions.urgency.reasons.slice(0, 2).join('; ')}
                  </div>
                )}
                {onOverrideUrgency && emailThreadId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOverrideUrgency();
                    }}
                    style={{
                      marginTop: theme.spacing.sm,
                      padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
                      backgroundColor: theme.colors.primary.main,
                      color: '#fff',
                      border: 'none',
                      borderRadius: theme.borderRadius.sm,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.xs,
                      fontWeight: theme.typography.fontWeight.medium,
                    }}
                  >
                    Override Urgency
                  </button>
                )}
              </div>
            )}
              
              <div style={{ marginBottom: theme.spacing.sm }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>⭐ VIP Contact</span>
                  <span style={{ fontWeight: 'bold' }}>
                    {(() => {
                      const vipBreakdown = priorityExplanation.breakdown?.filter(b => b.factor.includes('⭐') || b.factor.includes('VIP')) || [];
                      const total = vipBreakdown.reduce((sum, b) => sum + (b.value || 0), 0);
                      return total >= 0 ? `+${total.toFixed(0)}` : total.toFixed(0);
                    })()}
                  </span>
                </div>
                {priorityExplanation.dimensions.vipContact.reasons.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: theme.colors.text.secondary, marginLeft: theme.spacing.md }}>
                    {priorityExplanation.dimensions.vipContact.reasons.slice(0, 2).join('; ')}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Links to settings and help */}
          <div style={{ marginTop: theme.spacing.sm, paddingTop: theme.spacing.sm, borderTop: `1px solid ${theme.colors.border.light}`, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate('/settings');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: theme.colors.primary.main,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                textDecoration: 'underline',
              }}
            >
              Adjust context in Settings →
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate('/help/context');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: theme.colors.text.secondary,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.xs,
                textDecoration: 'underline',
              }}
            >
              Learn more about context →
            </button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: theme.colors.text.secondary }}>
          Hover to see details
        </div>
      )}
    </div>
  );
};
