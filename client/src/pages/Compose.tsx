import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { getNextMorning } from 'utils/dateUtils';
import { captureEvent } from 'utils/posthog';

import { ComposeActions } from 'components/compose/ComposeActions';
import { ComposeBody } from 'components/compose/ComposeBody';
import { ComposeMessages } from 'components/compose/ComposeMessages';
import { FrequentContactsList } from 'components/compose/FrequentContactsList';
import { RecipientFields } from 'components/compose/RecipientFields';
import { TimePicker } from 'components/compose/TimePicker';
import { AttachmentReminderBanner } from 'components/email-detail-inline/AttachmentReminderBanner';
import { ToneCheckResult } from 'components/email-detail-inline/ToneCheckResult';
import { ToneCheckToast } from 'components/notifications/ToneCheckToast';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { DELAY_1_5_SECONDS_MS, OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { EMAIL_FIELD_CC, EMAIL_FIELD_TO } from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';
import { useComposeForm } from 'hooks/useComposeForm';
import { useContactSearch } from 'hooks/useContactSearch';
import { useEmailDetailToneCheck } from 'hooks/useEmailDetailToneCheck';
import { useScheduledEmails } from 'hooks/useScheduledEmails';

const Compose: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useComposeForm();
  const search = useContactSearch();
  const { showError } = useNotifications();
  const {
    checkingTone,
    toneCheckResult,
    setToneCheckResult,
    checkTone,
    cancelToneCheck,
    disputing,
    disputeResult,
    disputeToneCheck,
  } = useEmailDetailToneCheck();
  const { timeSuggestions, checkSendTime, fetchTimeSuggestions } = useScheduledEmails();

  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [frequentContacts, setFrequentContacts] = useState<Contact[]>([]);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduledSendAt, setScheduledSendAt] = useState<Date | null>(null);
  const [timeWarning, setTimeWarning] = useState<string | undefined>();
  const [suggestedTime, setSuggestedTime] = useState<Date | undefined>();
  const [lastSelectedTime, setLastSelectedTime] = useState<Date | undefined>();

  useEffect(() => {
    captureEvent(ANALYTICS_EVENTS.COMPOSE_VIEWED);
  }, []);

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

  const handleSyncContacts = async () => {
    captureEvent(ANALYTICS_EVENTS.COMPOSE_CONTACTS_SYNCED);
    setSyncingContacts(true);
    try {
      await axios.post(`${API_URL}/contacts/sync`);
      const response = await axios.get(`${API_URL}/contacts/frequent?limit=6`);
      setFrequentContacts(response.data);
    } catch (err) {
      console.error('Failed to sync contacts:', err);
    } finally {
      setSyncingContacts(false);
    }
  };

  const handleAddRecipient = useCallback(
    (contact: Contact | { email: string; name?: string }, field: 'to' | 'cc' | 'bcc') => {
      const isFromSearch = search.searchResults.some(searchContact => searchContact.email === contact.email);
      const contactSource = isFromSearch ? 'search' : 'frequent';
      captureEvent(ANALYTICS_EVENTS.COMPOSE_CONTACT_SELECTED, { contact_source: contactSource });

      form.addRecipient(contact, field);
      search.clearSearch();
    },
    [form, search]
  );

  const handleSearchQueryChange = useCallback(
    (query: string) => {
      if (search.activeField) {
        search.handleSearchInput(query, search.activeField);
      }
    },
    [search]
  );

  const handleSelectSearchResult = useCallback(
    (contact: Contact) => {
      if (search.activeField) {
        handleAddRecipient(contact, search.activeField);
      }
    },
    [search.activeField, handleAddRecipient]
  );

  const handleSend = async () => {
    if (form.to.length === 0) {
      setError(t('compose.errorNoRecipient'));
      return;
    }
    if (!form.subject.trim()) {
      setError(t('compose.errorNoSubject'));
      return;
    }
    if (!form.body.trim()) {
      setError(t('compose.errorNoBody'));
      return;
    }

    setError(null);

    const toneOk = await checkTone(form.body.trim());
    if (!toneOk) {
      return;
    }

    setSending(true);
    captureEvent(ANALYTICS_EVENTS.COMPOSE_SENT, {
      recipient_count: form.to.length,
      has_cc: form.cc.length > 0,
      has_bcc: form.bcc.length > 0,
      has_subject: !!form.subject.trim(),
    });

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const payload = {
      to: form.to,
      cc: form.cc.length > 0 ? form.cc : undefined,
      bcc: form.bcc.length > 0 ? form.bcc : undefined,
      subject: form.subject.trim(),
      body: form.body.trim(),
      scheduledSendAt: scheduledSendAt?.toISOString(),
      userTimezone: scheduledSendAt ? userTimezone : undefined,
    };

    setSendSuccess(true);
    setSending(false);

    navigationTimeoutRef.current = setTimeout(() => {
      navigate('/inbox');
    }, DELAY_1_5_SECONDS_MS);

    axios.post(`${API_URL}/emails/send`, payload).catch((err: unknown) => {
      console.error('Error sending email:', err);
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      setSendSuccess(false);
      // eslint-disable-next-line id-denylist -- axios error response type uses 'data' property
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || t('compose.errorSendFailed'));
      showError(axiosErr.response?.data?.message || t('compose.errorSendFailed'));
    });
  };

  const handleOpenTimePicker = useCallback(() => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetchTimeSuggestions(userTimezone);
    setShowTimePicker(true);
  }, [fetchTimeSuggestions]);

  const handleTimeSelect = useCallback(
    async (time: Date) => {
      setLastSelectedTime(time);
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const checkResult = await checkSendTime(time, userTimezone);
      if (!checkResult.isAppropriate) {
        setTimeWarning(checkResult.warning);
        setSuggestedTime(checkResult.suggestion ? new Date(checkResult.suggestion) : undefined);
      } else {
        setTimeWarning(undefined);
        setSuggestedTime(undefined);
        setScheduledSendAt(time);
        setShowTimePicker(false);
      }
    },
    [checkSendTime]
  );

  const handleOverrideTime = useCallback((time: Date) => {
    setScheduledSendAt(time);
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
    setLastSelectedTime(undefined);
    setShowTimePicker(false);
  }, []);

  const handleCancelTimePicker = useCallback(() => {
    setShowTimePicker(false);
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
  }, []);

  let currentSearchQuery = '';
  if (search.activeField === EMAIL_FIELD_TO) {
    currentSearchQuery = search.toSearch;
  } else if (search.activeField === EMAIL_FIELD_CC) {
    currentSearchQuery = search.ccSearch;
  } else {
    currentSearchQuery = search.bccSearch;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.lg,
      }}
    >
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
          {t('compose.backToInbox')}
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
            opacity: syncingContacts ? OPACITY_DISABLED : OPACITY_FULL,
          }}
        >
          {syncingContacts ? t('compose.syncing') : t('compose.syncContacts')}
        </button>
      </div>

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
            {t('compose.newMessage')}
          </h1>
        </div>

        <div style={{ padding: theme.spacing.lg }}>
          <RecipientFields
            to={form.to}
            cc={form.cc}
            bcc={form.bcc}
            showCc={form.showCc}
            showBcc={form.showBcc}
            activeField={search.activeField}
            searchQuery={currentSearchQuery}
            searchResults={search.searchResults}
            recipientSuggestions={search.recipientSuggestions}
            onAddRecipient={handleAddRecipient}
            onRemoveRecipient={form.removeRecipient}
            onShowCc={() => form.setShowCc(true)}
            onShowBcc={() => form.setShowBcc(true)}
            onSetActiveField={search.setActiveField}
            onSearchQueryChange={handleSearchQueryChange}
            onSelectSearchResult={handleSelectSearchResult}
          />

          <ComposeBody
            subject={form.subject}
            body={form.body}
            onSubjectChange={form.setSubject}
            onBodyChange={form.setBody}
          />

          <FrequentContactsList
            frequentContacts={frequentContacts}
            to={form.to}
            activeField={search.activeField}
            onAddRecipient={handleAddRecipient}
          />

          <AttachmentReminderBanner attachmentReminder={toneCheckResult?.attachmentReminder} />
          <ToneCheckResult
            toneCheckResult={toneCheckResult}
            onUseRevisedText={text => {
              form.setBody(text);
              setToneCheckResult({ isOk: true, suggestions: [] });
            }}
            onDismiss={() => setToneCheckResult(null)}
            emailText={form.body}
            onDispute={disputeToneCheck}
            disputing={disputing}
            disputeResult={disputeResult}
            onScheduleForMorning={() => {
              captureEvent(ANALYTICS_EVENTS.TONE_CHECK_SCHEDULE_FOR_MORNING_COMPOSE);
              setScheduledSendAt(getNextMorning());
            }}
          />

          <ComposeMessages error={error} sendSuccess={sendSuccess} />
        </div>

        <ComposeActions
          sending={sending}
          sendSuccess={sendSuccess}
          checkingTone={checkingTone}
          onDiscard={() => navigate('/inbox')}
          onSend={handleSend}
          onSchedule={handleOpenTimePicker}
          scheduledSendAt={scheduledSendAt}
          onClearSchedule={() => setScheduledSendAt(null)}
        />
      </div>

      {showTimePicker && (
        <TimePicker
          selectedTime={scheduledSendAt}
          suggestions={timeSuggestions}
          onTimeSelect={handleTimeSelect}
          onCancel={handleCancelTimePicker}
          warning={timeWarning}
          suggestedTime={suggestedTime}
          onOverride={handleOverrideTime}
          lastSelectedTime={lastSelectedTime}
        />
      )}
      <ToneCheckToast visible={checkingTone} onCancel={cancelToneCheck} />
    </div>
  );
};

export default Compose;
