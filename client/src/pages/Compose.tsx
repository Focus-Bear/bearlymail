import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Contact } from 'types/contact';
import { getNextMorning } from 'utils/dateUtils';
import { captureEvent } from 'utils/posthog';
import { markScheduledEmailSent } from 'utils/scheduledTour';

import { BackToInboxLink } from 'components/common/BackToInboxLink';
import { ComposeActions } from 'components/compose/ComposeActions';
import { ComposeBody } from 'components/compose/ComposeBody';
import { ComposeMessages } from 'components/compose/ComposeMessages';
import { FrequentContactsList } from 'components/compose/FrequentContactsList';
import { RecipientFields } from 'components/compose/RecipientFields';
import { TimePicker } from 'components/compose/TimePicker';
import { ConfirmModal } from 'components/ConfirmModal';
import { AttachmentReminderBanner } from 'components/email-detail-inline/AttachmentReminderBanner';
import { ReplyComposerAttachments } from 'components/email-detail-inline/ReplyComposerAttachments';
import { ToneCheckResult } from 'components/email-detail-inline/ToneCheckResult';
import { SidebarPageLayout } from 'components/layout/SidebarPageLayout';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { DELAY_1_5_SECONDS_MS, OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { EMAIL_FIELD_CC, EMAIL_FIELD_TO } from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';
import { useComposeForm } from 'hooks/useComposeForm';
import { useContactSearch } from 'hooks/useContactSearch';
import { useEmailDetailToneCheck } from 'hooks/useEmailDetailToneCheck';
import { useScheduledEmails } from 'hooks/useScheduledEmails';
import { useUnsavedChangesGuard } from 'hooks/useUnsavedChangesGuard';

interface ComposeSendArgs {
  to: { email: string; name?: string }[];
  cc: { email: string; name?: string }[];
  bcc: { email: string; name?: string }[];
  subject: string;
  body: string;
  attachments: File[];
  scheduledSendAtIso?: string;
  userTimezone: string;
}

/**
 * POSTs a composed email to /emails/send. When attachments are present the
 * request must be multipart/form-data (the endpoint reads files via Multer's
 * `files` field); recipient objects are JSON-encoded so the server parses them
 * back into arrays. Otherwise a plain JSON body is sent.
 */
const postComposedEmail = async (args: ComposeSendArgs): Promise<void> => {
  const { to, cc, bcc, subject, body, attachments, scheduledSendAtIso, userTimezone } = args;

  if (attachments.length === 0) {
    await axios.post(`${API_URL}/emails/send`, {
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      body,
      scheduledSendAt: scheduledSendAtIso,
      userTimezone: scheduledSendAtIso ? userTimezone : undefined,
    });
    return;
  }

  const formData = new FormData();
  formData.append('to', JSON.stringify(to));
  if (cc.length > 0) {
    formData.append('cc', JSON.stringify(cc));
  }
  if (bcc.length > 0) {
    formData.append('bcc', JSON.stringify(bcc));
  }
  formData.append('subject', subject);
  formData.append('body', body);
  if (scheduledSendAtIso) {
    formData.append('scheduledSendAt', scheduledSendAtIso);
    formData.append('userTimezone', userTimezone);
  }
  attachments.forEach(file => formData.append('files', file));
  // Let Axios/the browser set Content-Type with the multipart boundary — an
  // explicit 'multipart/form-data' header omits the boundary and breaks Multer.
  await axios.post(`${API_URL}/emails/send`, formData);
};

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

  const handleSend = async (options: { bypassToneCheck?: boolean } = {}) => {
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

    if (options.bypassToneCheck) {
      setToneCheckResult(null);
    } else {
      const toneOk = await checkTone(form.body.trim());
      if (!toneOk) {
        return;
      }
    }

    setSending(true);
    captureEvent(ANALYTICS_EVENTS.COMPOSE_SENT, {
      recipient_count: form.to.length,
      has_cc: form.cc.length > 0,
      has_bcc: form.bcc.length > 0,
      has_subject: !!form.subject.trim(),
      has_attachments: form.attachments.length > 0,
    });

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const scheduledSendAtIso = scheduledSendAt?.toISOString();

    try {
      await postComposedEmail({
        to: form.to,
        cc: form.cc,
        bcc: form.bcc,
        subject: form.subject.trim(),
        body: form.body.trim(),
        attachments: form.attachments,
        scheduledSendAtIso,
        userTimezone,
      });
      setSendSuccess(true);
      if (scheduledSendAt) {
        // Surface where scheduled emails live (inbox ⋮ menu) on next inbox view.
        markScheduledEmailSent();
      }
      navigationTimeoutRef.current = setTimeout(() => {
        navigate('/inbox');
      }, DELAY_1_5_SECONDS_MS);
    } catch (err: unknown) {
      console.error('Error sending email:', err);
      // eslint-disable-next-line id-denylist -- axios error response type uses 'data' property
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || t('compose.errorSendFailed'));
      showError(axiosErr.response?.data?.message || t('compose.errorSendFailed'));
    } finally {
      setSending(false);
    }
  };

  const isDirty =
    !sendSuccess &&
    (form.to.length > 0 ||
      form.cc.length > 0 ||
      form.bcc.length > 0 ||
      !!form.subject.trim() ||
      !!form.body.trim() ||
      form.attachments.length > 0 ||
      !!scheduledSendAt);

  // Guards reload/close via beforeunload and intercepts in-app link clicks
  // (the sidebar and the BackToInboxLink render as real links on this page)
  // while the draft is unsent.
  const { pendingPath, confirmNavigation, cancelNavigation } = useUnsavedChangesGuard(isDirty);

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
    <SidebarPageLayout>
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
        <BackToInboxLink />

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
            onBodyChange={text => {
              form.setBody(text);
              if (toneCheckResult && !toneCheckResult.isOk) {
                setToneCheckResult(null);
              }
            }}
          />

          <ReplyComposerAttachments files={form.attachments} onFilesChange={form.setAttachments} />

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

          <ComposeMessages error={error} sendSuccess={sendSuccess} scheduledFor={scheduledSendAt} />
        </div>

        <ComposeActions
          sending={sending}
          sendSuccess={sendSuccess}
          checkingTone={checkingTone}
          onDiscard={() => navigate('/inbox')}
          onSend={() => void handleSend()}
          onSchedule={handleOpenTimePicker}
          scheduledSendAt={scheduledSendAt}
          onClearSchedule={() => setScheduledSendAt(null)}
          toneCheckFailed={!!(toneCheckResult && !toneCheckResult.isOk)}
          onSendAnyway={() => {
            captureEvent(ANALYTICS_EVENTS.TONE_CHECK_SEND_ANYWAY);
            void handleSend({ bypassToneCheck: true });
          }}
        />
      </div>

      <ConfirmModal
        isOpen={!!pendingPath}
        title={t('compose.unsavedChangesTitle')}
        message={scheduledSendAt ? t('compose.confirmLeaveScheduled') : t('compose.confirmLeave')}
        confirmLabel={t('compose.leaveAnyway')}
        cancelLabel={t('compose.keepEditing')}
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />

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
    </SidebarPageLayout>
  );
};

export default Compose;
