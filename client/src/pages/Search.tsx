import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';
import { captureEvent } from '../utils/posthog';

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
  searchExplanation?: string;
  relevanceScore?: number;
  scoreBreakdown?: {
    baseRelevanceScore: number;
    recencyAdjustment: number;
    finalScore: number;
    rejectionReason?: string;
  };
  debugInfo?: {
    originalQuery: string;
    gmailQuery: string;
    queriesTried?: Array<{ query: string; resultCount: number }>;
    totalRawEmails: number;
    maxResultsRequested: number;
    filteredCount: number;
    rejectedCount?: number;
    allRawEmails: Array<{
      index: number;
      from: string;
      subject: string;
      receivedAt: string;
      daysAgo: number;
      aiScore: number | null;
      scoreBreakdown?: {
        baseRelevanceScore: number;
        recencyAdjustment: number;
        finalScore: number;
        rejectionReason?: string;
      };
      includedInResults: boolean;
    }>;
    rejectedEmails?: Array<{
      index: number;
      from: string;
      subject: string;
      receivedAt: string;
      daysAgo: number;
      aiScore: number | null;
      scoreBreakdown?: {
        baseRelevanceScore: number;
        recencyAdjustment: number;
        finalScore: number;
        rejectionReason?: string;
      };
      rejectionReason: string;
    }>;
  };
}

const Search: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [selectedScoreBreakdown, setSelectedScoreBreakdown] = useState<{
    email: Email;
    breakdown: NonNullable<Email['scoreBreakdown']>;
  } | null>(null);

  // Track search view
  useEffect(() => {
    captureEvent('search_viewed');
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    
    // Show progress steps with timing
    const steps = [
      { delay: 0, message: 'Crafting search query for Gmail...' },
      { delay: 800, message: 'Searching for emails in Gmail...' },
      { delay: 2000, message: 'Filtering emails with AI...' },
      { delay: 3500, message: 'Generating explanations...' },
    ];
    
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentStep = steps
        .slice()
        .reverse()
        .find(step => elapsed >= step.delay);
      if (currentStep) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Search.tsx:68',message:'Progress step update',data:{elapsed,currentStep:currentStep.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        setProgressStep(currentStep.message);
      }
    }, 100);
    
    try {
      const response = await axios.get(`${API_URL}/emails/search`, {
        params: { q: query, maxResults: 50 },
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Search.tsx:73',message:'Search API response received',data:{resultCount:response.data?.length,firstEmailHasExplanation:!!response.data?.[0]?.searchExplanation,firstEmailExplanation:response.data?.[0]?.searchExplanation?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      clearInterval(progressInterval);
      setProgressStep('');
      // Log for debugging
      if (response.data && response.data.length > 0 && response.data[0].id === 'no-results') {
        console.log('No results marker received:', response.data[0]);
        console.log('Queries tried:', response.data[0].debugInfo?.queriesTried);
      }
      setSearchResults(response.data);
      captureEvent('search_performed', {
        query_length: query.trim().length,
        has_query: !!query.trim(),
        result_count: response.data?.length || 0,
      });
    } catch (error: any) {
      clearInterval(progressInterval);
      setProgressStep('');
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
    if (score >= 80) return { label: 'High', color: theme.colors.accent.error, bg: theme.colors.sunray.light4 };
    if (score >= 60) return { label: 'Medium', color: theme.colors.accent.warning, bg: theme.colors.sunray.light3 };
    return { label: 'Low', color: theme.colors.text.tertiary, bg: theme.colors.background.subtle };
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
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
            <h1 style={{
              fontSize: theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text.primary,
              margin: 0,
            }}>
              Search Emails
            </h1>
            <Link
              to="/help/search"
              onClick={() => captureEvent('search_help_clicked')}
              style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.tertiary,
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.colors.primary.main;
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.colors.text.tertiary;
                e.currentTarget.style.textDecoration = 'none';
              }}
            >
              Help
            </Link>
          </div>
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
              placeholder="Ask a question or search (e.g., 'emails from Jay', 'meeting confirmations', 'from:john@example.com')"
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
            💡 Ask a question in plain English or use Gmail search syntax: from:, to:, subject:, has:attachment, before:, after:, etc.
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
                <div style={{
                  fontSize: theme.typography.fontSize['2xl'],
                  marginBottom: theme.spacing.md,
                }}>
                  {/* #region agent log */}
                  {(() => { fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Search.tsx:228',message:'Rendering loader icon',data:{progressStep},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{}); return null; })()}
                  {/* #endregion */}
                  {progressStep.includes('Crafting') ? '✏️' : 
                   progressStep.includes('Searching for emails') ? '🔍' : 
                   progressStep.includes('Filtering') ? '🤖' : 
                   progressStep.includes('Generating explanations') ? '💡' : 
                   '🔍'}
                </div>
                <div style={{
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.medium,
                  marginBottom: theme.spacing.sm,
                  color: theme.colors.text.primary,
                }}>
                  {progressStep || 'Searching...'}
                </div>
                <div style={{
                  width: '200px',
                  height: '4px',
                  backgroundColor: theme.colors.background.subtle,
                  borderRadius: theme.borderRadius.full,
                  margin: '0 auto',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: theme.colors.primary.main,
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                </div>
              </div>
            ) : searchResults.length === 0 || (searchResults.length === 1 && searchResults[0].id === 'no-results') ? (
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
                <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
                  Try adjusting your search query or using different keywords.
                </p>
                {(() => {
                  // Check for queriesTried in either the no-results marker or first result's debugInfo
                  let debugSource = null;
                  if (searchResults.length === 1 && searchResults[0]?.id === 'no-results') {
                    debugSource = searchResults[0];
                  } else if (searchResults.length > 0) {
                    debugSource = searchResults[0];
                  }
                  
                  const queriesTried = debugSource?.debugInfo?.queriesTried;
                  
                  // Debug logging
                  console.log('[Search] No results state:', {
                    searchResultsLength: searchResults.length,
                    firstResult: searchResults[0],
                    debugSource,
                    queriesTried,
                    hasQueriesTried: !!queriesTried,
                    queriesTriedLength: queriesTried?.length
                  });
                  
                  // Always show queries tried if they exist, even if empty (to help debug)
                  if (queriesTried !== undefined) {
                    if (queriesTried.length === 0) {
                      return (
                        <div style={{
                          marginTop: theme.spacing.lg,
                          padding: theme.spacing.lg,
                          backgroundColor: theme.colors.background.subtle,
                          borderRadius: theme.borderRadius.md,
                          textAlign: 'left',
                          maxWidth: '800px',
                          margin: `${theme.spacing.lg} auto 0`,
                        }}>
                          <h4 style={{
                            color: theme.colors.text.primary,
                            fontSize: theme.typography.fontSize.base,
                            fontWeight: theme.typography.fontWeight.semibold,
                            marginBottom: theme.spacing.md,
                          }}>
                            Search queries tried:
                          </h4>
                          <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                            No queries were attempted. This may indicate an error occurred before query execution.
                          </p>
                        </div>
                      );
                    }
                    
                    return (
                    <div style={{
                      marginTop: theme.spacing.lg,
                      padding: theme.spacing.lg,
                      backgroundColor: theme.colors.background.subtle,
                      borderRadius: theme.borderRadius.md,
                      textAlign: 'left',
                      maxWidth: '800px',
                      margin: `${theme.spacing.lg} auto 0`,
                    }}>
                      <h4 style={{
                        color: theme.colors.text.primary,
                        fontSize: theme.typography.fontSize.base,
                        fontWeight: theme.typography.fontWeight.semibold,
                        marginBottom: theme.spacing.md,
                      }}>
                        Search queries tried:
                      </h4>
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: theme.spacing.sm,
                      }}>
                        {queriesTried.map((attempt: { query: string; resultCount: number }, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              padding: theme.spacing.sm,
                              backgroundColor: theme.colors.background.paper,
                              borderRadius: theme.borderRadius.sm,
                              border: `1px solid ${theme.colors.border.light}`,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <code style={{
                              backgroundColor: 'transparent',
                              padding: 0,
                              fontSize: theme.typography.fontSize.sm,
                              color: theme.colors.text.primary,
                              fontFamily: 'monospace',
                            }}>
                              {attempt.query}
                            </code>
                            <span style={{
                              fontSize: theme.typography.fontSize.xs,
                              color: attempt.resultCount > 0 ? theme.colors.accent.success : theme.colors.text.tertiary,
                              fontWeight: theme.typography.fontWeight.medium,
                            }}>
                              {attempt.resultCount} result{attempt.resultCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  }
                  
                  return null;
                })()}
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
                
                {/* Debug Info */}
                {searchResults[0]?.debugInfo && (
                  <div style={{
                    backgroundColor: theme.colors.background.subtle,
                    borderRadius: theme.borderRadius.lg,
                    padding: theme.spacing.lg,
                    marginBottom: theme.spacing.lg,
                    border: `1px solid ${theme.colors.border.medium}`,
                  }}>
                    <h3 style={{
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.lg,
                      fontWeight: theme.typography.fontWeight.bold,
                      marginBottom: theme.spacing.md,
                    }}>
                      🔍 Debug Info
                    </h3>
                    <div style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      marginBottom: theme.spacing.md,
                    }}>
                      <div style={{ marginBottom: theme.spacing.xs }}>
                        <strong>Original query:</strong> "{searchResults[0].debugInfo.originalQuery}"
                      </div>
                      <div style={{ marginBottom: theme.spacing.xs }}>
                        <strong>Gmail search query:</strong> <code style={{ 
                          backgroundColor: theme.colors.background.paper, 
                          padding: '2px 6px', 
                          borderRadius: theme.borderRadius.sm,
                          fontSize: theme.typography.fontSize.xs,
                        }}>{searchResults[0].debugInfo.gmailQuery}</code>
                      </div>
                      <div style={{ marginTop: theme.spacing.sm }}>
                        <div>Total emails from Gmail: <strong>{searchResults[0].debugInfo.totalRawEmails}</strong></div>
                        <div>Max results requested: <strong>{searchResults[0].debugInfo.maxResultsRequested}</strong></div>
                        <div>After AI filtering: <strong>{searchResults[0].debugInfo.filteredCount}</strong></div>
                      </div>
                    </div>
                    <details style={{ marginTop: theme.spacing.md }}>
                      <summary style={{
                        cursor: 'pointer',
                        color: theme.colors.text.primary,
                        fontWeight: theme.typography.fontWeight.medium,
                        marginBottom: theme.spacing.sm,
                      }}>
                        Show all {searchResults[0].debugInfo.allRawEmails.length} raw emails with AI scores
                      </summary>
                      <div style={{
                        marginTop: theme.spacing.sm,
                        maxHeight: '400px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: theme.spacing.xs,
                      }}>
                        {searchResults[0].debugInfo.allRawEmails.map((rawEmail, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: theme.spacing.sm,
                              backgroundColor: rawEmail.includedInResults ? theme.colors.primary.subtle : theme.colors.background.paper,
                              borderRadius: theme.borderRadius.sm,
                              border: `1px solid ${rawEmail.includedInResults ? theme.colors.primary.main : theme.colors.border.light}`,
                              fontSize: theme.typography.fontSize.xs,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xs }}>
                              <div style={{ flex: 1 }}>
                                <strong style={{ color: theme.colors.text.primary }}>
                                  {rawEmail.from}
                                </strong>
                                <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
                                  - {rawEmail.subject}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                                {rawEmail.aiScore !== null ? (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (rawEmail.scoreBreakdown) {
                                        setSelectedScoreBreakdown({
                                          email: {
                                            id: `raw-${rawEmail.index}`,
                                            from: rawEmail.from,
                                            subject: rawEmail.subject,
                                            body: '',
                                            receivedAt: rawEmail.receivedAt,
                                          } as Email,
                                          breakdown: rawEmail.scoreBreakdown,
                                        });
                                      }
                                    }}
                                    style={{
                                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                      backgroundColor: rawEmail.aiScore >= 80 ? theme.colors.sunray.light4 : rawEmail.aiScore >= 60 ? theme.colors.sunray.light3 : theme.colors.background.subtle,
                                      color: rawEmail.aiScore >= 80 ? theme.colors.accent.success : rawEmail.aiScore >= 60 ? theme.colors.accent.warning : theme.colors.text.tertiary,
                                      borderRadius: theme.borderRadius.full,
                                      fontWeight: theme.typography.fontWeight.medium,
                                      cursor: rawEmail.scoreBreakdown ? 'pointer' : 'default',
                                      textDecoration: rawEmail.scoreBreakdown ? 'underline' : 'none',
                                    }}
                                    title={rawEmail.scoreBreakdown ? 'Click to see score breakdown' : ''}
                                  >
                                    AI Score: {rawEmail.aiScore}
                                  </span>
                                ) : (
                                  <span style={{ color: theme.colors.text.tertiary }}>No score</span>
                                )}
                                <span style={{ color: theme.colors.text.tertiary }}>
                                  {rawEmail.daysAgo} days ago
                                </span>
                                {rawEmail.includedInResults && (
                                  <span style={{
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                    backgroundColor: theme.colors.primary.main,
                                    color: 'white',
                                    borderRadius: theme.borderRadius.full,
                                    fontSize: theme.typography.fontSize.xs,
                                  }}>
                                    ✓ Included
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
                
                {searchResults.filter((email) => email.id !== 'no-results').map((email, index) => {
                  const priority = getPriorityBadge(email.priorityScore);
                  return (
                    <div
                      key={email.id}
                      onClick={() => {
                        captureEvent('search_result_clicked', {
                          result_index: index,
                          email_id: email.id,
                        });
                        navigate(`/email/${email.id}`);
                      }}
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
                          {email.relevanceScore !== undefined && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (email.scoreBreakdown) {
                                  setSelectedScoreBreakdown({ email, breakdown: email.scoreBreakdown });
                                }
                              }}
                              style={{
                                fontSize: theme.typography.fontSize.xs,
                                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                backgroundColor: email.relevanceScore >= 80 ? theme.colors.sunray.light4 : email.relevanceScore >= 60 ? theme.colors.sunray.light3 : theme.colors.background.subtle,
                                color: email.relevanceScore >= 80 ? theme.colors.accent.success : email.relevanceScore >= 60 ? theme.colors.accent.warning : theme.colors.text.tertiary,
                                borderRadius: theme.borderRadius.full,
                                fontWeight: theme.typography.fontWeight.medium,
                                cursor: email.scoreBreakdown ? 'pointer' : 'default',
                                textDecoration: email.scoreBreakdown ? 'underline' : 'none',
                              }}
                              title={email.scoreBreakdown ? 'Click to see score breakdown' : ''}
                            >
                              Relevance: {email.relevanceScore}%
                            </span>
                          )}
                          {email.priorityScore !== undefined && !email.relevanceScore && (
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
                        marginBottom: email.searchExplanation ? theme.spacing.xs : 0,
                      }}>
                        {email.body.substring(0, 200)}...
                      </div>
                      {/* #region agent log */}
                      {(() => { fetch('http://127.0.0.1:7242/ingest/19275245-ae64-4c47-b20b-42ab4a612288',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Search.tsx:490',message:'Checking searchExplanation',data:{emailId:email.id,hasSearchExplanation:!!email.searchExplanation,searchExplanationLength:email.searchExplanation?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}); return null; })()}
                      {/* #endregion */}
                      {email.searchExplanation && (
                        <div style={{
                          marginTop: theme.spacing.xs,
                          padding: theme.spacing.sm,
                          backgroundColor: theme.colors.primary.subtle,
                          borderRadius: theme.borderRadius.sm,
                          fontSize: theme.typography.fontSize.xs,
                          color: theme.colors.text.secondary,
                          fontStyle: 'italic',
                          borderLeft: `3px solid ${theme.colors.primary.main}`,
                        }}>
                          💡 {email.searchExplanation}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Rejected Emails Section */}
                {searchResults[0]?.debugInfo?.rejectedEmails && searchResults[0].debugInfo.rejectedEmails.length > 0 && (
                  <div style={{
                    marginTop: theme.spacing.xl,
                    padding: theme.spacing.lg,
                    backgroundColor: theme.colors.background.subtle,
                    borderRadius: theme.borderRadius.lg,
                    border: `1px solid ${theme.colors.border.medium}`,
                  }}>
                    <h3 style={{
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.lg,
                      fontWeight: theme.typography.fontWeight.bold,
                      marginBottom: theme.spacing.md,
                    }}>
                      Rejected Emails ({searchResults[0].debugInfo.rejectedEmails.length})
                    </h3>
                    <p style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      marginBottom: theme.spacing.md,
                    }}>
                      These emails were found but excluded because they scored below the relevance threshold (40).
                    </p>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: theme.spacing.md,
                    }}>
                      {searchResults[0].debugInfo.rejectedEmails.map((rejectedEmail, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: theme.spacing.md,
                            backgroundColor: theme.colors.background.paper,
                            borderRadius: theme.borderRadius.md,
                            border: `1px solid ${theme.colors.border.light}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.xs }}>
                            <div style={{ flex: 1 }}>
                              <strong style={{ color: theme.colors.text.primary }}>
                                {rejectedEmail.from}
                              </strong>
                              <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
                                - {rejectedEmail.subject}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
                              {rejectedEmail.aiScore !== null && (
                                <span
                                  onClick={() => {
                                    if (rejectedEmail.scoreBreakdown) {
                                      setSelectedScoreBreakdown({
                                        email: {
                                          id: `rejected-${idx}`,
                                          from: rejectedEmail.from,
                                          subject: rejectedEmail.subject,
                                          body: '',
                                          receivedAt: rejectedEmail.receivedAt,
                                        } as Email,
                                        breakdown: rejectedEmail.scoreBreakdown,
                                      });
                                    }
                                  }}
                                  style={{
                                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                    backgroundColor: theme.colors.background.subtle,
                                    color: theme.colors.text.tertiary,
                                    borderRadius: theme.borderRadius.full,
                                    fontWeight: theme.typography.fontWeight.medium,
                                    fontSize: theme.typography.fontSize.xs,
                                    cursor: rejectedEmail.scoreBreakdown ? 'pointer' : 'default',
                                    textDecoration: rejectedEmail.scoreBreakdown ? 'underline' : 'none',
                                  }}
                                  title={rejectedEmail.scoreBreakdown ? 'Click to see score breakdown' : ''}
                                >
                                  Score: {rejectedEmail.aiScore}
                                </span>
                              )}
                              <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
                                {rejectedEmail.daysAgo} days ago
                              </span>
                            </div>
                          </div>
                          <div style={{
                            marginTop: theme.spacing.sm,
                            padding: theme.spacing.sm,
                            backgroundColor: theme.colors.error.light,
                            borderRadius: theme.borderRadius.sm,
                            fontSize: theme.typography.fontSize.sm,
                            color: theme.colors.text.secondary,
                          }}>
                            <strong style={{ color: theme.colors.accent.error }}>Rejected: </strong>
                            {rejectedEmail.rejectionReason}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Score Breakdown Modal */}
      {selectedScoreBreakdown && (
        <div
          onClick={() => setSelectedScoreBreakdown(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.xl,
              maxWidth: '500px',
              width: '90%',
              boxShadow: theme.shadows.lg,
            }}
          >
            <h3 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.bold,
              marginBottom: theme.spacing.md,
            }}>
              Score Breakdown
            </h3>
            <div style={{ marginBottom: theme.spacing.md }}>
              <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                <strong>{selectedScoreBreakdown.email.fromName || selectedScoreBreakdown.email.from}</strong>
                <span style={{ marginLeft: theme.spacing.xs }}>{selectedScoreBreakdown.email.subject}</span>
              </div>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: theme.spacing.md,
            }}>
              <div style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.md,
              }}>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                  Base Relevance Score
                </div>
                <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold }}>
                  {selectedScoreBreakdown.breakdown.baseRelevanceScore}
                </div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.xs }}>
                  How relevant the email is to your search query
                </div>
              </div>
              <div style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.md,
              }}>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                  Recency Adjustment
                </div>
                <div style={{
                  color: selectedScoreBreakdown.breakdown.recencyAdjustment >= 0 ? theme.colors.accent.success : theme.colors.accent.error,
                  fontSize: theme.typography.fontSize['2xl'],
                  fontWeight: theme.typography.fontWeight.bold,
                }}>
                  {selectedScoreBreakdown.breakdown.recencyAdjustment >= 0 ? '+' : ''}{selectedScoreBreakdown.breakdown.recencyAdjustment}
                </div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.xs }}>
                  Bonus for recent emails, penalty for old emails
                </div>
              </div>
              <div style={{
                padding: theme.spacing.md,
                backgroundColor: theme.colors.primary.subtle,
                borderRadius: theme.borderRadius.md,
                border: `2px solid ${theme.colors.primary.main}`,
              }}>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.xs }}>
                  Final Score
                </div>
                <div style={{ color: theme.colors.primary.main, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold }}>
                  {selectedScoreBreakdown.breakdown.finalScore}
                </div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, marginTop: theme.spacing.xs }}>
                  Base relevance + recency adjustment (capped at 0-100)
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedScoreBreakdown(null)}
              style={{
                marginTop: theme.spacing.lg,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.medium,
                width: '100%',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Search;









