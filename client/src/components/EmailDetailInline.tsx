import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import DOMPurify from 'dompurify';
import { theme } from '../theme/theme';
import { humanizeTimestamp } from '../utils/dateUtils';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  priorityScore: number;
  isRead: boolean;
  receivedAt: string;
  summary?: string | null;
  isProcessingSummary?: boolean;
}

interface EmailDetailInlineProps {
  emailId: string;
  onClose?: () => void;
}

export const EmailDetailInline: React.FC<EmailDetailInlineProps> = ({ emailId, onClose }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [expandedThreadItems, setExpandedThreadItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmail();
  }, [emailId]);

  const fetchEmail = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/emails/${emailId}`);
      setEmail(response.data);
      
      // Fetch thread emails
      if (response.data.threadId) {
        try {
          const threadResponse = await axios.get(`${API_URL}/emails/thread/${response.data.threadId}`);
          setThreadEmails(threadResponse.data);
          // Expand current email by default
          setExpandedThreadItems(new Set([emailId]));
        } catch (error) {
          console.error('Error fetching thread:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleThreadItem = (id: string) => {
    setExpandedThreadItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const removeSignature = (text: string): string => {
    if (!text) return '';
    
    // Common signature patterns
    const patterns = [
      /^--\s*$/m, // Standard signature separator
      /^Best regards,?$/mi,
      /^Sent from .+$/mi,
      /^On .+ wrote:?$/mi,
      /\n-{3,}\n/, // Horizontal line
      /RMIT University/i,
      /getoutline\.org/i,
    ];
    
    // Try to find signature start
    let signatureStart = text.length;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined && match.index < signatureStart) {
        signatureStart = match.index;
      }
    }
    
    return text.substring(0, signatureStart).trim();
  };

  if (loading) {
    return (
      <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
        <div style={{
          width: '24px',
          height: '24px',
          border: `2px solid ${theme.colors.border.light}`,
          borderTop: `2px solid ${theme.colors.primary.main}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto',
        }} />
      </div>
    );
  }

  if (!email) {
    return (
      <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
        <p style={{ color: theme.colors.text.secondary }}>Email not found</p>
      </div>
    );
  }

  const displayBody = email.htmlBody 
    ? DOMPurify.sanitize(email.htmlBody)
    : email.body?.split('\n').map((line, i) => (
        <React.Fragment key={i}>
          {line}
          <br />
        </React.Fragment>
      ));

  return (
    <div style={{ padding: theme.spacing.xl, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: theme.spacing.xl }}>
        <button
          onClick={() => navigate(`/email/${emailId}`)}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.md,
          }}
        >
          Open in full view →
        </button>
        
        <h1 style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}>
          {email.subject || '(No subject)'}
        </h1>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
          flexWrap: 'wrap',
        }}>
          <div>
            <strong style={{ color: theme.colors.text.primary }}>
              {email.fromName || email.from}
            </strong>
            <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
              {email.from}
            </span>
          </div>
          <span style={{ color: theme.colors.text.tertiary }}>
            {humanizeTimestamp(new Date(email.receivedAt))}
          </span>
        </div>
      </div>

      {/* Thread View */}
      {threadEmails.length > 1 && (
        <div style={{ marginBottom: theme.spacing.xl }}>
          <h3 style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.md,
            color: theme.colors.text.primary,
          }}>
            Thread ({threadEmails.length} messages)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {threadEmails.map((threadEmail) => (
              <div
                key={threadEmail.id}
                style={{
                  border: `1px solid ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.md,
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleThreadItem(threadEmail.id)}
                  style={{
                    padding: theme.spacing.md,
                    backgroundColor: threadEmail.id === emailId 
                      ? theme.colors.primary.subtle 
                      : theme.colors.background.subtle,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong style={{ color: theme.colors.text.primary }}>
                      {threadEmail.fromName || threadEmail.from}
                    </strong>
                    <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
                      {humanizeTimestamp(new Date(threadEmail.receivedAt))}
                    </span>
                  </div>
                  <span style={{ color: theme.colors.text.tertiary }}>
                    {expandedThreadItems.has(threadEmail.id) ? '▼' : '▶'}
                  </span>
                </div>
                {expandedThreadItems.has(threadEmail.id) && (
                  <div style={{
                    padding: theme.spacing.md,
                    backgroundColor: theme.colors.background.paper,
                    borderTop: `1px solid ${theme.colors.border.light}`,
                  }}>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: threadEmail.htmlBody 
                          ? DOMPurify.sanitize(removeSignature(threadEmail.htmlBody))
                          : removeSignature(threadEmail.body || '')
                      }}
                      style={{
                        color: theme.colors.text.primary,
                        lineHeight: 1.6,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email Body */}
      <div style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}>
        <div
          dangerouslySetInnerHTML={{
            __html: email.htmlBody 
              ? DOMPurify.sanitize(removeSignature(email.htmlBody))
              : removeSignature(email.body || '')
          }}
          style={{
            color: theme.colors.text.primary,
            lineHeight: 1.8,
          }}
        />
      </div>
    </div>
  );
};


