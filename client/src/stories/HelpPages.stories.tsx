/**
 * The Help page (grouped articles plus the "Replay the walkthrough" card) and a
 * Help article with its one-click "Back to Inbox" link, rendered with the real
 * pages, sidebar and English copy.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';

import { HELP_ARTICLE_IDS, HelpArticleId, helpArticlePath } from 'constants/helpArticles';
import { ROUTE_HELP } from 'constants/strings';
import { AuthContext } from 'contexts/AuthContext';
import en from 'locales/en.json';
import Help from 'pages/Help';
import HelpArticle from 'pages/HelpArticle';

const helpI18n = i18n.createInstance();
helpI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const storyAuth = {
  user: { id: 'demo-user-1', email: 'demo@bearlymail.com', isAdmin: false },
  logout: () => undefined,
} as unknown as React.ContextType<typeof AuthContext>;

// The sidebar's plan/usage queries have no API in Storybook; don't retry them.
const storyQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Cancels the global Storybook wrapper's padding so the page fills the viewport like the app. */
const STORYBOOK_WRAPPER_PADDING = '-24px';

const HelpPage: React.FC<{ articleId?: HelpArticleId }> = ({ articleId }) => (
  <I18nextProvider i18n={helpI18n}>
    <QueryClientProvider client={storyQueryClient}>
      <AuthContext.Provider value={storyAuth}>
        <MemoryRouter initialEntries={[articleId ? helpArticlePath(articleId) : ROUTE_HELP]}>
          <div style={{ margin: STORYBOOK_WRAPPER_PADDING }}>
            <Routes>
              <Route path={ROUTE_HELP} element={<Help />} />
              <Route path={`${ROUTE_HELP}/:articleId`} element={<HelpArticle />} />
            </Routes>
          </div>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  </I18nextProvider>
);

const meta: Meta<typeof HelpPage> = {
  title: 'Help/Help pages',
  component: HelpPage,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof HelpPage>;

export const HelpIndex: Story = { args: {} };

export const TriageArticle: Story = { args: { articleId: HELP_ARTICLE_IDS.TRIAGE } };

export const TroubleshootingArticle: Story = { args: { articleId: HELP_ARTICLE_IDS.TROUBLESHOOTING } };
