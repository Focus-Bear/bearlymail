import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { Contact, ContactTypeConfig } from 'types/contact';

import { InlineContactSearchDebug } from 'components/admin/InlineContactSearchDebug';
import { ContactTypeBadge } from 'components/crm/ContactTypeBadge';
import { Sidebar } from 'components/inbox/Sidebar';
import { EMOJI_MENU } from 'constants/emojis';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import {
  STRING_AUTO,
  STRING_CENTER,
  STRING_COVER,
  STRING_DEFAULT,
  STRING_ELLIPSIS,
  STRING_FIXED,
  STRING_FLEX,
  STRING_HIDDEN,
  STRING_NONE,
  STRING_NOWRAP,
  STRING_POINTER,
  STRING_SPACE_BETWEEN,
  STRING_TRANSPARENT,
  STRING_WHITE,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';
import { useContactsData } from 'hooks/useContactsData';
import { useContactSearch } from 'hooks/useContactSearch';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';

interface ContactsEmptyStateProps {
  searchQuery: string;
  syncing: boolean;
  onSync: () => void;
}

const ContactsEmptyState: React.FC<ContactsEmptyStateProps> = ({ searchQuery, syncing, onSync }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        textAlign: STRING_CENTER,
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.sm,
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: theme.spacing.md }}>👤</div>
      <h3
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.sm,
        }}
      >
        {searchQuery ? t('contacts.noSearchResults') : t('contacts.noContacts')}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.base,
          marginBottom: theme.spacing.lg,
        }}
      >
        {searchQuery ? t('contacts.tryDifferentSearch') : t('contacts.syncToGetStarted')}
      </p>
      {!searchQuery && (
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.primary.main,
            color: STRING_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: syncing ? 'not-allowed' : STRING_POINTER,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            opacity: syncing ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {syncing ? t('contacts.syncing') : t('contacts.syncNow')}
        </button>
      )}
    </div>
  );
};

interface ContactsListProps {
  contacts: Contact[];
  getContactTypeConfig: (typeName: string | null | undefined) => ContactTypeConfig | undefined;
}

const isValidUUID = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const ContactsList: React.FC<ContactsListProps> = ({ contacts, getContactTypeConfig }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { showInfo } = useNotifications();
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.sm,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: theme.spacing.md,
          borderBottom: `1px solid ${theme.colors.border.light}`,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('contacts.totalContacts', { count: contacts.length })}
      </div>
      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
        {contacts.map((contact, index) => {
          const typeConfig = getContactTypeConfig(contact.contactType);
          const canNavigate = Boolean(contact.id && isValidUUID(contact.id));
          return (
            <div
              key={contact.id || contact.email}
              onClick={() => {
                // Navigate for contacts with a valid UUID id (local DB records).
                // Gmail-only search results use a Google People API resource name
                // (e.g. "people/c12345") which is not a UUID — show feedback instead.
                if (canNavigate) {
                  navigate(`/crm/contacts/${contact.id}`);
                } else {
                  showInfo(t('contacts.gmailOnlyContactInfo'));
                }
              }}
              style={{
                display: STRING_FLEX,
                alignItems: STRING_CENTER,
                padding: theme.spacing.md,
                borderBottom: index < contacts.length - 1 ? `1px solid ${theme.colors.border.light}` : STRING_NONE,
                gap: theme.spacing.md,
                cursor: canNavigate ? STRING_POINTER : STRING_DEFAULT,
                transition: theme.transitions.fast,
              }}
              onMouseEnter={event => {
                if (canNavigate) {
                  event.currentTarget.style.backgroundColor = theme.colors.background.default;
                }
              }}
              onMouseLeave={event => {
                event.currentTarget.style.backgroundColor = STRING_TRANSPARENT;
              }}
            >
              {contact.photoUrl ? (
                <img
                  src={contact.photoUrl}
                  alt=""
                  style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: STRING_COVER }}
                />
              ) : (
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: theme.colors.primary.subtle,
                    display: STRING_FLEX,
                    alignItems: STRING_CENTER,
                    justifyContent: STRING_CENTER,
                    color: theme.colors.primary.main,
                    fontSize: theme.typography.fontSize.lg,
                    fontWeight: theme.typography.fontWeight.semibold,
                    flexShrink: 0,
                  }}
                >
                  {(contact.name || contact.email)[0].toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: STRING_FLEX, alignItems: STRING_CENTER, gap: theme.spacing.sm }}>
                  <span
                    style={{
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.base,
                      fontWeight: theme.typography.fontWeight.medium,
                      overflow: STRING_HIDDEN,
                      textOverflow: STRING_ELLIPSIS,
                      whiteSpace: STRING_NOWRAP,
                    }}
                  >
                    {contact.name || contact.email}
                  </span>
                  {typeConfig && (
                    <ContactTypeBadge label={typeConfig.label} color={typeConfig.color} icon={typeConfig.icon} />
                  )}
                </div>
                {contact.name && (
                  <div
                    style={{
                      color: theme.colors.text.secondary,
                      fontSize: theme.typography.fontSize.sm,
                      overflow: STRING_HIDDEN,
                      textOverflow: STRING_ELLIPSIS,
                      whiteSpace: STRING_NOWRAP,
                    }}
                  >
                    {contact.email}
                  </div>
                )}
              </div>
              {contact.company && (
                <div
                  style={{
                    color: theme.colors.text.tertiary,
                    fontSize: theme.typography.fontSize.sm,
                    whiteSpace: STRING_NOWRAP,
                  }}
                >
                  {contact.company}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ContactsMainContentProps {
  contacts: Contact[];
  contactTypes: ContactTypeConfig[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  getContactTypeConfig: (typeName: string | null | undefined) => ContactTypeConfig | undefined;
  handleSync: () => Promise<void>;
}

const ContactsMainContent: React.FC<ContactsMainContentProps> = ({
  contacts,
  loading,
  syncing,
  error,
  getContactTypeConfig,
  handleSync,
}) => {
  const { t } = useTranslation();
  const { searchQuery, setSearchQuery, searching, filteredContacts } = useContactSearch();
  const displayedContacts = filteredContacts(contacts);

  return (
    <div style={{ maxWidth: '900px', margin: STRING_AUTO }}>
      <div
        style={{
          display: STRING_FLEX,
          justifyContent: STRING_SPACE_BETWEEN,
          alignItems: STRING_CENTER,
          marginBottom: theme.spacing.lg,
        }}
      >
        <h1 style={{ ...theme.typography.heading.h4, color: theme.colors.text.primary, margin: 0 }}>
          {t('contacts.title')}
        </h1>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: STRING_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: syncing ? 'not-allowed' : STRING_POINTER,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            opacity: syncing ? OPACITY_DISABLED : OPACITY_FULL,
            transition: theme.transitions.default,
          }}
        >
          {syncing ? t('contacts.syncing') : t('contacts.syncContacts')}
        </button>
      </div>

      <div style={{ marginBottom: theme.spacing.lg }}>
        <input
          type="text"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={t('contacts.searchPlaceholder')}
          style={{
            width: '100%',
            padding: theme.spacing.md,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            outline: STRING_NONE,
            backgroundColor: theme.colors.background.paper,
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: theme.spacing.md,
            backgroundColor: `${theme.colors.accent.error}20`,
            borderRadius: theme.borderRadius.md,
            color: theme.colors.accent.error,
            marginBottom: theme.spacing.lg,
          }}
        >
          {error}
        </div>
      )}

      <InlineContactSearchDebug query={searchQuery} />

      {(loading || searching) && (
        <div style={{ textAlign: STRING_CENTER, padding: theme.spacing.xl, color: theme.colors.text.secondary }}>
          {t('contacts.loading')}
        </div>
      )}

      {!loading && !searching && displayedContacts.length === 0 && (
        <ContactsEmptyState searchQuery={searchQuery} syncing={syncing} onSync={handleSync} />
      )}

      {!loading && !searching && displayedContacts.length > 0 && (
        <ContactsList contacts={displayedContacts} getContactTypeConfig={getContactTypeConfig} />
      )}
    </div>
  );
};

const Contacts: React.FC = () => {
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } =
    useSidebarState({ alwaysToggleable: true });
  const { contacts, contactTypes, loading, syncing, error, handleSync, getContactTypeConfig } = useContactsData(
    user?.id
  );

  return (
    <div style={{ display: STRING_FLEX, height: '100vh', overflow: STRING_HIDDEN }}>
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        canToggleCollapse={canToggleCollapse}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: theme.colors.background.default,
          padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.lg,
        }}
      >
        {isNarrow && (
          <button
            onClick={openMobileMenu}
            style={{
              position: STRING_FIXED,
              top: theme.spacing.md,
              left: theme.spacing.md,
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: STRING_POINTER,
              display: STRING_FLEX,
              alignItems: STRING_CENTER,
              justifyContent: STRING_CENTER,
              fontSize: '1.5rem',
              transition: theme.transitions.fast,
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label="Open navigation menu"
          >
            {EMOJI_MENU}
          </button>
        )}
        <ContactsMainContent
          contacts={contacts}
          contactTypes={contactTypes}
          loading={loading}
          syncing={syncing}
          error={error}
          handleSync={handleSync}
          getContactTypeConfig={getContactTypeConfig}
        />
      </div>
    </div>
  );
};

export default Contacts;
