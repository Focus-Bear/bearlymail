import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Email {
  id: string;
  subject: string;
  from: string;
  fromName?: string;
  body: string;
  receivedAt: string;
  priorityScore?: number;
  starCount?: number;
}

const Search: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const response = await axios.get(`${API_URL}/emails/search`, {
        params: { q: query, maxResults: 50 },
      });
      setSearchResults(response.data);
    } catch (error: any) {
      console.error('Error searching emails:', error);
      if (error.response?.status === 401) {
        alert('Please log in again to search emails.');
        navigate('/login');
      } else {
        alert('Error searching emails. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (score?: number) => {
    if (!score) return { label: 'N/A', color: theme.colors.text.tertiary, bg: theme.colors.background.subtle };
    if (score >= 80) return { label: 'High', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
    if (score >= 60) return { label: 'Medium', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
    return { label: 'Low', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.1)' };
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: theme.spacing.lg,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.paper,
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h1 style={{
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
          }}>
            Search Emails
          </h1>
          <button
            onClick={() => navigate('/inbox')}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: 'transparent',
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
            }}
          >
            ← Back to Inbox
          </button>
        </div>
      </header>

      {/* Search Form */}
      <div style={{
        padding: theme.spacing.xl,
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}>
        <form onSubmit={handleSearch} style={{ marginBottom: theme.spacing.xl }}>
          <div style={{
            display: 'flex',
            gap: theme.spacing.md,
            alignItems: 'center',
          }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emails (e.g., 'from:john@example.com', 'subject:meeting', 'has:attachment')"
              style={{
                flex: 1,
                padding: theme.spacing.md,
                border: `2px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontFamily: theme.typography.fontFamily,
              }}
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              style={{
                padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                backgroundColor: loading || !query.trim() ? theme.colors.text.tertiary : theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <p style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}>
            💡 Use Gmail search syntax: from:, to:, subject:, has:attachment, before:, after:, etc.
          </p>
        </form>

        {/* Search Results */}
        {hasSearched && (
          <div>
            {loading ? (
              <div style={{
                textAlign: 'center',
                padding: theme.spacing['3xl'],
                color: theme.colors.text.secondary,
              }}>
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: theme.spacing['3xl'],
                backgroundColor: theme.colors.background.paper,
                borderRadius: theme.borderRadius.lg,
                border: `1px dashed ${theme.colors.border.medium}`,
              }}>
                <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>🔍</div>
                <h3 style={{
                  color: theme.colors.text.primary,
                  marginBottom: theme.spacing.sm,
                }}>
                  No emails found
                </h3>
                <p style={{ color: theme.colors.text.secondary }}>
                  Try adjusting your search query or using different keywords.
                </p>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: theme.spacing.md,
              }}>
                <div style={{
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.sm,
                  marginBottom: theme.spacing.sm,
                }}>
                  Found {searchResults.length} email{searchResults.length !== 1 ? 's' : ''}
                </div>
                {searchResults.map((email) => {
                  const priority = getPriorityBadge(email.priorityScore);
                  return (
                    <div
                      key={email.id}
                      onClick={() => navigate(`/email/${email.id}`)}
                      style={{
                        backgroundColor: theme.colors.background.paper,
                        borderRadius: theme.borderRadius.lg,
                        padding: theme.spacing.lg,
                        border: `1px solid ${theme.colors.border.light}`,
                        cursor: 'pointer',
                        transition: theme.transitions.default,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = theme.shadows.md;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, flex: 1 }}>
                          <strong style={{
                            color: theme.colors.text.primary,
                            fontSize: theme.typography.fontSize.base,
                          }}>
                            {email.fromName || email.from}
                          </strong>
                          {email.priorityScore !== undefined && (
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
                          )}
                          {email.starCount && email.starCount > 0 && (
                            <span style={{ color: theme.colors.accent.warning }}>
                              {'⭐'.repeat(email.starCount)}
                            </span>
                          )}
                        </div>
                        <span style={{
                          fontSize: theme.typography.fontSize.xs,
                          color: theme.colors.text.tertiary,
                        }}>
                          {new Date(email.receivedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{
                        color: theme.colors.text.primary,
                        fontSize: theme.typography.fontSize.lg,
                        fontWeight: theme.typography.fontWeight.bold,
                        marginBottom: theme.spacing.sm,
                      }}>
                        {email.subject}
                      </div>
                      <div style={{
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.fontSize.sm,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {email.body.substring(0, 200)}...
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;

