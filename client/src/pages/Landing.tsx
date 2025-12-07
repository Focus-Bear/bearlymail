import React, { useState, useEffect } from 'react';
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
  const [isMobile, setIsMobile] = useState(false);
  const navigate = useNavigate();

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
        padding: `${theme.spacing.lg} ${isMobile ? theme.spacing.md : theme.spacing['2xl']}`,
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
              fontSize: isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize['2xl'],
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

      {/* Main Content - Two Columns */}
      <main style={{
        flex: 1,
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        padding: isMobile ? theme.spacing.lg : theme.spacing['2xl'],
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 450px',
          gap: isMobile ? theme.spacing.xl : theme.spacing['2xl'],
          alignItems: 'flex-start',
        }}>
          {/* Left Column: Content */}
          <div>
            {/* Hero Hook */}
            <section style={{
              marginBottom: isMobile ? theme.spacing.xl : theme.spacing['3xl'],
              paddingTop: isMobile ? theme.spacing.xl : theme.spacing['3xl'],
            }}>
              <h1 style={{
                fontSize: isMobile ? theme.typography.fontSize['2xl'] : theme.typography.fontSize['4xl'],
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.xl,
                lineHeight: 1.2,
              }}>
                You checked email 47 times yesterday.
                <br />
                Only 3 emails actually mattered.
              </h1>
              <p style={{
                fontSize: isMobile ? theme.typography.fontSize.base : theme.typography.fontSize.xl,
                color: theme.colors.text.secondary,
                lineHeight: 1.8,
              }}>
                The rest? Newsletters. Meeting confirmations. Marketing spam. But you keep checking obsessively because buried somewhere might be the one email that's actually urgent.
              </p>
            </section>

            {/* BearlyMail Intro */}
            <section style={{
              marginBottom: isMobile ? theme.spacing.xl : theme.spacing['3xl'],
            }}>
          <h2 style={{
            fontSize: isMobile ? theme.typography.fontSize['2xl'] : theme.typography.fontSize['3xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
          }}>
            BearlyMail was built by someone who gets it.
          </h2>
          <p style={{
            fontSize: isMobile ? theme.typography.fontSize.base : theme.typography.fontSize.lg,
            color: theme.colors.text.secondary,
            lineHeight: 1.8,
          }}>
            Created by an AuDHD founder who was drowning in email overwhelm, BearlyMail stops the constant interruptions while ensuring you never miss what's truly important.
          </p>
        </section>

            {/* How it works */}
            <section style={{
              marginBottom: isMobile ? theme.spacing.xl : theme.spacing['3xl'],
            }}>
              <h2 style={{
                fontSize: isMobile ? theme.typography.fontSize.xl : theme.typography.fontSize['3xl'],
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: isMobile ? theme.spacing.lg : theme.spacing['2xl'],
              }}>
                How it works
              </h2>

          {/* Feature 1: Urgent emails */}
          <div style={{
            marginBottom: theme.spacing.xl,
            padding: isMobile ? theme.spacing.md : theme.spacing.xl,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            borderLeft: `4px solid ${theme.colors.primary.main}`,
          }}>
            <h3 style={{
              fontSize: isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
            }}>
              Truly urgent emails break through immediately
            </h3>
            <p style={{
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.7,
              marginBottom: theme.spacing.md,
            }}>
              Client emergency at 2pm? You'll see it instantly. Newsletter from that SaaS tool? Batched until your next scheduled delivery.
            </p>
            <p style={{
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.7,
            }}>
              Our AI learns what's urgent to you by analyzing your email history—how quickly you reply, which senders you prioritize, what you immediately archive. High barrier for "urgent" means only what genuinely matters interrupts your flow.
            </p>
          </div>

          {/* Feature 2: Scheduled delivery */}
          <div style={{
            marginBottom: theme.spacing.xl,
            padding: isMobile ? theme.spacing.md : theme.spacing.xl,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            borderLeft: `4px solid ${theme.colors.secondary.main}`,
          }}>
            <h3 style={{
              fontSize: isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
            }}>
              Everything else arrives on your schedule
            </h3>
            <p style={{
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.7,
              marginBottom: theme.spacing.md,
            }}>
              Choose when emails get delivered: 2x, 3x, or 4x daily. Set quiet hours—no email before 10am, none after 6pm. Block off entire weekends. You're in complete control.
            </p>
            <p style={{
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.7,
            }}>
              Your inbox becomes a planned task, not a constant distraction.
            </p>
          </div>

          {/* Feature 3: Prioritization */}
          <div style={{
            marginBottom: theme.spacing.xl,
            padding: isMobile ? theme.spacing.md : theme.spacing.xl,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            borderLeft: `4px solid ${theme.colors.accent.info}`,
          }}>
            <h3 style={{
              fontSize: isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
            }}>
              See what matters first, one action at a time
            </h3>
            <p style={{
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.7,
              marginBottom: theme.spacing.md,
            }}>
              Every batch is automatically ranked 0-100 by importance based on your behavior patterns. Deal with the CEO's question first, not the Zoom recording notification.
            </p>
          </div>

          {/* Feature 4: Triage → Process */}
          <div style={{
            marginBottom: theme.spacing.xl,
            padding: isMobile ? theme.spacing.md : theme.spacing.xl,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            borderLeft: `4px solid ${theme.colors.accent.success}`,
          }}>
            <h3 style={{
              fontSize: isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
            }}>
              Triage → Process workflow
            </h3>
            <p style={{
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.7,
            }}>
              New emails go to Triage for quick decisions. Starred emails move to Process for focused work. No more endless scrolling to find what needs attention.
            </p>
          </div>

          {/* Feature 5: Smart snoozing */}
          <div style={{
            marginBottom: theme.spacing.xl,
            padding: isMobile ? theme.spacing.md : theme.spacing.xl,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            borderLeft: `4px solid ${theme.colors.accent.warning}`,
          }}>
            <h3 style={{
              fontSize: isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.md,
            }}>
              Smart snoozing that actually works
            </h3>
            <p style={{
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.7,
            }}>
              Type "2h" or "tomorrow" to snooze. No calendar navigation, no complex scheduling.
            </p>
          </div>
            </section>

            {/* Why BearlyMail is different */}
            <section style={{
              marginBottom: theme.spacing['3xl'],
            }}>
              <h2 style={{
                fontSize: isMobile ? theme.typography.fontSize['2xl'] : theme.typography.fontSize['3xl'],
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.lg,
              }}>
                Why BearlyMail is different
              </h2>
              <p style={{
                fontSize: isMobile ? theme.typography.fontSize.base : theme.typography.fontSize.lg,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.xl,
                lineHeight: 1.8,
              }}>
                <strong style={{ color: theme.colors.text.primary }}>Superhuman asks:</strong> How fast can you clear your inbox?
                <br />
                <strong style={{ color: theme.colors.primary.main }}>BearlyMail asks:</strong> How rarely should you need to open it?
              </p>

          {/* Comparison Table */}
          <div style={{
            overflowX: 'auto',
            marginBottom: theme.spacing.xl,
            WebkitOverflowScrolling: 'touch',
          }}>
            <table style={{
              width: '100%',
              minWidth: isMobile ? '600px' : 'auto',
              borderCollapse: 'collapse',
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
              overflow: 'hidden',
            }}>
              <thead>
                <tr style={{
                  backgroundColor: theme.colors.background.subtle,
                }}>
                  <th style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'left',
                    fontWeight: theme.typography.fontWeight.bold,
                    color: theme.colors.text.primary,
                    borderBottom: `2px solid ${theme.colors.border.medium}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}></th>
                  <th style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    fontWeight: theme.typography.fontWeight.bold,
                    color: theme.colors.primary.main,
                    borderBottom: `2px solid ${theme.colors.border.medium}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    BearlyMail
                  </th>
                  <th style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    fontWeight: theme.typography.fontWeight.bold,
                    color: theme.colors.text.secondary,
                    borderBottom: `2px solid ${theme.colors.border.medium}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Superhuman
                  </th>
                  <th style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    fontWeight: theme.typography.fontWeight.bold,
                    color: theme.colors.text.secondary,
                    borderBottom: `2px solid ${theme.colors.border.medium}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Gmail Priority
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    fontWeight: theme.typography.fontWeight.semibold,
                    color: theme.colors.text.primary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Email delivery
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Scheduled batches you control
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Real-time (constant interruptions)
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Real-time
                  </td>
                </tr>
                <tr>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    fontWeight: theme.typography.fontWeight.semibold,
                    color: theme.colors.text.primary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Urgent filtering
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    AI learns & breaks through batches
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Manual category splits
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Basic algorithm
                  </td>
                </tr>
                <tr>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    fontWeight: theme.typography.fontWeight.semibold,
                    color: theme.colors.text.primary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Prioritization
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Automatic (learns from your behavior)
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Manual triage required
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Static filters
                  </td>
                </tr>
                <tr>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    fontWeight: theme.typography.fontWeight.semibold,
                    color: theme.colors.text.primary,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Philosophy
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    fontWeight: theme.typography.fontWeight.medium,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Prevention {'>'} Speed
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Speed {'>'} Prevention
                  </td>
                  <td style={{
                    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
                    textAlign: 'center',
                    color: theme.colors.text.secondary,
                    fontSize: isMobile ? theme.typography.fontSize.xs : theme.typography.fontSize.base,
                  }}>
                    Sorting {'>'} Prevention
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{
            padding: isMobile ? theme.spacing.md : theme.spacing.xl,
            backgroundColor: theme.colors.primary.subtle,
            borderRadius: theme.borderRadius.lg,
            marginBottom: theme.spacing.xl,
          }}>
            <p style={{
              fontSize: isMobile ? theme.typography.fontSize.sm : theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.8,
              marginBottom: theme.spacing.md,
            }}>
              Gmail's Priority Inbox guesses based on generic signals.
            </p>
            <p style={{
              fontSize: isMobile ? theme.typography.fontSize.sm : theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.8,
              marginBottom: theme.spacing.md,
            }}>
              Superhuman makes you faster at processing emails when they arrive.
            </p>
            <p style={{
              fontSize: isMobile ? theme.typography.fontSize.sm : theme.typography.fontSize.base,
              color: theme.colors.text.primary,
              lineHeight: 1.8,
              fontWeight: theme.typography.fontWeight.medium,
            }}>
              BearlyMail learns from what you actually do—not what you tell it, not what Google thinks is important.
            </p>
            <p style={{
              fontSize: isMobile ? theme.typography.fontSize.sm : theme.typography.fontSize.base,
              color: theme.colors.text.secondary,
              lineHeight: 1.8,
              marginTop: theme.spacing.md,
            }}>
              We watch how fast you reply, which emails you read vs archive, who you always open. Then we get out of your way.
            </p>
          </div>
            </section>

            {/* Closing Statement */}
            <section style={{
              marginBottom: theme.spacing['3xl'],
              padding: isMobile ? theme.spacing.lg : theme.spacing['2xl'],
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
            }}>
              <h2 style={{
                fontSize: isMobile ? theme.typography.fontSize['2xl'] : theme.typography.fontSize['3xl'],
                fontWeight: theme.typography.fontWeight.bold,
                color: theme.colors.text.primary,
                marginBottom: theme.spacing.lg,
              }}>
                Stop reacting to your inbox. Start controlling it.
              </h2>
              <p style={{
                fontSize: isMobile ? theme.typography.fontSize.base : theme.typography.fontSize.xl,
                color: theme.colors.text.secondary,
                lineHeight: 1.8,
                marginBottom: theme.spacing.md,
              }}>
                Three focused moments instead of 47 interruptions.
              </p>
              <p style={{
                fontSize: isMobile ? theme.typography.fontSize.base : theme.typography.fontSize.xl,
                color: theme.colors.text.secondary,
                lineHeight: 1.8,
                marginBottom: theme.spacing.md,
              }}>
                The emails that matter, when you're ready for them.
              </p>
              <p style={{
                fontSize: isMobile ? theme.typography.fontSize.base : theme.typography.fontSize.lg,
                color: theme.colors.primary.main,
                fontWeight: theme.typography.fontWeight.medium,
                marginTop: theme.spacing.xl,
                fontStyle: 'italic',
              }}>
                Built by someone who needed it to exist.
              </p>
            </section>
          </div>

          {/* Right Column: Waitlist Form */}
          <div style={{
            position: isMobile ? 'static' : 'sticky',
            top: isMobile ? 'auto' : theme.spacing.xl,
            order: isMobile ? -1 : 0, // Show form first on mobile
          }}>
            <section style={{
              backgroundColor: theme.colors.background.paper,
              padding: isMobile ? theme.spacing.lg : theme.spacing['2xl'],
              borderRadius: theme.borderRadius.lg,
              boxShadow: theme.shadows.lg,
            }}>
          <h3 style={{
            fontSize: isMobile ? theme.typography.fontSize.xl : theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            textAlign: 'center',
          }}>
            Join the Waitlist
          </h3>
              <p style={{
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.xl,
                textAlign: 'center',
                fontSize: isMobile ? theme.typography.fontSize.sm : theme.typography.fontSize.base,
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
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Landing;
