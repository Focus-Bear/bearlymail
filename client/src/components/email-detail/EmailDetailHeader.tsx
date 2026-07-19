import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Email } from 'types/email';
import { getCorrespondent } from 'utils/emailUtils';

import { SAVE_CONFIRMATION_DURATION_MS } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';
import { useContactNavigation } from 'hooks/useContactNavigation';

import { EmailDetailHeaderView, PriorityExplanation } from './EmailDetailHeaderView';

interface EmailDetailHeaderProps {
  email: Email;
  threadEmails?: Email[];
  priorityExplanation: PriorityExplanation | null;
  showPriorityExplanation: boolean;
  onFetchPriorityExplanation: () => void;
  onClosePriorityExplanation: () => void;
}

/**
 * Container component for the email detail header.
 * Resolves hook-based dependencies (auth, router, notifications, contact navigation)
 * and passes derived data/callbacks down to the presentational EmailDetailHeaderView.
 *
 * To render in Storybook or tests, use EmailDetailHeaderView directly.
 */
export const EmailDetailHeader: React.FC<EmailDetailHeaderProps> = ({
  email,
  threadEmails = [],
  priorityExplanation,
  showPriorityExplanation,
  onFetchPriorityExplanation,
  onClosePriorityExplanation,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showSuccess } = useNotifications();

  const correspondent = useMemo(() => {
    return getCorrespondent(email, user?.email, threadEmails);
  }, [email, threadEmails, user?.email]);

  const { navigateToContact } = useContactNavigation();

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

  const handleNavigateToSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  return (
    <EmailDetailHeaderView
      email={email}
      correspondent={correspondent}
      priorityExplanation={priorityExplanation}
      showPriorityExplanation={showPriorityExplanation}
      emailCopied={emailCopied}
      onFetchPriorityExplanation={onFetchPriorityExplanation}
      onClosePriorityExplanation={onClosePriorityExplanation}
      onNavigateToContact={(event, contactEmail, senderContactId) =>
        navigateToContact(event, contactEmail, senderContactId, { newTab: true })
      }
      onCopyEmail={handleCopyEmail}
      onNavigateToSettings={handleNavigateToSettings}
      t={t}
    />
  );
};
