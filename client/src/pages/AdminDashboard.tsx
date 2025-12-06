import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface WaitlistEntry {
  id: string;
  email: string;
  firstName: string;
  reason: string;
  approved: boolean;
  createdAt: string;
}

interface UserWithSubscription {
  id: string;
  email: string;
  name: string;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  trialStartedAt: string | null;
  createdAt: string;
}

const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [activeTab, setActiveTab] = useState<'waitlist' | 'subscriptions'>('waitlist');
  const [loading, setLoading] = useState(true);
  const [extendingUserId, setExtendingUserId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<number>(7);
  const navigate = useNavigate();

  const fetchWaitlist = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/waitlist`);
      setWaitlist(response.data);
    } catch (error) {
      console.error('Error fetching waitlist:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/subscriptions/all-users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, []);

  useEffect(() => {
    if (!user?.isAdmin) {
      navigate('/inbox');
      return;
    }
    fetchWaitlist();
    fetchUsers();
  }, [user, navigate, fetchWaitlist, fetchUsers]);

  const handleExtendTrial = async (userId: string) => {
    try {
      await axios.post(`${API_URL}/subscriptions/extend-trial`, {
        userId,
        days: extendDays,
      });
      alert(`Trial extended by ${extendDays} days successfully!`);
      setExtendingUserId(null);
      setExtendDays(7);
      await fetchUsers();
    } catch (error: any) {
      console.error('Error extending trial:', error);
      alert(error.response?.data?.message || 'Failed to extend trial');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await axios.put(`${API_URL}/waitlist/${id}/approve`);
      await fetchWaitlist(); // Refresh list
    } catch (error) {
      console.error('Error approving:', error);
    }
  };

  const pending = waitlist.filter(w => !w.approved);
  const approved = waitlist.filter(w => w.approved);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      padding: theme.spacing.xl,
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing['2xl'],
        }}>
          <div>
            <h1 style={{
              fontSize: theme.typography.fontSize['3xl'],
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.xs,
            }}>
              Admin Dashboard
            </h1>
            <p style={{ color: theme.colors.text.secondary }}>
              Manage waitlist and user subscriptions
            </p>
          </div>
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <button
              onClick={() => navigate('/inbox')}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: 'transparent',
                color: theme.colors.text.secondary,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
              }}
            >
              Back to Inbox
            </button>
            <button
              onClick={logout}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.accent.error,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.xl,
          borderBottom: `2px solid ${theme.colors.border.light}`,
        }}>
          <button
            onClick={() => setActiveTab('waitlist')}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              backgroundColor: 'transparent',
              color: activeTab === 'waitlist' ? theme.colors.primary.main : theme.colors.text.secondary,
              border: 'none',
              borderBottom: activeTab === 'waitlist' ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'waitlist' ? theme.typography.fontWeight.semibold : 'normal',
              marginBottom: '-2px',
            }}
          >
            Waitlist
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              backgroundColor: 'transparent',
              color: activeTab === 'subscriptions' ? theme.colors.primary.main : theme.colors.text.secondary,
              border: 'none',
              borderBottom: activeTab === 'subscriptions' ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'subscriptions' ? theme.typography.fontWeight.semibold : 'normal',
              marginBottom: '-2px',
            }}
          >
            Subscriptions
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>
            Loading...
          </div>
        ) : activeTab === 'waitlist' ? (
          <>
            {/* Pending Requests */}
            <section style={{ marginBottom: theme.spacing['2xl'] }}>
              <h2 style={{
                fontSize: theme.typography.fontSize.xl,
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.lg,
              }}>
                Pending Approval ({pending.length})
              </h2>
              {pending.length === 0 ? (
                <div style={{
                  padding: theme.spacing.xl,
                  backgroundColor: theme.colors.background.paper,
                  borderRadius: theme.borderRadius.md,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                }}>
                  No pending requests
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                  {pending.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        backgroundColor: theme.colors.background.paper,
                        padding: theme.spacing.lg,
                        borderRadius: theme.borderRadius.md,
                        boxShadow: theme.shadows.sm,
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
                          {entry.firstName} ({entry.email})
                        </div>
                        <div style={{
                          color: theme.colors.text.secondary,
                          fontSize: theme.typography.fontSize.sm,
                          marginBottom: theme.spacing.sm,
                        }}>
                          {entry.reason}
                        </div>
                        <div style={{
                          color: theme.colors.text.tertiary,
                          fontSize: theme.typography.fontSize.xs,
                        }}>
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleApprove(entry.id)}
                        style={{
                          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                          backgroundColor: theme.colors.secondary.main,
                          color: 'white',
                          border: 'none',
                          borderRadius: theme.borderRadius.md,
                          cursor: 'pointer',
                          fontWeight: theme.typography.fontWeight.medium,
                        }}
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Approved */}
            <section>
              <h2 style={{
                fontSize: theme.typography.fontSize.xl,
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.lg,
              }}>
                Approved ({approved.length})
              </h2>
              {approved.length === 0 ? (
                <div style={{
                  padding: theme.spacing.xl,
                  backgroundColor: theme.colors.background.paper,
                  borderRadius: theme.borderRadius.md,
                  textAlign: 'center',
                  color: theme.colors.text.secondary,
                }}>
                  No approved entries yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                  {approved.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        backgroundColor: theme.colors.background.paper,
                        padding: theme.spacing.lg,
                        borderRadius: theme.borderRadius.md,
                        boxShadow: theme.shadows.sm,
                        opacity: 0.7,
                      }}
                    >
                      <div style={{
                        fontWeight: theme.typography.fontWeight.semibold,
                        color: theme.colors.text.primary,
                        marginBottom: theme.spacing.xs,
                      }}>
                        {entry.firstName} ({entry.email}) ✓
                      </div>
                      <div style={{
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.fontSize.sm,
                      }}>
                        {entry.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          /* Subscriptions Tab */
          <section>
            <h2 style={{
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.lg,
            }}>
              All Users ({users.length})
            </h2>
            {users.length === 0 ? (
              <div style={{
                padding: theme.spacing.xl,
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.md,
                textAlign: 'center',
                color: theme.colors.text.secondary,
              }}>
                No users found
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                {users.map((userData) => (
                  <div
                    key={userData.id}
                    style={{
                      backgroundColor: theme.colors.background.paper,
                      padding: theme.spacing.lg,
                      borderRadius: theme.borderRadius.md,
                      boxShadow: theme.shadows.sm,
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: theme.typography.fontWeight.semibold,
                          color: theme.colors.text.primary,
                          marginBottom: theme.spacing.xs,
                        }}>
                          {userData.name || 'No name'} ({userData.email})
                        </div>
                        <div style={{
                          display: 'flex',
                          gap: theme.spacing.lg,
                          marginBottom: theme.spacing.sm,
                        }}>
                          <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                            <strong>Status:</strong> {userData.subscriptionStatus || 'none'}
                          </div>
                          {userData.subscriptionExpiresAt && (
                            <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                              <strong>Expires:</strong> {new Date(userData.subscriptionExpiresAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div style={{
                          color: theme.colors.text.tertiary,
                          fontSize: theme.typography.fontSize.xs,
                        }}>
                          Joined: {new Date(userData.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                        {extendingUserId === userData.id ? (
                          <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                            <input
                              type="number"
                              value={extendDays}
                              onChange={(e) => setExtendDays(parseInt(e.target.value) || 7)}
                              min="1"
                              style={{
                                width: '80px',
                                padding: theme.spacing.xs,
                                border: `1px solid ${theme.colors.border.medium}`,
                                borderRadius: theme.borderRadius.sm,
                              }}
                            />
                            <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>days</span>
                            <button
                              onClick={() => handleExtendTrial(userData.id)}
                              style={{
                                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                backgroundColor: theme.colors.primary.main,
                                color: 'white',
                                border: 'none',
                                borderRadius: theme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: theme.typography.fontSize.sm,
                              }}
                            >
                              Extend
                            </button>
                            <button
                              onClick={() => {
                                setExtendingUserId(null);
                                setExtendDays(7);
                              }}
                              style={{
                                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                backgroundColor: 'transparent',
                                color: theme.colors.text.secondary,
                                border: `1px solid ${theme.colors.border.medium}`,
                                borderRadius: theme.borderRadius.sm,
                                cursor: 'pointer',
                                fontSize: theme.typography.fontSize.sm,
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setExtendingUserId(userData.id)}
                            style={{
                              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                              backgroundColor: theme.colors.secondary.main,
                              color: 'white',
                              border: 'none',
                              borderRadius: theme.borderRadius.md,
                              cursor: 'pointer',
                              fontSize: theme.typography.fontSize.sm,
                            }}
                          >
                            Extend Trial
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;

