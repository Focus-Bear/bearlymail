import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { BackToInboxLink } from 'components/common/BackToInboxLink';
import { HelpFeedbackBanner } from 'components/feedback/HelpFeedbackBanner';
import { ReplayTourCard } from 'components/help/ReplayTourCard';
import { Sidebar } from 'components/inbox/Sidebar';
import { HELP_ARTICLE_GROUPS, HelpArticleId, helpArticlePath, toArticleKeySegment } from 'constants/helpArticles';
import { useAuth } from 'contexts/AuthContext';
import { useSidebarState } from 'hooks/useSidebarState';

const HelpArticleCard: React.FC<{ articleId: HelpArticleId }> = ({ articleId }) => {
  const { t } = useTranslation();
  const keyPrefix = `help.articles.${toArticleKeySegment(articleId)}`;
  return (
    <Link
      to={helpArticlePath(articleId)}
      style={{
        display: 'block',
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.lg,
        textDecoration: 'none',
        transition: theme.transitions.default,
        cursor: 'pointer',
      }}
      onMouseEnter={event => {
        event.currentTarget.style.borderColor = theme.colors.primary.main;
        event.currentTarget.style.boxShadow = theme.shadows.md;
      }}
      onMouseLeave={event => {
        event.currentTarget.style.borderColor = theme.colors.border.light;
        event.currentTarget.style.boxShadow = 'none';
      }}
    >
      <h3
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.xl,
          marginBottom: theme.spacing.xs,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t(`${keyPrefix}.title`)}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.base,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}
      >
        {t(`${keyPrefix}.description`)}
      </p>
    </Link>
  );
};

const Help: React.FC = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, closeMobileMenu } = useSidebarState({
    alwaysToggleable: true,
  });
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        canToggleCollapse={canToggleCollapse}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing.xl }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: theme.spacing.lg }}>
              <BackToInboxLink />
            </div>

            <h1
              style={{
                color: theme.colors.text.primary,
                fontSize: theme.typography.fontSize['3xl'],
                marginBottom: theme.spacing.sm,
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {t('help.title')}
            </h1>

            <p
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.base,
                marginBottom: theme.spacing.xl,
                lineHeight: theme.typography.lineHeight.relaxed,
              }}
            >
              {t('help.description')}
            </p>

            <HelpFeedbackBanner />

            <ReplayTourCard />

            {HELP_ARTICLE_GROUPS.map(group => (
              <section key={group.titleKey} style={{ marginBottom: theme.spacing.xl }}>
                <h2
                  style={{
                    color: theme.colors.text.tertiary,
                    fontSize: theme.typography.fontSize.sm,
                    fontWeight: theme.typography.fontWeight.semibold,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  {t(group.titleKey)}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
                  {group.articleIds.map(articleId => (
                    <HelpArticleCard key={articleId} articleId={articleId} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
