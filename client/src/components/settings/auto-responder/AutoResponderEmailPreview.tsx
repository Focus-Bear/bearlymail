import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { useAuth } from 'contexts/AuthContext';

interface RecentEmail {
  id: string;
  from: string;
  fromName: string | null;
  subject: string;
  receivedAt: string;
  priorityScore: number | null;
}

interface EmailPreviewResult {
  subject: string;
  body: string;
  templateUsed: string;
  priorityLevel: string;
  senderName: string;
  originalSubject: string;
}

const renderFormattedText = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;

  const regex = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(\*([^*]+)\*)|(_([^_]+)_)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > currentIndex) {
      parts.push(text.slice(currentIndex, match.index));
    }

    if (match[1]) {
      parts.push(<strong key={match.index}>{renderFormattedText(match[2])}</strong>);
    } else if (match[3]) {
      parts.push(
        <a
          key={match.index}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: theme.colors.primary.main }}
        >
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      parts.push(<em key={match.index}>{renderFormattedText(match[7])}</em>);
    } else if (match[8]) {
      parts.push(<em key={match.index}>{renderFormattedText(match[9])}</em>);
    }

    currentIndex = match.index + match[0].length;
  }

  if (currentIndex < text.length) {
    parts.push(text.slice(currentIndex));
  }

  return parts.length > 0 ? parts : text;
};

const getPriorityLabel = (priorityLevel: string): { label: string; emoji: string; color: string } => {
  switch (priorityLevel) {
    case 'high':
      return { label: 'High Priority', emoji: '🔥', color: theme.colors.error.main };
    case 'low':
      return { label: 'Low Priority', emoji: '📭', color: theme.colors.text.tertiary };
    default:
      return { label: 'Standard Priority', emoji: '📬', color: theme.colors.primary.main };
  }
};

export const AutoResponderEmailPreview: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [recentEmails, setRecentEmails] = useState<RecentEmail[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailPreviewResult | null>(null);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecentEmails = useCallback(async () => {
    if (!token) return;
    
    setIsLoadingEmails(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auto-responder/recent-emails?limit=10', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch recent emails');
      }
      
      const data = await response.json();
      setRecentEmails(data.emails || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recent emails');
    } finally {
      setIsLoadingEmails(false);
    }
  }, [token]);

  const fetchPreviewForEmail = useCallback(async (emailId: string) => {
    if (!token) return;
    
    setIsLoadingPreview(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auto-responder/preview-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emailId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }
      
      const data = await response.json();
      setPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
      setPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [token]);

  useEffect(() => {
    if (isExpanded && recentEmails.length === 0) {
      fetchRecentEmails();
    }
  }, [isExpanded, recentEmails.length, fetchRecentEmails]);

  useEffect(() => {
    if (selectedEmailId) {
      fetchPreviewForEmail(selectedEmailId);
    } else {
      setPreview(null);
    }
  }, [selectedEmailId, fetchPreviewForEmail]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const priorityInfo = preview ? getPriorityLabel(preview.priorityLevel) : null;

  return (
    <div style={{
      marginTop: theme.spacing.lg,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: theme.spacing.md,
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div>
          <h3 style={{
            ...theme.typography.heading.h6,
            color: theme.colors.text.primary,
            margin: 0,
          }}>
            {t('settings.autoResponder.emailPreview.title')}
          </h3>
          <p style={{
            ...theme.typography.body.medium,
            color: theme.colors.text.tertiary,
            margin: 0,
            marginTop: theme.spacing.xs,
          }}>
            {t('settings.autoResponder.emailPreview.description')}
          </p>
        </div>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: theme.typography.fontSize.lg }}>
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {isExpanded && (
        <div style={{ padding: theme.spacing.md, paddingTop: 0 }}>
          {/* Email selector */}
          <div style={{ marginBottom: theme.spacing.md }}>
            <label style={{
              ...theme.typography.body.medium,
              color: theme.colors.text.secondary,
              display: 'block',
              marginBottom: theme.spacing.xs,
            }}>
              {t('settings.autoResponder.emailPreview.selectEmail')}
            </label>
            
            {isLoadingEmails ? (
              <p style={{
                ...theme.typography.body.medium,
                color: theme.colors.text.tertiary,
              }}>
                {t('common.loading')}
              </p>
            ) : error && recentEmails.length === 0 ? (
              <p style={{
                ...theme.typography.body.medium,
                color: theme.colors.error.main,
              }}>
                {error}
              </p>
            ) : recentEmails.length === 0 ? (
              <p style={{
                ...theme.typography.body.medium,
                color: theme.colors.text.tertiary,
              }}>
                {t('settings.autoResponder.emailPreview.noEmails')}
              </p>
            ) : (
              <select
                value={selectedEmailId || ''}
                onChange={(e) => setSelectedEmailId(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  borderRadius: theme.borderRadius.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  backgroundColor: theme.colors.background.paper,
                  ...theme.typography.body.medium,
                  cursor: 'pointer',
                }}
              >
                <option value="">{t('settings.autoResponder.emailPreview.selectPlaceholder')}</option>
                {recentEmails.map((email) => (
                  <option key={email.id} value={email.id}>
                    {email.fromName || email.from} - {email.subject.slice(0, 50)}{email.subject.length > 50 ? '...' : ''} ({formatDate(email.receivedAt)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Preview result */}
          {selectedEmailId && (
            <div style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.light}`,
              overflow: 'hidden',
            }}>
              {isLoadingPreview ? (
                <div style={{
                  padding: theme.spacing.lg,
                  textAlign: 'center',
                }}>
                  <p style={{
                    ...theme.typography.body.medium,
                    color: theme.colors.text.tertiary,
                  }}>
                    {t('settings.autoResponder.emailPreview.generating')}
                  </p>
                </div>
              ) : error ? (
                <div style={{
                  padding: theme.spacing.lg,
                  textAlign: 'center',
                }}>
                  <p style={{
                    ...theme.typography.body.medium,
                    color: theme.colors.error.main,
                  }}>
                    {error}
                  </p>
                </div>
              ) : preview ? (
                <>
                  {/* Priority badge */}
                  {priorityInfo && (
                    <div style={{
                      padding: theme.spacing.sm,
                      backgroundColor: theme.colors.greyscale[200],
                      borderBottom: `1px solid ${theme.colors.border.light}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                    }}>
                      <span style={{
                        ...theme.typography.body.medium,
                        fontWeight: theme.typography.fontWeight.medium,
                        color: priorityInfo.color,
                      }}>
                        {priorityInfo.emoji} {priorityInfo.label}
                      </span>
                      <span style={{
                        ...theme.typography.body.small,
                        color: theme.colors.text.tertiary,
                      }}>
                        {t('settings.autoResponder.emailPreview.templateUsed', { template: preview.templateUsed })}
                      </span>
                    </div>
                  )}

                  {/* Subject line */}
                  <div style={{
                    padding: theme.spacing.md,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    backgroundColor: theme.colors.greyscale[300],
                  }}>
                    <div style={{
                      ...theme.typography.body.medium,
                      color: theme.colors.text.tertiary,
                    }}>
                      {t('settings.autoResponder.preview.subject')}
                    </div>
                    <div style={{
                      ...theme.typography.body.xLarge,
                      fontWeight: theme.typography.fontWeight.medium,
                      color: theme.colors.text.primary,
                      padding: theme.spacing.xs,
                    }}>
                      {preview.subject}
                    </div>
                  </div>

                  {/* Email body */}
                  <div style={{
                    padding: theme.spacing.md,
                    whiteSpace: 'pre-wrap',
                    ...theme.typography.body.large,
                    color: theme.colors.text.primary,
                    lineHeight: 1.6,
                  }}>
                    {renderFormattedText(preview.body)}
                  </div>
                </>
              ) : null}
            </div>
          )}

          {!selectedEmailId && (
            <p style={{
              ...theme.typography.body.medium,
              color: theme.colors.text.tertiary,
              fontStyle: 'italic',
            }}>
              {t('settings.autoResponder.emailPreview.hint')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
