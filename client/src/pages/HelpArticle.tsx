import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import { theme } from 'theme/theme';
import { readHelpArticle } from 'utils/helpArticleContent';

import { BackToInboxLink } from 'components/common/BackToInboxLink';
import { HelpFeedbackBanner } from 'components/feedback/HelpFeedbackBanner';
import { Sidebar } from 'components/inbox/Sidebar';
import { HELP_ARTICLE_REDIRECTS, helpArticlePath } from 'constants/helpArticles';
import { ROUTE_HELP } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useSidebarState } from 'hooks/useSidebarState';

const HelpArticle: React.FC = () => {
  const { articleId } = useParams<{ articleId: string }>();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, closeMobileMenu } = useSidebarState({
    alwaysToggleable: true,
  });

  const redirectTo = articleId ? HELP_ARTICLE_REDIRECTS[articleId] : undefined;
  if (redirectTo) {
    return <Navigate to={helpArticlePath(redirectTo)} replace />;
  }

  const article = articleId ? readHelpArticle(articleId, key => t(key, { defaultValue: '' })) : null;

  if (!article || !articleId) {
    return (
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar
          user={user}
          logout={logout}
          isCollapsed={isCollapsed}
          canToggleCollapse={canToggleCollapse}
          onToggleCollapse={toggleCollapse}
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={closeMobileMenu}
        />
        <div style={{ flex: 1, padding: theme.spacing.xl }}>
          <BackToInboxLink />
          <p>{t('help.articleNotFound')}</p>
        </div>
      </div>
    );
  }

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
            <nav
              aria-label={t('help.navigationLabel')}
              style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}
            >
              {/* Inbox first: most people leave an article to get back to their email, not to the help index. */}
              <BackToInboxLink />
              <Link
                to={ROUTE_HELP}
                style={{
                  color: theme.colors.primary.main,
                  fontSize: theme.typography.fontSize.base,
                  textDecoration: 'underline',
                }}
              >
                {t('help.backToHelp')}
              </Link>
            </nav>

            <h1
              style={{
                color: theme.colors.text.primary,
                fontSize: theme.typography.fontSize['3xl'],
                marginBottom: theme.spacing.xl,
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {article.title}
            </h1>

            <HelpFeedbackBanner />

            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xl }}>
              {article.sections.map((section, index) => {
                // Generate anchor ID from section title
                const anchorId = section.title
                  ? section.title
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '')
                  : `section-${index}`;

                return (
                  <div key={anchorId || `section-${section.title}`} id={anchorId}>
                    {section.title && (
                      <h2
                        style={{
                          color: theme.colors.text.primary,
                          fontSize: theme.typography.fontSize.xl,
                          marginBottom: theme.spacing.md,
                          fontWeight: theme.typography.fontWeight.semibold,
                          scrollMarginTop: '80px', // Offset for fixed headers
                        }}
                      >
                        {section.title}
                      </h2>
                    )}
                    {section.content && (
                      <div
                        style={{
                          color: theme.colors.text.secondary,
                          fontSize: theme.typography.fontSize.base,
                          lineHeight: theme.typography.lineHeight.relaxed,
                          marginBottom: theme.spacing.md,
                          whiteSpace: 'pre-line',
                        }}
                      >
                        {section.content}
                      </div>
                    )}
                    {section.items.length > 0 && (
                      <ul
                        style={{
                          color: theme.colors.text.secondary,
                          fontSize: theme.typography.fontSize.base,
                          lineHeight: theme.typography.lineHeight.relaxed,
                          paddingLeft: theme.spacing.lg,
                          marginBottom: theme.spacing.md,
                        }}
                      >
                        {section.items.map((item, itemIndex) => (
                          <li
                            key={`${section.title}-${item.substring(0, 100)}`}
                            style={{ marginBottom: theme.spacing.xs }}
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpArticle;
