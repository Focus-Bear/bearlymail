import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Email {
  id: number;
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  priorityScore: number;
  isRead: boolean;
  receivedAt: string;
}

interface Note {
  noteId: number;
  content: string;
}

const EmailDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState<Email | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchEmail();
      fetchNote();
    }
  }, [id]);

  const fetchEmail = async () => {
    try {
      const response = await axios.get(`${API_URL}/emails/${id}`);
      setEmail(response.data);
      await axios.put(`${API_URL}/emails/${id}/read`);
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNote = async () => {
    if (!email) return;
    try {
      const response = await axios.get(`${API_URL}/notes/thread/${email.threadId}`);
      if (response.data) {
        setNote(response.data);
        setNoteContent(response.data.content);
      }
    } catch (error) {
      // Note might not exist
    }
  };

  const handleSaveNote = async () => {
    if (!email) return;
    try {
      await axios.post(`${API_URL}/notes/thread/${email.threadId}`, { content: noteContent });
      await fetchNote();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const handleSummarize = async (type: string) => {
    if (!id) return;
    setProcessing(true);
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, { type });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error summarizing:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!id) return;
    setProcessing(true);
    try {
      const response = await axios.post(`${API_URL}/replies/draft/${id}`);
      setDraft(response.data.draft);
    } catch (error) {
      console.error('Error generating draft:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateMeetingReply = async () => {
    if (!id) return;
    setProcessing(true);
    try {
      const response = await axios.post(`${API_URL}/calendar/meeting-reply/${id}`);
      setDraft(response.data.draft);
    } catch (error) {
      console.error('Error generating meeting reply:', error);
    } finally {
      setProcessing(false);
    }
  };

  const ActionButton: React.FC<{ 
    onClick: () => void, 
    label: string, 
    variant?: 'primary' | 'secondary' | 'info', 
    icon?: string 
  }> = ({ onClick, label, variant = 'secondary', icon }) => {
    let bg = theme.colors.background.default;
    let color = theme.colors.text.primary;
    let hoverBg = theme.colors.border.light;

    if (variant === 'primary') {
      bg = theme.colors.primary.main;
      color = 'white';
      hoverBg = theme.colors.primary.dark;
    } else if (variant === 'info') {
      bg = theme.colors.accent.info;
      color = 'white';
      hoverBg = theme.colors.primary.dark;
    }

    return (
      <button
        onClick={onClick}
        disabled={processing}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: bg,
          color: color,
          border: 'none',
          borderRadius: theme.borderRadius.full,
          cursor: processing ? 'wait' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          transition: theme.transitions.fast,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          opacity: processing ? 0.7 : 1,
          boxShadow: theme.shadows.sm,
        }}
        onMouseEnter={(e) => !processing && (e.currentTarget.style.backgroundColor = hoverBg)}
        onMouseLeave={(e) => !processing && (e.currentTarget.style.backgroundColor = bg)}
      >
        {icon && <span>{icon}</span>}
        {label}
      </button>
    );
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        color: theme.colors.text.secondary,
      }}>
        Loading email...
      </div>
    );
  }

  if (!email) {
    return <div>Email not found</div>;
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
    }}>
      {/* Back Navigation */}
      <div style={{
        width: '80px',
        backgroundColor: theme.colors.background.paper,
        borderRight: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: theme.spacing.xl,
      }}>
        <button
          onClick={() => navigate('/inbox')}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: `1px solid ${theme.colors.border.medium}`,
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            transition: theme.transitions.fast,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.background.default}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          title="Back to Inbox"
        >
          ←
        </button>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing['2xl'] }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* Email Card */}
          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.xl,
            padding: theme.spacing['2xl'],
            boxShadow: theme.shadows.md,
            marginBottom: theme.spacing.xl,
          }}>
            <div style={{ marginBottom: theme.spacing.xl }}>
              <h1 style={{
                fontSize: theme.typography.fontSize['3xl'],
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.lg,
                lineHeight: theme.typography.lineHeight.tight,
              }}>
                {email.subject}
              </h1>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.colors.border.light}`, paddingBottom: theme.spacing.lg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: theme.colors.primary.subtle,
                    color: theme.colors.primary.main,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: theme.typography.fontWeight.bold,
                    fontSize: theme.typography.fontSize.lg,
                  }}>
                    {(email.fromName || email.from)[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                      {email.fromName || email.from}
                    </div>
                    <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
                      {new Date(email.receivedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ 
                  padding: `${theme.spacing.xs} ${theme.spacing.md}`, 
                  backgroundColor: theme.colors.background.default, 
                  borderRadius: theme.borderRadius.full,
                  fontSize: theme.typography.fontSize.xs,
                  fontWeight: theme.typography.fontWeight.medium,
                  color: theme.colors.text.secondary
                }}>
                  Priority Score: {email.priorityScore.toFixed(0)}
                </div>
              </div>
            </div>

            {/* AI Tools Bar */}
            <div style={{
              marginBottom: theme.spacing.xl,
              display: 'flex',
              gap: theme.spacing.md,
              flexWrap: 'wrap',
              padding: theme.spacing.lg,
              backgroundColor: theme.colors.background.subtle,
              borderRadius: theme.borderRadius.lg,
            }}>
              <ActionButton label="TL;DR" icon="📝" onClick={() => handleSummarize('tldr')} />
              <ActionButton label="Key Points" icon="•" onClick={() => handleSummarize('bullet-points')} />
              <ActionButton label="Action Items" icon="⚡" onClick={() => handleSummarize('action-items')} />
              <div style={{ width: '1px', backgroundColor: theme.colors.border.medium, margin: `0 ${theme.spacing.xs}` }} />
              <ActionButton label="Draft Reply" icon="✍️" variant="primary" onClick={handleGenerateDraft} />
              <ActionButton label="Schedule Meeting" icon="📅" variant="info" onClick={handleGenerateMeetingReply} />
            </div>

            {/* AI Output Area */}
            {summary && (
              <div className="animate-fade-in" style={{
                backgroundColor: theme.colors.primary.subtle,
                padding: theme.spacing.xl,
                borderRadius: theme.borderRadius.lg,
                marginBottom: theme.spacing.xl,
                borderLeft: `4px solid ${theme.colors.primary.main}`,
              }}>
                <strong style={{ display: 'block', marginBottom: theme.spacing.sm, color: theme.colors.primary.dark }}>AI Summary</strong>
                <div style={{ whiteSpace: 'pre-wrap', color: theme.colors.text.primary, lineHeight: theme.typography.lineHeight.relaxed }}>
                  {summary}
                </div>
              </div>
            )}

            {/* Email Body */}
            <div style={{
              color: theme.colors.text.primary,
              lineHeight: '1.8',
              fontSize: theme.typography.fontSize.lg,
              whiteSpace: 'pre-wrap',
              marginBottom: theme.spacing.xl,
            }}>
              {email.htmlBody ? (
                <div dangerouslySetInnerHTML={{ __html: email.htmlBody }} />
              ) : (
                email.body
              )}
            </div>

            {/* Draft Area */}
            {draft && (
              <div className="animate-fade-in" style={{
                marginTop: theme.spacing['2xl'],
                paddingTop: theme.spacing.xl,
                borderTop: `1px solid ${theme.colors.border.light}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                  <strong style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.lg }}>Draft Reply</strong>
                  <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>Auto-generated based on your style</div>
                </div>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '300px',
                    padding: theme.spacing.lg,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.lg,
                    fontSize: theme.typography.fontSize.base,
                    fontFamily: theme.typography.fontFamily,
                    lineHeight: theme.typography.lineHeight.relaxed,
                    backgroundColor: theme.colors.background.subtle,
                    outline: 'none',
                  }}
                />
                <div style={{ marginTop: theme.spacing.md, display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.md }}>
                  <button style={{
                    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                    backgroundColor: theme.colors.primary.main,
                    color: 'white',
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    fontWeight: theme.typography.fontWeight.semibold,
                    cursor: 'pointer',
                  }}>
                    Send Reply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Private Notes Card */}
          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.xl,
            padding: theme.spacing.xl,
            boxShadow: theme.shadows.md,
          }}>
            <h3 style={{
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}>
              🔒 Private Notes
            </h3>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Add thoughts, context, or reminders about this thread... (Only visible to you)"
              style={{
                width: '100%',
                minHeight: '120px',
                padding: theme.spacing.md,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontFamily: theme.typography.fontFamily,
                marginBottom: theme.spacing.md,
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ActionButton label="Save Note" onClick={handleSaveNote} variant="primary" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailDetail;
