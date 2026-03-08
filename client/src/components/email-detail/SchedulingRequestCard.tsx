import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_CALENDAR } from 'constants/emojis';
import { SHORT_TIMEOUT_MS } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

interface SchedulingRequestCardProps {
  email: Email;
  onDraftReply?: (draft: string) => void;
}

interface SchedulingActionButtonsProps {
  linkCopied: boolean;
  drafting: boolean;
  onCopyLink: () => void;
  onDraftReply: () => void;
}

const SchedulingActionButtons: React.FC<SchedulingActionButtonsProps> = ({
  linkCopied,
  drafting,
  onCopyLink,
  onDraftReply,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
      <button
        onClick={onCopyLink}
        style={{
          flex: 1,
          minWidth: '120px',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: linkCopied ? theme.colors.accent.success : theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {linkCopied ? t('emailDetail.schedulingRequest.linkCopied') : t('emailDetail.schedulingRequest.copyLink')}
      </button>

      <button
        onClick={onDraftReply}
        disabled={drafting}
        style={{
          flex: 1,
          minWidth: '120px',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: drafting ? theme.colors.border.medium : 'transparent',
          color: drafting ? 'white' : theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: drafting ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {drafting ? t('emailDetail.schedulingRequest.drafting') : t('emailDetail.schedulingRequest.draftReply')}
      </button>
    </div>
  );
};

export const SchedulingRequestCard: React.FC<SchedulingRequestCardProps> = ({ email, onDraftReply }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [linkCopied, setLinkCopied] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const handleCopyLink = useCallback(async () => {
    const schedulingUrl = `${window.location.origin}/book/${user?.id ?? ''}`;
    try {
      await navigator.clipboard.writeText(schedulingUrl);
      setLinkCopied(true);
      captureEvent('scheduling_link_copied', { email_id: email.id });
      setTimeout(() => setLinkCopied(false), SHORT_TIMEOUT_MS);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [email.id, user?.id]);

  const handleDraftReply = useCallback(async () => {
    setDrafting(true);
    captureEvent('scheduling_draft_reply_clicked', { email_id: email.id });
    try {
      const response = await axios.post(`${API_URL}/calendar/meeting-reply/${email.id}`);
      if (response.data?.draft && onDraftReply) {
        onDraftReply(response.data.draft);
      }
    } catch (err) {
      console.error('Failed to draft meeting reply:', err);
    } finally {
      setDrafting(false);
    }
  }, [email.id, onDraftReply]);

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.primary.main}`,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs }}>
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{EMOJI_CALENDAR}</span>
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('emailDetail.schedulingRequest.title')}
        </span>
      </div>

      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          lineHeight: theme.typography.lineHeight.normal,
        }}
      >
        {t('emailDetail.schedulingRequest.description')}
      </div>

      <SchedulingActionButtons
        linkCopied={linkCopied}
        drafting={drafting}
        onCopyLink={handleCopyLink}
        onDraftReply={handleDraftReply}
      />
    </div>
  );
};
