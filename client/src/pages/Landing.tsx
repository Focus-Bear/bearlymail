import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const Landing: React.FC = () => {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await axios.post(`${API_URL}/waitlist`, { email, firstName, reason });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.xl,
      }}>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          maxWidth: '600px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: theme.spacing.md }}>✅</div>
          <h1 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize['3xl'],
          }}>
            You're on the list!
          </h1>
          <p style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
            lineHeight: 1.6,
          }}>
            We'll review your request and send you an email when your account is approved.
          </p>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              backgroundColor: theme.colors.primary.main,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
              cursor: 'pointer',
            }}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: `${theme.spacing.lg} ${theme.spacing['2xl']}`,
        backgroundColor: theme.colors.background.paper,
        borderBottom: `1px solid ${theme.colors.border.light}`,
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}>
            <img 
              src="/favicon.svg" 
              alt="BearlyMail Icon" 
              style={{ 
                height: '36px', 
                width: 'auto',
                objectFit: 'contain'
              }}
            />
            <h1 style={{
              color: theme.colors.primary.main,
              fontSize: theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.bold,
            }}>
              BearlyMail
            </h1>
          </div>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: 'transparent',
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing['2xl'],
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: theme.spacing['2xl'],
          alignItems: 'center',
        }}>
          {/* Left: Description */}
          <div>
            <h2 style={{
              fontSize: theme.typography.fontSize['4xl'],
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.lg,
              lineHeight: 1.2,
            }}>
              Your inbox is overwhelming you. <br />
              We fix that.
            </h2>
            <p style={{
              fontSize: theme.typography.fontSize.lg,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.xl,
              lineHeight: 1.6,
            }}>
              <strong style={{ color: theme.colors.text.primary }}>47 unread emails.</strong> You know you should deal with them, but where do you even start? 
              Every notification pulls your attention. Important emails get buried. You spend 20 minutes deciding what to tackle first.
            </p>
            <p style={{
              fontSize: theme.typography.fontSize.lg,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.xl,
              lineHeight: 1.6,
            }}>
              <strong style={{ color: theme.colors.primary.main }}>BearlyMail changes that.</strong> We batch your emails and deliver them at set times, 
              so you're not constantly interrupted. AI tells you what actually matters. You see one clear action at a time.
            </p>
            <div style={{
              backgroundColor: theme.colors.primary.subtle,
              padding: theme.spacing.lg,
              borderRadius: theme.borderRadius.md,
              marginBottom: theme.spacing.xl,
              borderLeft: `4px solid ${theme.colors.primary.main}`,
            }}>
              <h3 style={{
                fontSize: theme.typography.fontSize.lg,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.md,
              }}>
                How it works:
              </h3>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}>
                {[
                  {
                    title: 'Batch delivery',
                    description: 'Emails arrive in scheduled batches (e.g., 3x per day) instead of constantly interrupting you',
                  },
                  {
                    title: 'AI prioritization',
                    description: 'We analyze each email and score it 0-100. You see the most important ones first, always',
                  },
                  {
                    title: 'One-sentence summaries',
                    description: 'Every email gets a quick summary. No more opening 20 emails to find the one that needs action',
                  },
                  {
                    title: 'Triage → Process workflow',
                    description: 'New emails go to "Triage" (quick decisions). Starred emails go to "Process" (deep work)',
                  },
                  {
                    title: 'Smart snoozing',
                    description: 'Type "2h" or "tomorrow" to snooze. No complex calendar navigation',
                  },
                ].map((feature, i) => (
                  <li key={i} style={{
                    marginBottom: theme.spacing.md,
                    paddingLeft: theme.spacing.md,
                  }}>
                    <div style={{
                      fontWeight: theme.typography.fontWeight.semibold,
                      color: theme.colors.text.primary,
                      marginBottom: theme.spacing.xs,
                    }}>
                      {feature.title}
                    </div>
                    <div style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      lineHeight: 1.5,
                    }}>
                      {feature.description}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: Waitlist Form */}
          <div style={{
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing['2xl'],
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.lg,
          }}>
            <h3 style={{
              fontSize: theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
            }}>
              Join the Waitlist
            </h3>
            <p style={{
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.xl,
            }}>
              We're currently in private beta. Sign up to get early access.
            </p>

            {error && (
              <div style={{
                backgroundColor: theme.colors.accent.error + '20',
                color: theme.colors.accent.error,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.md,
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: theme.spacing.md }}>
                <label style={{
                  display: 'block',
                  marginBottom: theme.spacing.xs,
                  color: theme.colors.text.primary,
                  fontWeight: theme.typography.fontWeight.medium,
                }}>
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.fontSize.base,
                  }}
                />
              </div>

              <div style={{ marginBottom: theme.spacing.md }}>
                <label style={{
                  display: 'block',
                  marginBottom: theme.spacing.xs,
                  color: theme.colors.text.primary,
                  fontWeight: theme.typography.fontWeight.medium,
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.fontSize.base,
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
                  Why do you want to use BearlyMail?
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={4}
                  style={{
                    width: '100%',
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.fontSize.base,
                    fontFamily: theme.typography.fontFamily,
                    resize: 'vertical',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: theme.spacing.lg,
                  backgroundColor: submitting ? theme.colors.border.dark : theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'Submitting...' : 'Join Waitlist'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;

