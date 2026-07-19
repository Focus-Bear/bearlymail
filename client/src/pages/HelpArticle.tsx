import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { theme } from 'theme/theme';

import { HelpFeedbackBanner } from 'components/feedback/HelpFeedbackBanner';
import { Sidebar } from 'components/inbox/Sidebar';
import { useAuth } from 'contexts/AuthContext';
import { useSidebarState } from 'hooks/useSidebarState';

const HelpArticle: React.FC = () => {
  const { articleId } = useParams<{ articleId: string }>();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, closeMobileMenu } = useSidebarState({
    alwaysToggleable: true,
  });

  const getArticleContent = () => {
    if (!articleId) {
      return null;
    }

    const contentKey = `help.articles.${articleId}.content`;
    const titleKey = `help.articles.${articleId}.title`;

    // Get content sections
    const sections = [];
    let sectionIndex = 0;
    while (true) {
      const sectionKey = `${contentKey}.section${sectionIndex}`;
      const sectionTitle = t(`${sectionKey}.title`, { defaultValue: '' });
      if (!sectionTitle && sectionIndex > 0) {
        break;
      }

      sections.push({
        title: sectionTitle || (sectionIndex === 0 ? t(titleKey) : ''),
        content: t(`${sectionKey}.content`, { defaultValue: '' }),
        items: [] as string[],
      });

      // Check for list items
      let itemIndex = 0;
      const items: string[] = [];
      while (true) {
        const itemKey = `${sectionKey}.item${itemIndex}`;
        const item = t(itemKey, { defaultValue: '' });
        if (!item) {
          break;
        }
        items.push(item);
        itemIndex++;
      }
      if (items.length > 0) {
        sections[sections.length - 1].items = items;
      }

      sectionIndex++;
    }

    return {
      title: t(titleKey),
      sections,
    };
  };

  const article = getArticleContent();

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
            <div style={{ marginBottom: theme.spacing.lg }}>
              <Link
                to="/help"
                style={{
                  color: theme.colors.primary.main,
                  fontSize: theme.typography.fontSize.base,
                  textDecoration: 'underline',
                  marginBottom: theme.spacing.sm,
                  display: 'inline-block',
                }}
              >
                ← {t('help.backToHelp')}
              </Link>
            </div>

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
