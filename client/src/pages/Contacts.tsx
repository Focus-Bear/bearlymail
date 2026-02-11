import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { DEBOUNCE_DELAY_MS, MILLISECONDS_PER_MINUTE, OPACITY_DISABLED, OPACITY_FULL, TOAST_DURATION_MS } from 'constants/numbers';
import { captureEvent } from 'utils/posthog';
import { Contact } from 'types/contact';
import { useAuth } from 'contexts/AuthContext';
import { getPusherInstance } from 'config/pusher';

import { API_URL } from 'config/api';

const Contacts: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Contact[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_URL}/contacts`);
      setContacts(response.data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      setError(t('contacts.errorLoading'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    captureEvent('contacts_viewed');
    fetchContacts();
  }, [fetchContacts]);

  const handleSync = async () => {
    captureEvent('contacts_sync_clicked');
    setSyncing(true);
    try {
      await axios.post(`${API_URL}/contacts/sync`);
      const pusher = getPusherInstance();
      if (!pusher) {
        const pollInterval = setInterval(async () => {
          try {
            const res = await axios.get(`${API_URL}/contacts`);
            if (res.data.length > 0) {
              clearInterval(pollInterval);
              setContacts(res.data);
              setSyncing(false);
            }
          } catch {
            clearInterval(pollInterval);
            setSyncing(false);
          }
        }, TOAST_DURATION_MS);
        setTimeout(() => {
          clearInterval(pollInterval);
          setSyncing(false);
          fetchContacts();
        }, MILLISECONDS_PER_MINUTE);
      }
    } catch (err) {
      console.error('Failed to sync contacts:', err);
      setError(t('contacts.errorSyncing'));
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    const pusher = getPusherInstance();
    if (!pusher) return;

    const channel = pusher.subscribe(`user-${user.id}`);

    channel.bind('contacts-sync-started', () => {
      setSyncing(true);
    });

    channel.bind('contacts-sync-complete', () => {
      setSyncing(false);
      fetchContacts();
    });

    channel.bind('contacts-sync-failed', (data: { error: string }) => {
      setSyncing(false);
      setError(data.error);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`user-${user.id}`);
    };
  }, [user?.id, fetchContacts]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await axios.get(
          `${API_URL}/contacts/search?q=${encodeURIComponent(searchQuery)}&limit=20`
        );
        setSearchResults(response.data);
      } catch (err) {
        console.error('Contact search failed:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_DELAY_MS);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const filteredContacts = searchResults !== null ? searchResults : contacts;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      padding: theme.spacing.lg,
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.lg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
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
              {t('contacts.backToInbox')}
            </button>
            <h1 style={{
              margin: 0,
              fontSize: theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text.primary,
            }}>
              {t('contacts.title')}
            </h1>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.main,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: syncing ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              opacity: syncing ? OPACITY_DISABLED : OPACITY_FULL,
              transition: theme.transitions.default,
            }}
          >
            {syncing ? t('contacts.syncing') : t('contacts.syncContacts')}
          </button>
        </div>

        <div style={{
          marginBottom: theme.spacing.lg,
        }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('contacts.searchPlaceholder')}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              outline: 'none',
              backgroundColor: theme.colors.background.paper,
            }}
          />
        </div>

        {error && (
          <div style={{
            padding: theme.spacing.md,
            backgroundColor: theme.colors.accent.error + '20',
            borderRadius: theme.borderRadius.md,
            color: theme.colors.accent.error,
            marginBottom: theme.spacing.lg,
          }}>
            {error}
          </div>
        )}

        {loading || searching ? (
          <div style={{
            textAlign: 'center',
            padding: theme.spacing.xl,
            color: theme.colors.text.secondary,
          }}>
            {t('contacts.loading')}
          </div>
        ) : filteredContacts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.sm,
          }}>
            <div style={{
              fontSize: '48px',
              marginBottom: theme.spacing.md,
            }}>
              👤
            </div>
            <h3 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}>
              {searchQuery ? t('contacts.noSearchResults') : t('contacts.noContacts')}
            </h3>
            <p style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.base,
              marginBottom: theme.spacing.lg,
            }}>
              {searchQuery ? t('contacts.tryDifferentSearch') : t('contacts.syncToGetStarted')}
            </p>
            {!searchQuery && (
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.medium,
                  opacity: syncing ? OPACITY_DISABLED : OPACITY_FULL,
                }}
              >
                {syncing ? t('contacts.syncing') : t('contacts.syncNow')}
              </button>
            )}
          </div>
        ) : (
          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.sm,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: theme.spacing.md,
              borderBottom: `1px solid ${theme.colors.border.light}`,
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
            }}>
              {t('contacts.totalContacts', { count: filteredContacts.length })}
            </div>
            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {filteredContacts.map((contact, index) => (
                <div
                  key={contact.id || contact.email}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: theme.spacing.md,
                    borderBottom: index < filteredContacts.length - 1 
                      ? `1px solid ${theme.colors.border.light}` 
                      : 'none',
                    gap: theme.spacing.md,
                  }}
                >
                  {contact.photoUrl ? (
                    <img
                      src={contact.photoUrl}
                      alt=""
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: theme.colors.primary.subtle,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: theme.colors.primary.main,
                        fontSize: theme.typography.fontSize.lg,
                        fontWeight: theme.typography.fontWeight.semibold,
                      }}
                    >
                      {(contact.name || contact.email)[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.base,
                      fontWeight: theme.typography.fontWeight.medium,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {contact.name || contact.email}
                    </div>
                    {contact.name && (
                      <div style={{
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.fontSize.sm,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {contact.email}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Contacts;
