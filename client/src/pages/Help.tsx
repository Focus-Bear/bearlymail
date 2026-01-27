import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'contexts/AuthContext';
import { Sidebar } from 'components/inbox/Sidebar';
import { theme } from 'theme/theme';

interface HelpArticle {
  id: string;
  titleKey: string;
  descriptionKey: string;
  path: string;
}

const Help: React.FC = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const articles: HelpArticle[] = [
    {
      id: 'context',
      titleKey: 'help.articles.context.title',
      descriptionKey: 'help.articles.context.description',
      path: '/help/context',
    },
    {
      id: 'triage',
      titleKey: 'help.articles.triage.title',
      descriptionKey: 'help.articles.triage.description',
      path: '/help/triage',
    },
    {
      id: 'process',
      titleKey: 'help.articles.process.title',
      descriptionKey: 'help.articles.process.description',
      path: '/help/process',
    },
    {
      id: 'follow-up',
      titleKey: 'help.articles.followUp.title',
      descriptionKey: 'help.articles.followUp.description',
      path: '/help/follow-up',
    },
    {
      id: 'search',
      titleKey: 'help.articles.search.title',
      descriptionKey: 'help.articles.search.description',
      path: '/help/search',
    },
    {
      id: 'settings',
      titleKey: 'help.articles.settings.title',
      descriptionKey: 'help.articles.settings.description',
      path: '/help/settings',
    },
    {
      id: 'autoresponder',
      titleKey: 'help.articles.autoresponder.title',
      descriptionKey: 'help.articles.autoresponder.description',
      path: '/help/autoresponder',
    },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar user={user} logout={logout} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing.xl }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <button
              onClick={() => navigate('/inbox')}
              style={{
                background: 'none',
                border: 'none',
                color: theme.colors.primary.main,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.base,
                marginBottom: theme.spacing.lg,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              ← {t('settings.backToInbox')}
            </button>

            <h1 style={{
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize['3xl'],
              marginBottom: theme.spacing.sm,
              fontWeight: theme.typography.fontWeight.bold,
            }}>
              {t('help.title')}
            </h1>

            <p style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.base,
              marginBottom: theme.spacing.xl,
              lineHeight: theme.typography.lineHeight.relaxed,
            }}>
              {t('help.description')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
              {articles.map((article) => (
                <Link
                  key={article.id}
                  to={article.path}
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = theme.colors.primary.main;
                    e.currentTarget.style.boxShadow = theme.shadows.md;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = theme.colors.border.light;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <h2 style={{
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.fontSize.xl,
                    marginBottom: theme.spacing.xs,
                    fontWeight: theme.typography.fontWeight.semibold,
                  }}>
                    {t(article.titleKey)}
                  </h2>
                  <p style={{
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.fontSize.base,
                    lineHeight: theme.typography.lineHeight.relaxed,
                  }}>
                    {t(article.descriptionKey)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;









