import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { HELP_ARTICLE_GROUPS, HELP_ARTICLE_IDS, helpArticlePath } from 'constants/helpArticles';
import { ROUTE_HELP, ROUTE_INBOX } from 'constants/strings';
import { REPLAY_TOUR_PATH } from 'constants/tour';
import en from 'locales/en.json';
import es from 'locales/es.json';
import Help from 'pages/Help';
import HelpArticle from 'pages/HelpArticle';

// Keys render as-is; lookups with a default (the article section probes) come back empty so they terminate.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { exists: () => true, language: 'en' },
  }),
}));
vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('components/inbox/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('components/feedback/HelpFeedbackBanner', () => ({ HelpFeedbackBanner: () => null }));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={ROUTE_HELP} element={<Help />} />
        <Route path={`${ROUTE_HELP}/:articleId`} element={<HelpArticle />} />
      </Routes>
    </MemoryRouter>
  );
}

type LocaleTree = { [key: string]: string | LocaleTree };

function articleCopy(locale: LocaleTree, segment: string): LocaleTree | undefined {
  const help = locale.help as LocaleTree;
  return (help.articles as LocaleTree)[segment] as LocaleTree | undefined;
}

describe('Help index', () => {
  it('offers to replay the walkthrough', () => {
    renderAt(ROUTE_HELP);

    expect(screen.getByRole('link', { name: 'help.replayTour.button' })).toHaveAttribute('href', REPLAY_TOUR_PATH);
  });

  it('lists every article, grouped', () => {
    renderAt(ROUTE_HELP);

    HELP_ARTICLE_GROUPS.flatMap(group => group.articleIds).forEach(articleId => {
      expect(document.querySelector(`a[href="${helpArticlePath(articleId)}"]`)).not.toBeNull();
    });
  });

  it.each(HELP_ARTICLE_GROUPS.flatMap(group => group.articleIds))(
    'has English and Spanish copy for the "%s" article',
    articleId => {
      const segment = articleId.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
      [en as LocaleTree, es as LocaleTree].forEach(locale => {
        const copy = articleCopy(locale, segment);
        expect(copy?.title).toEqual(expect.any(String));
        expect(copy?.description).toEqual(expect.any(String));
        expect(copy?.content).toBeDefined();
      });
    }
  );
});

describe('Help article navigation', () => {
  it('goes straight back to the inbox in one click, as well as back to Help', () => {
    renderAt(helpArticlePath(HELP_ARTICLE_IDS.TRIAGE));

    expect(screen.getByRole('link', { name: /common\.backToInbox/ })).toHaveAttribute('href', ROUTE_INBOX);
    expect(screen.getByRole('link', { name: 'help.backToHelp' })).toHaveAttribute('href', ROUTE_HELP);
  });

  it('sends the retired Process article to its Action replacement', () => {
    renderAt(`${ROUTE_HELP}/process`);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('help.articles.action.title');
  });
});
