import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Email, PriorityExplanation } from 'types/email';
import { getCorrespondent } from 'utils/emailUtils';

import { PriorityBadge } from 'components/inbox/header/PriorityBadge';
import { SAVE_CONFIRMATION_DURATION_MS } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';
import { useContactNavigation } from 'hooks/useContactNavigation';
import { usePriorityTooltip } from 'hooks/usePriorityTooltip';

import { EmailDetailHeaderView } from './EmailDetailHeaderView';

interface EmailDetailHeaderProps {
  email: Email;
  threadEmails?: Email[];
  /**
   * Priority breakdown auto-loaded by the detail view (via useEmailDetailInitialization).
   * Used to render the click-popup instantly, so the user never sees a spinner after
   * clicking the chip — the popup itself is the same shared inbox-list component.
   */
  priorityExplanation: PriorityExplanation | null;
}

/**
 * Container component for the email detail header.
 * Resolves hook-based dependencies (auth, notifications, contact navigation) and
 * builds the shared inbox-list PriorityBadge (chip + click-popup), which it injects
 * into the presentational EmailDetailHeaderView.
 *
 * To render the layout in isolation, use EmailDetailHeaderView directly and pass a
 * `priorityBadge` node.
 */
export const EmailDetailHeader: React.FC<EmailDetailHeaderProps> = ({
  email,
  threadEmails = [],
  priorityExplanation,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showSuccess } = useNotifications();

  const correspondent = useMemo(() => {
    return getCorrespondent(email, user?.email, threadEmails);
  }, [email, threadEmails, user?.email]);

  const { navigateToContact } = useContactNavigation();

  // Same tooltip machinery as the inbox list (open/close, click-outside, expedite,
  // retry). Seeded with the auto-loaded explanation so the popup shows the breakdown
  // immediately; the hook's own fetch then refreshes it in the background.
  const tooltip = usePriorityTooltip();
  const priorityTooltip = useMemo(
    () => ({
      ...tooltip,
      priorityExplanation: tooltip.priorityExplanation ?? priorityExplanation,
      loadingPriorityExplanation: tooltip.loadingPriorityExplanation && !priorityExplanation,
      priorityExplanationError: tooltip.priorityExplanationError && !priorityExplanation,
    }),
    [tooltip, priorityExplanation]
  );

  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(correspondent.email);
      setEmailCopied(true);
      showSuccess(t('emailDetail.emailCopied'));
      setTimeout(() => setEmailCopied(false), SAVE_CONFIRMATION_DURATION_MS);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  }, [correspondent.email, showSuccess, t]);

  const priorityBadge = <PriorityBadge email={email} priorityTooltip={priorityTooltip} />;

  return (
    <EmailDetailHeaderView
      email={email}
      correspondent={correspondent}
      priorityBadge={priorityBadge}
      emailCopied={emailCopied}
      onNavigateToContact={(event, contactEmail, senderContactId) =>
        navigateToContact(event, contactEmail, senderContactId, { newTab: true })
      }
      onCopyEmail={handleCopyEmail}
      t={t}
    />
  );
};
