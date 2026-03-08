import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { MODE_ACTION, MODE_AUTORESPONDED, MODE_BLOCKED, MODE_TRIAGE } from 'constants/strings';

interface HelpLinkProps {
  mode: InboxMode;
}

const getHelpLink = (mode: InboxMode): string => {
  if (mode === MODE_TRIAGE) {
    return '/help/triage';
  }
  if (mode === MODE_ACTION) {
    return '/help/process';
  }
  if (mode === MODE_AUTORESPONDED) {
    return '/help/autoresponder';
  }
  if (mode === MODE_BLOCKED) {
    return '/help/triage';
  }
  return '/help/follow-up';
};

const getHelpType = (mode: InboxMode): string => {
  if (mode === MODE_TRIAGE) {
    return 'triage';
  }
  if (mode === MODE_ACTION) {
    return 'process';
  }
  if (mode === MODE_AUTORESPONDED) {
    return 'autoresponder';
  }
  if (mode === MODE_BLOCKED) {
    return 'triage';
  }
  return 'follow-up';
};

export const HelpLink: React.FC<HelpLinkProps> = ({ mode }) => {
  const { t } = useTranslation();

  return (
    <Link
      to={getHelpLink(mode)}
      onClick={() => {
        captureEvent(ANALYTICS_EVENTS.HELP_LINK_CLICKED, { help_type: getHelpType(mode) });
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        backgroundColor: theme.colors.background.subtle,
        color: theme.colors.text.secondary,
        textDecoration: 'none',
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.bold,
        transition: theme.transitions.default,
      }}
      onMouseEnter={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.subtle;
        event.currentTarget.style.color = theme.colors.primary.main;
      }}
      onMouseLeave={event => {
        event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
        event.currentTarget.style.color = theme.colors.text.secondary;
      }}
      title={t('help.title')}
    >
      ?
    </Link>
  );
};
