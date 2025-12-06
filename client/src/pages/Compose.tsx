import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Contact {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  photoUrl?: string;
  isFavorite: boolean;
  contactFrequency: number;
}

interface Recipient {
  email: string;
  name?: string;
}

const Compose: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Email fields
  const [to, setTo] = useState<Recipient[]>([]);
  const [cc, setCc] = useState<Recipient[]>([]);
  const [bcc, setBcc] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  
  // UI state
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Contact search state
  const [toSearch, setToSearch] = useState('');
  const [ccSearch, setCcSearch] = useState('');
  const [bccSearch, setBccSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [activeField, setActiveField] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [frequentContacts, setFrequentContacts] = useState<Contact[]>([]);
  const [syncingContacts, setSyncingContacts] = useState(false);
  
  // Refs
  const toInputRef = useRef<HTMLInputElement>(null);
  const ccInputRef = useRef<HTMLInputElement>(null);
  const bccInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-populate from URL params (for reply flows)
  useEffect(() => {
    const toParam = searchParams.get('to');
    const subjectParam = searchParams.get('subject');
    if (toParam) {
      setTo([{ email: toParam }]);
    }
    if (subjectParam) {
      setSubject(subjectParam);
    }
  }, [searchParams]);

  // Fetch frequent contacts on mount
  useEffect(() => {
    const fetchFrequent = async () => {
      try {
        const response = await axios.get(`${API_URL}/contacts/frequent?limit=6`);
        setFrequentContacts(response.data);
      } catch (err) {
        console.error('Failed to fetch frequent contacts:', err);
      }
    };
    fetchFrequent();
  }, []);

  // Search contacts with debounce
  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/contacts/search?q=${encodeURIComponent(query)}&limit=8`);
      setSearchResults(response.data);
      setSelectedSuggestionIndex(-1);
    } catch (err) {
      console.error('Contact search failed:', err);
      setSearchResults([]);
    }
  }, []);

  // Debounced search handler
  const handleSearchInput = useCallback((value: string, field: 'to' | 'cc' | 'bcc') => {
    if (field === 'to') setToSearch(value);
    else if (field === 'cc') setCcSearch(value);
    else setBccSearch(value);
    
    setActiveField(field);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchContacts(value);
    }, 200);
  }, [searchContacts]);

  // Add recipient from search/autocomplete
  const addRecipient = useCallback((contact: Contact | { email: string; name?: string }, field: 'to' | 'cc' | 'bcc') => {
    const recipient: Recipient = {
      email: contact.email,
      name: 'name' in contact ? contact.name : undefined,
    };

    const setter = field === 'to' ? setTo : field === 'cc' ? setCc : setBcc;
    const searchSetter = field === 'to' ? setToSearch : field === 'cc' ? setCcSearch : setBccSearch;

    setter(prev => {
      // Don't add duplicates
      if (prev.some(r => r.email.toLowerCase() === recipient.email.toLowerCase())) {
        return prev;
      }
      return [...prev, recipient];
    });

    searchSetter('');
    setSearchResults([]);
    setActiveField(null);
  }, []);

  // Remove recipient
  const removeRecipient = useCallback((email: string, field: 'to' | 'cc' | 'bcc') => {
    const setter = field === 'to' ? setTo : field === 'cc' ? setCc : setBcc;
    setter(prev => prev.filter(r => r.email !== email));
  }, []);

  // Handle Enter key in search input (add typed email or select suggestion)
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, field: 'to' | 'cc' | 'bcc') => {
    const searchValue = field === 'to' ? toSearch : field === 'cc' ? ccSearch : bccSearch;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0 && searchResults[selectedSuggestionIndex]) {
        addRecipient(searchResults[selectedSuggestionIndex], field);
      } else if (searchValue && searchValue.includes('@')) {
        // Add typed email directly
        addRecipient({ email: searchValue.trim() }, field);
      }
    } else if (e.key === 'Backspace' && !searchValue) {
      // Remove last recipient on backspace if input is empty
      const recipients = field === 'to' ? to : field === 'cc' ? cc : bcc;
      if (recipients.length > 0) {
        removeRecipient(recipients[recipients.length - 1].email, field);
      }
    } else if (e.key === 'Escape') {
      setSearchResults([]);
      setActiveField(null);
    }
  }, [toSearch, ccSearch, bccSearch, searchResults, selectedSuggestionIndex, addRecipient, removeRecipient, to, cc, bcc]);

  // Sync contacts from Gmail
  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    try {
      await axios.post(`${API_URL}/contacts/sync`);
      // Refresh frequent contacts
      const response = await axios.get(`${API_URL}/contacts/frequent?limit=6`);
      setFrequentContacts(response.data);
    } catch (err) {
      console.error('Failed to sync contacts:', err);
    } finally {
      setSyncingContacts(false);
    }
  };

  // Send email
  const handleSend = async () => {
    if (to.length === 0) {
      setError('Please add at least one recipient');
      return;
    }
    if (!subject.trim()) {
      setError('Please add a subject');
      return;
    }
    if (!body.trim()) {
      setError('Please add a message');
      return;
    }

    setSending(true);
    setError(null);

    try {
      await axios.post(`${API_URL}/emails/send`, {
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: subject.trim(),
        body: body.trim(),
      });

      setSendSuccess(true);
      
      // Navigate back to inbox after brief delay
      setTimeout(() => {
        navigate('/inbox');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Render recipient chip
  const renderRecipientChip = (recipient: Recipient, field: 'to' | 'cc' | 'bcc') => (
    <div
      key={recipient.email}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        backgroundColor: theme.colors.primary.subtle,
        borderRadius: theme.borderRadius.full,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.primary.dark,
        margin: '2px',
      }}
    >
      <span>{recipient.name || recipient.email}</span>
      <button
        onClick={() => removeRecipient(recipient.email, field)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0',
          color: theme.colors.primary.main,
          fontSize: '14px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        ×
      </button>
    </div>
  );

  // Render search suggestions dropdown
  const renderSuggestions = (field: 'to' | 'cc' | 'bcc') => {
    if (activeField !== field || searchResults.length === 0) return null;

    return (
      <div
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          boxShadow: theme.shadows.lg,
          border: `1px solid ${theme.colors.border.light}`,
          maxHeight: '240px',
          overflowY: 'auto',
          zIndex: 100,
          marginTop: '4px',
        }}
      >
        {searchResults.map((contact, index) => (
          <div
            key={contact.id || contact.email}
            onClick={() => addRecipient(contact, field)}
            style={{
              padding: '10px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: index === selectedSuggestionIndex 
                ? theme.colors.interactive.hover 
                : 'transparent',
              borderBottom: index < searchResults.length - 1 
                ? `1px solid ${theme.colors.border.light}` 
                : 'none',
              transition: theme.transitions.fast,
            }}
            onMouseEnter={() => setSelectedSuggestionIndex(index)}
          >
            {contact.photoUrl ? (
              <img
                src={contact.photoUrl}
                alt=""
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: theme.colors.primary.subtle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.colors.primary.main,
                  fontWeight: theme.typography.fontWeight.semibold,
                  fontSize: theme.typography.fontSize.sm,
                }}
              >
                {(contact.name || contact.email)[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {contact.name && (
                <div style={{
                  fontWeight: theme.typography.fontWeight.medium,
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.fontSize.sm,
                }}>
                  {contact.name}
                </div>
              )}
              <div style={{
                color: contact.name ? theme.colors.text.secondary : theme.colors.text.primary,
                fontSize: theme.typography.fontSize.xs,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {contact.email}
              </div>
            </div>
            {contact.isFavorite && (
              <span style={{ color: theme.colors.accent.warning }}>★</span>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render recipient input field
  const renderRecipientField = (
    label: string,
    recipients: Recipient[],
    searchValue: string,
    field: 'to' | 'cc' | 'bcc',
    inputRef: React.RefObject<HTMLInputElement | null>,
    showToggle?: { show: boolean; onShow: () => void; label: string }
  ) => (
    <div style={{ position: 'relative', marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '8px 0',
          borderBottom: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <label
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            minWidth: '50px',
            paddingTop: '6px',
          }}
        >
          {label}
        </label>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '4px',
            minHeight: '32px',
          }}
          onClick={() => inputRef.current?.focus()}
        >
          {recipients.map(r => renderRecipientChip(r, field))}
          <input
            ref={inputRef}
            type="text"
            value={searchValue}
            onChange={(e) => handleSearchInput(e.target.value, field)}
            onKeyDown={(e) => handleSearchKeyDown(e, field)}
            onFocus={() => setActiveField(field)}
            onBlur={() => setTimeout(() => {
              if (activeField === field) setActiveField(null);
            }, 200)}
            placeholder={recipients.length === 0 ? 'Enter email or search contacts...' : ''}
            style={{
              border: 'none',
              outline: 'none',
              flex: 1,
              minWidth: '200px',
              padding: '6px 0',
              fontSize: theme.typography.fontSize.base,
              fontFamily: theme.typography.fontFamily,
              backgroundColor: 'transparent',
            }}
          />
        </div>
        {showToggle && !showToggle.show && (
          <button
            onClick={showToggle.onShow}
            style={{
              background: 'none',
              border: 'none',
              color: theme.colors.text.secondary,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              padding: '6px 8px',
            }}
          >
            {showToggle.label}
          </button>
        )}
      </div>
      {renderSuggestions(field)}
    </div>
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.lg,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.lg,
          maxWidth: '900px',
          margin: '0 auto',
          paddingBottom: theme.spacing.md,
        }}
      >
        <button
          onClick={() => navigate('/inbox')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.base,
            padding: '8px 12px',
            borderRadius: theme.borderRadius.md,
            transition: theme.transitions.default,
          }}
        >
          ← Back to Inbox
        </button>

        <button
          onClick={handleSyncContacts}
          disabled={syncingContacts}
          style={{
            background: 'none',
            border: `1px solid ${theme.colors.border.light}`,
            cursor: syncingContacts ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            padding: '6px 12px',
            borderRadius: theme.borderRadius.md,
            transition: theme.transitions.default,
            opacity: syncingContacts ? 0.6 : 1,
          }}
        >
          {syncingContacts ? '↻ Syncing...' : '↻ Sync Contacts'}
        </button>
      </div>

      {/* Main compose card */}
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          overflow: 'hidden',
        }}
      >
        {/* Card header */}
        <div
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.lg}`,
            borderBottom: `1px solid ${theme.colors.border.light}`,
            background: `linear-gradient(135deg, ${theme.colors.primary.subtle} 0%, ${theme.colors.background.paper} 100%)`,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
            }}
          >
            ✉️ New Message
          </h1>
        </div>

        {/* Form content */}
        <div style={{ padding: theme.spacing.lg }}>
          {/* Recipients */}
          {renderRecipientField(
            'To',
            to,
            toSearch,
            'to',
            toInputRef,
            { show: showCc || showBcc, onShow: () => setShowCc(true), label: 'Cc/Bcc' }
          )}

          {showCc && renderRecipientField('Cc', cc, ccSearch, 'cc', ccInputRef)}
          {showBcc && renderRecipientField('Bcc', bcc, bccSearch, 'bcc', bccInputRef)}

          {/* Show Bcc toggle */}
          {showCc && !showBcc && (
            <button
              onClick={() => setShowBcc(true)}
              style={{
                background: 'none',
                border: 'none',
                color: theme.colors.text.secondary,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                padding: '4px 0',
                marginBottom: '12px',
              }}
            >
              + Add Bcc
            </button>
          )}

          {/* Subject */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 0',
              borderBottom: `1px solid ${theme.colors.border.light}`,
              marginBottom: '16px',
            }}
          >
            <label
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                minWidth: '50px',
              }}
            >
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject..."
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                padding: '6px 0',
                fontSize: theme.typography.fontSize.base,
                fontFamily: theme.typography.fontFamily,
                backgroundColor: 'transparent',
              }}
            />
          </div>

          {/* Body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message..."
            style={{
              width: '100%',
              minHeight: '300px',
              border: 'none',
              outline: 'none',
              resize: 'vertical',
              fontSize: theme.typography.fontSize.base,
              fontFamily: theme.typography.fontFamily,
              lineHeight: theme.typography.lineHeight.relaxed,
              padding: '8px 0',
              backgroundColor: 'transparent',
            }}
          />

          {/* Frequent contacts */}
          {frequentContacts.length > 0 && to.length === 0 && !activeField && (
            <div
              style={{
                marginTop: theme.spacing.lg,
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.md,
              }}
            >
              <p
                style={{
                  margin: `0 0 ${theme.spacing.sm} 0`,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                }}
              >
                Frequent contacts:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {frequentContacts.map((contact) => (
                  <button
                    key={contact.id || contact.email}
                    onClick={() => addRecipient(contact, 'to')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      backgroundColor: theme.colors.background.paper,
                      border: `1px solid ${theme.colors.border.light}`,
                      borderRadius: theme.borderRadius.full,
                      cursor: 'pointer',
                      fontSize: theme.typography.fontSize.sm,
                      color: theme.colors.text.primary,
                      transition: theme.transitions.default,
                    }}
                  >
                    {contact.photoUrl ? (
                      <img
                        src={contact.photoUrl}
                        alt=""
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: theme.colors.primary.subtle,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.colors.primary.main,
                          fontSize: '11px',
                          fontWeight: theme.typography.fontWeight.semibold,
                        }}
                      >
                        {(contact.name || contact.email)[0].toUpperCase()}
                      </div>
                    )}
                    {contact.name || contact.email}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div
              style={{
                marginTop: theme.spacing.md,
                padding: theme.spacing.md,
                backgroundColor: '#FEF2F2',
                borderRadius: theme.borderRadius.md,
                color: theme.colors.accent.error,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {error}
            </div>
          )}

          {/* Success message */}
          {sendSuccess && (
            <div
              style={{
                marginTop: theme.spacing.md,
                padding: theme.spacing.md,
                backgroundColor: theme.colors.secondary.subtle,
                borderRadius: theme.borderRadius.md,
                color: theme.colors.secondary.dark,
                fontSize: theme.typography.fontSize.sm,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              ✓ Email sent successfully! Redirecting...
            </div>
          )}
        </div>

        {/* Footer with send button */}
        <div
          style={{
            padding: theme.spacing.lg,
            borderTop: `1px solid ${theme.colors.border.light}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: theme.colors.background.subtle,
          }}
        >
          <button
            onClick={() => navigate('/inbox')}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.secondary,
              transition: theme.transitions.default,
            }}
          >
            Discard
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sendSuccess}
            style={{
              padding: '10px 24px',
              backgroundColor: sending || sendSuccess ? theme.colors.primary.light : theme.colors.primary.main,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: sending || sendSuccess ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.semibold,
              color: 'white',
              transition: theme.transitions.default,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {sending ? (
              <>
                <span style={{ 
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: 'white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                Sending...
              </>
            ) : sendSuccess ? (
              '✓ Sent!'
            ) : (
              'Send ✉️'
            )}
          </button>
        </div>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Compose;

