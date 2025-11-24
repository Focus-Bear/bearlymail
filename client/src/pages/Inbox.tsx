import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  priorityScore: number;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil?: string;
  receivedAt: string;
}

const Inbox: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBatched, setShowBatched] = useState(false);
  const [snoozeInput, setSnoozeInput] = useState<{ [key: number]: string }>({});
  const [showSnoozeInput, setShowSnoozeInput] = useState<number | null>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchEmails();
  }, [showBatched]);

  const fetchEmails = async () => {
    try {
      const response = await axios.get(`${API_URL}/emails/inbox?includeBatched=${showBatched}`);
      setEmails(response.data);
    } catch (error) {
      console.error('Error fetching emails:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSnooze = async (emailId: number) => {
    const duration = snoozeInput[emailId];
    if (!duration) return;

    try {
      await axios.post(`${API_URL}/snooze/${emailId}`, { duration });
      setShowSnoozeInput(null);
      setSnoozeInput({ ...snoozeInput, [emailId]: '' });
      fetchEmails();
    } catch (error) {
      console.error('Error snoozing email:', error);
    }
  };

  const handleMarkAsRead = async (emailId: number) => {
    try {
      await axios.put(`${API_URL}/emails/${emailId}/read`);
      // Update local state instantly for better UX
      setEmails(emails.map(e => e.id === emailId ? { ...e, isRead: true } : e));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleForceCheck = async () => {
    setRefreshing(true);
    try {
      await axios.post(`${API_URL}/emails/force-check`);
      fetchEmails();
    } catch (error) {
      console.error('Error forcing check:', error);
      setRefreshing(false);
    }
  };

  const getPriorityBadge = (score: number) => {
    if (score >= 80) return { color: theme.colors.accent.error, label: 'High Priority', bg: '#FEE2E2' };
    if (score >= 60) return { color: theme.colors.accent.warning, label: 'Medium', bg: '#FEF3C7' };
    return { color: theme.colors.secondary.main, label: 'Low', bg: '#D1FAE5' };
  };

  const SidebarItem: React.FC<{ label: string; path: string; active?: boolean; onClick?: () => void }> = ({ label, path, active, onClick }) => (
    <button
      onClick={onClick || (() => navigate(path))}
      style={{
        width: '100%',
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        marginBottom: theme.spacing.xs,
        backgroundColor: active ? theme.colors.primary.subtle : 'transparent',
        color: active ? theme.colors.primary.main : theme.colors.text.secondary,
        border: 'none',
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.base,
        fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        transition: theme.transitions.fast,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = theme.colors.background.default;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {label}
    </button>
  );

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
        Loading your inbox...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
    }}>
      {/* Sidebar */}
      <div style={{
        width: '280px',
        backgroundColor: theme.colors.background.paper,
        borderRight: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.lg,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ marginBottom: theme.spacing['2xl'], paddingLeft: theme.spacing.md }}>
          <h2 style={{
            color: theme.colors.primary.main,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            letterSpacing: '-0.02em',
          }}>
            FocusMail
          </h2>
        </div>
        
        <nav style={{ flex: 1 }}>
          <SidebarItem label="Inbox" path="/inbox" active={location.pathname === '/inbox'} />
          <SidebarItem label="Settings" path="/settings" active={location.pathname === '/settings'} />
        </nav>

        <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.md }}>
          <div style={{
            padding: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.sm,
          }}>
            {user?.email}
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              backgroundColor: 'transparent',
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              transition: theme.transitions.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.text.primary;
              e.currentTarget.style.color = theme.colors.text.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border.medium;
              e.currentTarget.style.color = theme.colors.text.secondary;
            }}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          padding: `${theme.spacing.lg} ${theme.spacing['2xl']}`,
          backgroundColor: theme.colors.background.paper, // Or transparent if you prefer
          borderBottom: `1px solid ${theme.colors.border.light}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.bold,
              marginBottom: theme.spacing.xs,
            }}>
              Inbox
            </h1>
            <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
              {emails.length} messages prioritized for you
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <button
              onClick={() => setShowBatched(!showBatched)}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: showBatched ? theme.colors.secondary.subtle : 'transparent',
                color: showBatched ? theme.colors.secondary.dark : theme.colors.text.secondary,
                border: `1px solid ${showBatched ? theme.colors.secondary.main : theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.full,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                transition: theme.transitions.fast,
              }}
            >
              {showBatched ? 'Hide Batched' : 'Show Batched'}
            </button>

            <button
              onClick={handleForceCheck}
              disabled={refreshing}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.full,
                cursor: refreshing ? 'wait' : 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                boxShadow: theme.shadows.sm,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                opacity: refreshing ? 0.7 : 1,
                transition: theme.transitions.fast,
              }}
              onMouseEnter={(e) => !refreshing && (e.currentTarget.style.backgroundColor = theme.colors.primary.dark)}
              onMouseLeave={(e) => !refreshing && (e.currentTarget.style.backgroundColor = theme.colors.primary.main)}
            >
              {refreshing ? 'Syncing...' : 'Refresh Emails'}
            </button>
          </div>
        </header>

        {/* Email List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing['2xl'] }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            {emails.length === 0 ? (
              <div style={{
                padding: theme.spacing['3xl'],
                textAlign: 'center',
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.xl,
                border: `1px dashed ${theme.colors.border.medium}`,
              }}>
                <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>📭</div>
                <h3 style={{ 
                  color: theme.colors.text.primary, 
                  marginBottom: theme.spacing.sm,
                  fontWeight: theme.typography.fontWeight.semibold 
                }}>
                  Inbox Zero!
                </h3>
                <p style={{ color: theme.colors.text.secondary }}>
                  You're all caught up. Enjoy your focus time.
                </p>
              </div>
            ) : (
              emails.map((email) => {
                const priority = getPriorityBadge(email.priorityScore);
                return (
                  <div
                    key={email.id}
                    onClick={() => {
                      handleMarkAsRead(email.id);
                      navigate(`/email/${email.id}`);
                    }}
                    className="animate-fade-in"
                    style={{
                      backgroundColor: theme.colors.background.paper,
                      borderRadius: theme.borderRadius.lg,
                      padding: theme.spacing.lg,
                      border: `1px solid ${email.isRead ? theme.colors.border.light : theme.colors.primary.light}`,
                      borderLeft: email.isRead ? `1px solid ${theme.colors.border.light}` : `4px solid ${theme.colors.primary.main}`,
                      boxShadow: theme.shadows.sm,
                      cursor: 'pointer',
                      transition: theme.transitions.default,
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = theme.shadows.md;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = theme.shadows.sm;
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
                        <strong style={{
                          color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
                          fontSize: theme.typography.fontSize.base,
                          fontWeight: theme.typography.fontWeight.semibold,
                        }}>
                          {email.fromName || email.from}
                        </strong>
                        <span style={{
                          fontSize: theme.typography.fontSize.xs,
                          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                          backgroundColor: priority.bg,
                          color: priority.color,
                          borderRadius: theme.borderRadius.full,
                          fontWeight: theme.typography.fontWeight.medium,
                        }}>
                          {priority.label} ({email.priorityScore.toFixed(0)})
                        </span>
                      </div>
                      <span style={{
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.text.tertiary,
                      }}>
                        {new Date(email.receivedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{
                      color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.lg,
                      fontWeight: email.isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.bold,
                      marginBottom: theme.spacing.sm,
                    }}>
                      {email.subject}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <div style={{
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.fontSize.sm,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '600px',
                        lineHeight: theme.typography.lineHeight.relaxed,
                      }}>
                        {email.body.substring(0, 120)}...
                      </div>

                      <div style={{ display: 'flex', gap: theme.spacing.sm }} onClick={(e) => e.stopPropagation()}>
                        {showSnoozeInput === email.id ? (
                          <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="2h, tomorrow..."
                              autoFocus
                              value={snoozeInput[email.id] || ''}
                              onChange={(e) => setSnoozeInput({ ...snoozeInput, [email.id]: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSnooze(email.id);
                                if (e.key === 'Escape') setShowSnoozeInput(null);
                              }}
                              style={{
                                padding: theme.spacing.xs,
                                borderRadius: theme.borderRadius.sm,
                                border: `1px solid ${theme.colors.primary.main}`,
                                fontSize: theme.typography.fontSize.sm,
                                width: '100px',
                                outline: 'none',
                              }}
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowSnoozeInput(email.id)}
                            style={{
                              color: theme.colors.text.tertiary,
                              backgroundColor: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: theme.typography.fontSize.xs,
                              fontWeight: theme.typography.fontWeight.medium,
                              padding: theme.spacing.xs,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = theme.colors.primary.main}
                            onMouseLeave={(e) => e.currentTarget.style.color = theme.colors.text.tertiary}
                          >
                            Snooze
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inbox;
