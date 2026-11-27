import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { HELP_ARTICLE_IDS, HelpArticleId, helpArticlePath } from 'constants/helpArticles';
import { MODE_ACTION, MODE_AUTORESPONDED, MODE_BLOCKED, MODE_TRIAGE } from 'constants/strings';

interface HelpLinkProps {
  mode: InboxMode;
}

/** The article explaining the inbox view the user is on. */
const getHelpArticleId = (mode: InboxMode): HelpArticleId => {
  if (mode === MODE_TRIAGE || mode === MODE_BLOCKED) {
    return HELP_ARTICLE_IDS.TRIAGE;
  }
  if (mode === MODE_ACTION) {
    return HELP_ARTICLE_IDS.ACTION;
  }
  if (mode === MODE_AUTORESPONDED) {
    return HELP_ARTICLE_IDS.AUTORESPONDER;
  }
  return HELP_ARTICLE_IDS.FOLLOW_UP;
};

export const HelpLink: React.FC<HelpLinkProps> = ({ mode }) => {
  const { t } = useTranslation();
  const articleId = getHelpArticleId(mode);

  return (
    <Link
      to={helpArticlePath(articleId)}
      onClick={() => {
        captureEvent(ANALYTICS_EVENTS.HELP_LINK_CLICKED, { help_type: articleId });
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
