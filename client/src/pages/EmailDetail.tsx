import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

interface Note {
  noteId: string;
  content: string;
}

const EmailDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]); // All emails in thread
  const [expandedThreadItems, setExpandedThreadItems] = useState<Set<string>>(new Set()); // Track which thread items are expanded
  const [note, setNote] = useState<Note | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryType, setSummaryType] = useState<string>('tldr');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [sending, setSending] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [customRule, setCustomRule] = useState({ whenToUse: '', howToSummarize: '' });
  const [customRules, setCustomRules] = useState<Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>>([]);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [snoozeInput, setSnoozeInput] = useState<string>('');
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCustomRules().then(() => {
        // Fetch email after rules are loaded so we can use them for auto-summary
        fetchEmail();
      });
    }
  }, [id]);

  // Fetch note and thread emails after email is loaded
  useEffect(() => {
    if (email?.threadId) {
      fetchNote();
      fetchThreadEmails();
    }
  }, [email?.threadId, id]);
  
  // Default: only expand the most recent email in thread (current email)
  useEffect(() => {
    if (email?.id && threadEmails.length > 0) {
      // Sort by receivedAt descending to get most recent first
      const sorted = [...threadEmails].sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
      const mostRecentId = sorted[0]?.id;
      
      // Only expand the most recent email
      setExpandedThreadItems(new Set(mostRecentId ? [mostRecentId] : []));
    }
  }, [email?.id, threadEmails.length]);

  const fetchCustomRules = async () => {
    try {
      const response = await axios.get(`${API_URL}/summarize/rules`);
      setCustomRules(response.data);
    } catch (error) {
      console.error('Error fetching custom rules:', error);
    }
  };

  const fetchEmail = async () => {
    try {
      const response = await axios.get(`${API_URL}/emails/${id}`);
      const emailData = response.data;
      setEmail(emailData);
      
      // Auto-generate summary if it doesn't exist and isn't being processed
      if (!emailData.summary && !emailData.isProcessingSummary && !isGeneratingSummary) {
        // Auto-generate using first custom rule, or default to TL;DR
        const rules = customRules.length > 0 ? customRules : [];
        const defaultType = rules.length > 0 
          ? `custom-${rules[0].ruleId}` 
          : 'tldr';
        setSummaryType(defaultType);
        if (defaultType.startsWith('custom-')) {
          const ruleId = defaultType.split('-')[1];
          const rule = rules.find(r => r.ruleId === ruleId);
          if (rule) {
            handleUseCustomRule(rule);
          } else {
            // Fallback to TL;DR if rule not found
            handleSummarize('tldr');
          }
        } else {
          handleSummarize(defaultType);
        }
      } else if (emailData.summary) {
        // Use existing summary from database
        setSummary(emailData.summary);
        setSummaryType('tldr'); // Default type if we don't know what was used
        setSummaryCollapsed(false); // Show summary expanded by default
      }
      
      // Mark as read in parallel, don't wait for it
      axios.put(`${API_URL}/emails/${id}/read`).catch(err => console.error('Error marking as read:', err));
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchThreadEmails = async () => {
    if (!id) return;
    try {
      const response = await axios.get(`${API_URL}/emails/${id}/thread`);
      setThreadEmails(response.data || []);
    } catch (error) {
      console.error('Error fetching thread emails:', error);
      setThreadEmails([]);
    }
  };

  // Extract clean body without signatures and quoted replies
  const extractCleanBody = (emailBody: string): string => {
    if (!emailBody) return '';
    
    // Remove common quote markers
    // Patterns: "On ... wrote:", "From:", "Sent:", etc.
    const quotePatterns = [
      /^On\s+.*?\s+wrote:.*$/m, // "On [date] [name] wrote:"
      /^From:.*$/m,
      /^Sent:.*$/m,
      /^To:.*$/m,
      /^Subject:.*$/m,
      /^>+.*$/gm, // Lines starting with >
      /^-----Original Message-----.*$/m,
      /^________________________________.*$/m,
    ];

    let cleanBody = emailBody;
    
    // Remove quoted sections
    for (const pattern of quotePatterns) {
      cleanBody = cleanBody.replace(pattern, '');
    }
    
    // Remove common signature patterns
    const signaturePatterns = [
      /(?:\r?\n){2,}--\s*$/m, // "-- " at end
      /(?:\r?\n){2,}Best regards,.*$/s,
      /(?:\r?\n){2,}Regards,.*$/s,
      /(?:\r?\n){2,}Thanks,.*$/s,
      /(?:\r?\n){2,}Sincerely,.*$/s,
      /(?:\r?\n){2,}Kind regards,.*$/s,
      /(?:\r?\n){2,}Cheers,.*$/s,
      /(?:\r?\n){2,}[A-Z][a-z]+\s+[A-Z][a-z]+.*$/m, // Name patterns at end
    ];
    
    for (const pattern of signaturePatterns) {
      const match = cleanBody.match(pattern);
      if (match) {
        cleanBody = cleanBody.substring(0, match.index);
      }
    }
    
    // Clean up multiple newlines
    cleanBody = cleanBody.replace(/\n{3,}/g, '\n\n').trim();
    
    return cleanBody;
  };

  // Toggle thread item expansion
  const toggleThreadItem = (emailId: string) => {
    setExpandedThreadItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  };

  const fetchNote = async () => {
    if (!email?.threadId) return;
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
    setIsGeneratingSummary(true);
    setSummaryType(type);
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, { type });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error summarizing:', error);
      setSummary(null);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleCreateCustomRule = async () => {
    try {
      await axios.post(`${API_URL}/summarize/rules`, customRule);
      await fetchCustomRules();
      setShowRuleModal(false);
      // Use the rule immediately
      if (id) {
        await handleUseCustomRule(customRule);
      }
      setCustomRule({ whenToUse: '', howToSummarize: '' });
    } catch (error) {
      console.error('Error creating rule:', error);
    }
  };

  const handleUseCustomRule = async (rule: { whenToUse: string; howToSummarize: string; ruleId?: string }) => {
    if (!id) return;
    setIsGeneratingSummary(true);
    setSummaryType(rule.ruleId ? `custom-${rule.ruleId}` : 'custom');
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, {
        type: 'custom',
        customPrompt: rule.howToSummarize,
      });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error summarizing:', error);
      setSummary(null);
    } finally {
      setIsGeneratingSummary(false);
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

  const handleSendReply = async () => {
    if (!id || !draft) return;
    setSending(true);
    try {
      await axios.post(`${API_URL}/replies/send/${id}`, { reply: draft });
      setDraft(null); // Clear draft after sending
      alert('Reply sent successfully!');
      navigate('/inbox'); // Return to inbox
    } catch (error: any) {
      console.error('Error sending reply:', error);
      alert(error.response?.data?.message || 'Failed to send reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    
    // Optimistic update - navigate immediately for better UX
    navigate('/inbox');
    
    // Archive in background (don't wait for it)
    axios.put(`${API_URL}/emails/${id}/archive`).catch(error => {
      console.error('Error archiving email:', error);
      // Could show a toast notification here if needed
    });
  };

  const handleSnooze = async () => {
    if (!id || !snoozeInput.trim()) return;
    
    const duration = snoozeInput.trim();
    
    // Optimistic update - navigate immediately for better UX
    setSnoozeInput('');
    setShowSnoozeInput(false);
    navigate('/inbox');
    
    // Snooze in background (don't wait for it)
    axios.post(`${API_URL}/snooze/${id}`, { duration }).catch(error => {
      console.error('Error snoozing email:', error);
      // Could show a toast notification here if needed
    });
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
        disabled={processing || isGeneratingSummary}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: bg,
          color: color,
          border: 'none',
          borderRadius: theme.borderRadius.full,
          cursor: (processing || isGeneratingSummary) ? 'wait' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          transition: theme.transitions.fast,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          opacity: (processing || isGeneratingSummary) ? 0.7 : 1,
          boxShadow: theme.shadows.sm,
        }}
        onMouseEnter={(e) => !(processing || isGeneratingSummary) && (e.currentTarget.style.backgroundColor = hoverBg)}
        onMouseLeave={(e) => !(processing || isGeneratingSummary) && (e.currentTarget.style.backgroundColor = bg)}
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
          ⬅️
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
                📧 {email.subject}
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
                      👤 {email.fromName || email.from}
                    </div>
                    <div 
                      style={{ 
                        fontSize: theme.typography.fontSize.sm, 
                        color: theme.colors.text.primary,
                        opacity: 0.8,
                      }}
                      title={new Date(email.receivedAt).toLocaleString(undefined, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short',
                      })}
                    >
                      {humanizeTimestamp(email.receivedAt)}
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

            {/* Action Buttons: Reply, Archive, Snooze */}
            <div style={{
              marginBottom: theme.spacing.xl,
              display: 'flex',
              gap: theme.spacing.md,
              justifyContent: 'flex-end',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              {/* Reply buttons */}
              <button
                onClick={() => {
                  setDraft('');
                  handleGenerateDraft();
                }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>↩️</span>
                Reply
              </button>
              <button
                onClick={() => {
                  // TODO: Implement Reply All
                  alert('Reply All functionality coming soon');
                }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.background.subtle,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>↩️↩️</span>
                Reply All
              </button>
              <button
                onClick={() => {
                  // TODO: Implement Forward
                  alert('Forward functionality coming soon');
                }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.background.subtle,
                  color: theme.colors.text.primary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>↪️</span>
                Forward
              </button>
              
              <div style={{ width: '1px', height: '24px', backgroundColor: theme.colors.border.medium }} />
              
              {/* Snooze */}
              {showSnoozeInput ? (
                <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="2h, tomorrow..."
                    value={snoozeInput}
                    onChange={(e) => setSnoozeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSnooze();
                      if (e.key === 'Escape') {
                        setShowSnoozeInput(false);
                        setSnoozeInput('');
                      }
                    }}
                    autoFocus
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      border: `1px solid ${theme.colors.primary.main}`,
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.fontSize.sm,
                      width: '120px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleSnooze}
                    disabled={!snoozeInput.trim()}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: theme.colors.primary.main,
                      color: 'white',
                      border: 'none',
                      borderRadius: theme.borderRadius.sm,
                      cursor: snoozeInput.trim() ? 'pointer' : 'not-allowed',
                      fontSize: theme.typography.fontSize.sm,
                      opacity: snoozeInput.trim() ? 1 : 0.6,
                    }}
                  >
                    Snooze
                  </button>
                  <button
                    onClick={() => {
                      setShowSnoozeInput(false);
                      setSnoozeInput('');
                    }}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      backgroundColor: 'transparent',
                      color: theme.colors.text.secondary,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSnoozeInput(true)}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                    backgroundColor: 'transparent',
                    color: theme.colors.text.secondary,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    fontWeight: theme.typography.fontWeight.medium,
                    cursor: 'pointer',
                    fontSize: theme.typography.fontSize.sm,
                    display: 'flex',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                  }}
                >
                  <span>📥</span>
                  Snooze
                </button>
              )}
              
              {/* Archive */}
              <button
                onClick={handleArchive}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <span>📦</span>
                Archive
              </button>
            </div>

            {/* AI Output Area - Always show, even when empty */}
            <div className="animate-fade-in" style={{
              backgroundColor: theme.colors.primary.subtle,
              padding: theme.spacing.xl,
              borderRadius: theme.borderRadius.lg,
              marginBottom: theme.spacing.xl,
              borderLeft: `4px solid ${theme.colors.primary.main}`,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: summaryCollapsed ? 0 : theme.spacing.sm }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                  <span>🤖</span>
                  <strong style={{ color: theme.colors.primary.dark }}>AI Summary</strong>
                  <button
                    onClick={() => setSummaryCollapsed(!summaryCollapsed)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      padding: theme.spacing.xs,
                    }}
                    title={summaryCollapsed ? 'Expand summary' : 'Collapse summary'}
                  >
                    {summaryCollapsed ? '▶' : '▼'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                  <select
                    value={summaryType}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setShowRuleModal(true);
                      } else if (e.target.value.startsWith('custom-')) {
                        const ruleId = e.target.value.split('-')[1];
                        const rule = customRules.find(r => r.ruleId === ruleId);
                        if (rule) {
                          handleUseCustomRule(rule);
                        }
                      } else {
                        handleSummarize(e.target.value);
                      }
                    }}
                    disabled={isGeneratingSummary}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.fontSize.sm,
                      backgroundColor: 'white',
                      cursor: isGeneratingSummary ? 'wait' : 'pointer',
                    }}
                  >
                    <option value="tldr">TL;DR</option>
                    <option value="bullet-points">Key Points</option>
                    <option value="action-items">Action Items</option>
                    <option value="sender-request">Sender Request</option>
                    {customRules.length > 0 && (
                      <>
                        <optgroup label="Custom Rules">
                          {customRules.map((rule) => (
                            <option key={rule.ruleId} value={`custom-${rule.ruleId}`}>
                              {rule.whenToUse}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    )}
                    <option value="custom">+ Create Custom Rule...</option>
                  </select>
                  {isGeneratingSummary && (
                    <span style={{
                      display: 'inline-block',
                      width: '16px',
                      height: '16px',
                      border: `2px solid ${theme.colors.primary.main}`,
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
                  )}
                </div>
              </div>
              {!summaryCollapsed && (
                <>
              {isGeneratingSummary ? (
                <div style={{
                  padding: theme.spacing.xl,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                }}>
                  <div style={{
                    display: 'inline-block',
                    width: '24px',
                    height: '24px',
                    border: `3px solid ${theme.colors.primary.main}`,
                    borderTop: '3px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: theme.spacing.md,
                  }} />
                  <div>✨ Generating summary...</div>
                </div>
              ) : summary ? (
                <div style={{ whiteSpace: 'pre-wrap', color: theme.colors.text.primary, lineHeight: theme.typography.lineHeight.relaxed }}>
                  {summary}
                </div>
              ) : email?.isProcessingSummary ? (
                <div style={{
                  padding: theme.spacing.lg,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                }}>
                  <div style={{
                    display: 'inline-block',
                    width: '20px',
                    height: '20px',
                    border: `2px solid ${theme.colors.primary.main}`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginRight: theme.spacing.sm,
                  }} />
                  ✨ Generating summary...
                </div>
              ) : (
                <div style={{
                  padding: theme.spacing.lg,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                  fontStyle: 'italic',
                }}>
                  📝 No summary yet. Select a summary type above to generate one.
                </div>
              )}
                </>
              )}
            </div>

            {/* Threaded Email View */}
            {threadEmails.length > 0 ? (
              <div style={{ marginBottom: theme.spacing.xl }}>
                <h3 style={{
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.semibold,
                  color: theme.colors.text.primary,
                  marginBottom: theme.spacing.lg,
                }}>
                  💬 Thread ({threadEmails.length} {threadEmails.length === 1 ? 'message' : 'messages'})
                </h3>
                {threadEmails.map((threadEmail, index) => {
                  const isExpanded = expandedThreadItems.has(threadEmail.id);
                  const isCurrentEmail = threadEmail.id === email.id;
                  const cleanBody = extractCleanBody(threadEmail.body);
                  const hasQuotedContent = threadEmail.body.length > cleanBody.length * 1.2; // Rough check for quoted content
                  
                  return (
                    <div
                      key={threadEmail.id}
                      style={{
                        marginBottom: theme.spacing.lg,
                        border: isCurrentEmail ? `2px solid ${theme.colors.primary.main}` : `1px solid ${theme.colors.border.light}`,
                        borderRadius: theme.borderRadius.lg,
                        overflow: 'hidden',
                        backgroundColor: isCurrentEmail ? theme.colors.primary.subtle : theme.colors.background.paper,
                      }}
                    >
                      {/* Email Header (always visible) */}
                      <div
                        onClick={() => !isCurrentEmail && toggleThreadItem(threadEmail.id)}
                        style={{
                          padding: theme.spacing.md,
                          cursor: isCurrentEmail ? 'default' : 'pointer',
                          backgroundColor: isCurrentEmail ? theme.colors.primary.light : theme.colors.background.subtle,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontWeight: theme.typography.fontWeight.semibold,
                            color: theme.colors.text.primary,
                            marginBottom: theme.spacing.xs,
                          }}>
                            {threadEmail.fromName || threadEmail.from}
                          </div>
                          <div 
                            style={{
                              fontSize: theme.typography.fontSize.sm,
                              color: theme.colors.text.primary, // Better contrast
                              opacity: 0.8,
                            }}
                            title={new Date(threadEmail.receivedAt).toLocaleString(undefined, {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              timeZoneName: 'short',
                            })}
                          >
                            {humanizeTimestamp(threadEmail.receivedAt)}
                          </div>
                        </div>
                        {!isCurrentEmail && (
                          <div style={{
                            fontSize: theme.typography.fontSize.sm,
                            color: theme.colors.text.secondary,
                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                            backgroundColor: theme.colors.background.paper,
                            borderRadius: theme.borderRadius.md,
                          }}>
                            {isExpanded ? '▼' : '▶'}
                          </div>
                        )}
                      </div>
                      
                      {/* Email Body (expandable) */}
                      {(isCurrentEmail || isExpanded) ? (
                        <div style={{
                          padding: theme.spacing.lg,
                          color: theme.colors.text.primary,
                          lineHeight: '1.8',
                          fontSize: theme.typography.fontSize.lg,
                          fontWeight: theme.typography.fontWeight.normal,
                        }}>
                          {(threadEmail as any).htmlBody ? (
                            <div 
                              style={{
                                maxWidth: '100%',
                                overflow: 'auto',
                                isolation: 'isolate',
                              }}
                              dangerouslySetInnerHTML={{ 
                                __html: DOMPurify.sanitize(
                                  (threadEmail as any).htmlBody.replace(/<style([^>]*)>/gi, '<style$1 scoped>'),
                                  {
                                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'img', 'table', 'tr', 'td', 'th', 'style'],
                                    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'scoped'],
                                    ALLOW_DATA_ATTR: false,
                                  }
                                )
                              }} 
                            />
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap' }}>
                              {cleanBody || threadEmail.body}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{
                          padding: theme.spacing.md,
                          color: theme.colors.text.secondary,
                          fontSize: theme.typography.fontSize.base,
                          fontStyle: 'italic',
                          lineHeight: '1.6',
                        }}>
                          {cleanBody.substring(0, 100)}...
                          {cleanBody.length > 100 && (
                            <span style={{ color: theme.colors.primary.main }}> (click to expand)</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single Email View (fallback if thread not loaded) */
              <div style={{
                color: theme.colors.text.primary,
                lineHeight: '1.8',
                fontSize: theme.typography.fontSize.lg,
                marginBottom: theme.spacing.xl,
              }}>
                {email.htmlBody ? (
                  <div 
                    style={{
                      // Scope CSS to prevent conflicts
                      maxWidth: '100%',
                      overflow: 'auto',
                      // Prevent CSS from affecting the page
                      isolation: 'isolate',
                    }}
                    dangerouslySetInnerHTML={{ 
                      __html: DOMPurify.sanitize(
                        email.htmlBody.replace(/<style([^>]*)>/gi, '<style$1 scoped>'),
                        {
                          // Allow style tags but scope them
                          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'img', 'table', 'tr', 'td', 'th', 'style'],
                          ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'scoped'],
                          // Keep relative URLs safe
                          ALLOW_DATA_ATTR: false,
                        }
                      )
                    }} 
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {extractCleanBody(email.body) || email.body}
                  </div>
                )}
              </div>
            )}

            {/* Draft Area */}
            {draft && (
              <div className="animate-fade-in" style={{
                marginTop: theme.spacing['2xl'],
                paddingTop: theme.spacing.xl,
                borderTop: `1px solid ${theme.colors.border.light}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                  <span>✍️</span>
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
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !draft.trim()}
                    style={{
                      padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                      backgroundColor: sending || !draft.trim() ? theme.colors.border.medium : theme.colors.primary.main,
                      color: 'white',
                      border: 'none',
                      borderRadius: theme.borderRadius.md,
                      fontWeight: theme.typography.fontWeight.semibold,
                      cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer',
                      opacity: sending || !draft.trim() ? 0.7 : 1,
                    }}
                  >
                    {sending ? '📤 Sending...' : '📤 Send Reply'}
                  </button>
                  <button
                    onClick={() => setDraft(null)}
                    disabled={sending}
                    style={{
                      padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                      backgroundColor: 'transparent',
                      color: theme.colors.text.secondary,
                      border: `1px solid ${theme.colors.border.medium}`,
                      borderRadius: theme.borderRadius.md,
                      fontWeight: theme.typography.fontWeight.medium,
                      cursor: sending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
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
              📝 Private Notes
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

      {/* Custom Rule Modal */}
      {showRuleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing['2xl'],
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            maxWidth: '600px',
            width: '90%',
          }}>
            <h2 style={{
              marginBottom: theme.spacing.lg,
              color: theme.colors.text.primary,
            }}>
              Create Custom Summarization Rule
            </h2>
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{
                display: 'block',
                marginBottom: theme.spacing.xs,
                color: theme.colors.text.primary,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                When should this rule be used? (e.g., "For emails from my manager", "For meeting requests")
              </label>
              <textarea
                value={customRule.whenToUse}
                onChange={(e) => setCustomRule({ ...customRule, whenToUse: e.target.value })}
                placeholder="Describe when to use this rule..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: theme.spacing.md,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily,
                }}
              />
            </div>
            <div style={{ marginBottom: theme.spacing.xl }}>
              <label style={{
                display: 'block',
                marginBottom: theme.spacing.xs,
                color: theme.colors.text.primary,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                How should the email be summarized? (e.g., "Extract only deadlines and action items", "Summarize in 3 bullet points")
              </label>
              <textarea
                value={customRule.howToSummarize}
                onChange={(e) => setCustomRule({ ...customRule, howToSummarize: e.target.value })}
                placeholder="Describe how to summarize..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: theme.spacing.md,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRuleModal(false);
                  setCustomRule({ whenToUse: '', howToSummarize: '' });
                }}
                style={{
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleCreateCustomRule();
                }}
                disabled={!customRule.whenToUse || !customRule.howToSummarize}
                style={{
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  backgroundColor: customRule.whenToUse && customRule.howToSummarize ? theme.colors.primary.main : theme.colors.border.dark,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: customRule.whenToUse && customRule.howToSummarize ? 'pointer' : 'not-allowed',
                  fontWeight: theme.typography.fontWeight.semibold,
                }}
              >
                Create & Use
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailDetail;
