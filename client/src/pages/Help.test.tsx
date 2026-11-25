import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';

import {
  ALL_HELP_ARTICLE_IDS,
  HELP_ARTICLE_IDS,
  HelpArticleId,
  helpArticlePath,
  toArticleKeySegment,
} from 'constants/helpArticles';
import { ROUTE_HELP, ROUTE_INBOX } from 'constants/strings';
import { REPLAY_TOUR_PATH } from 'constants/tour';
import en from 'locales/en.json';
import es from 'locales/es.json';
import Help from 'pages/Help';
import HelpArticle from 'pages/HelpArticle';

vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('components/inbox/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('components/feedback/HelpFeedbackBanner', () => ({ HelpFeedbackBanner: () => null }));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const helpI18n = i18n.createInstance();
helpI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const SEARCH_LABEL = en.help.search.label;

function renderAt(path: string) {
  render(
    <I18nextProvider i18n={helpI18n}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={ROUTE_HELP} element={<Help />} />
          <Route path={`${ROUTE_HELP}/:articleId`} element={<HelpArticle />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  );
}

function articleLink(articleId: HelpArticleId): Element | null {
  return document.querySelector(`a[href="${helpArticlePath(articleId)}"]`);
}

function search(query: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: SEARCH_LABEL }), { target: { value: query } });
}

type LocaleTree = { [key: string]: string | LocaleTree };

function articleCopy(locale: LocaleTree, segment: string): LocaleTree | undefined {
  const help = locale.help as LocaleTree;
  return (help.articles as LocaleTree)[segment] as LocaleTree | undefined;
}

describe('Help index', () => {
  it('offers to replay the walkthrough', () => {
    renderAt(ROUTE_HELP);

    expect(screen.getByRole('link', { name: en.help.replayTour.button })).toHaveAttribute('href', REPLAY_TOUR_PATH);
  });

  it('lists every article, grouped', () => {
    renderAt(ROUTE_HELP);

    ALL_HELP_ARTICLE_IDS.forEach(articleId => expect(articleLink(articleId)).not.toBeNull());
  });

  it('lists no article twice', () => {
    expect(new Set(ALL_HELP_ARTICLE_IDS).size).toBe(ALL_HELP_ARTICLE_IDS.length);
  });

  it.each(ALL_HELP_ARTICLE_IDS)('has English and Spanish copy for the "%s" article', articleId => {
    const segment = toArticleKeySegment(articleId);
    [en as LocaleTree, es as LocaleTree].forEach(locale => {
      const copy = articleCopy(locale, segment);
      expect(copy?.title).toEqual(expect.any(String));
      expect(copy?.description).toEqual(expect.any(String));
      expect(copy?.content).toBeDefined();
    });
  });

  it.each(ALL_HELP_ARTICLE_IDS.filter(articleId => articleId !== HELP_ARTICLE_IDS.AUTORESPONDER))(
    'shows no raw {{placeholder}} in the "%s" article (only the auto-responder documents real merge tags)',
    articleId => {
      const segment = toArticleKeySegment(articleId);
      [en as LocaleTree, es as LocaleTree].forEach(locale => {
        expect(JSON.stringify(articleCopy(locale, segment))).not.toContain('{{');
      });
    }
  );
});

describe('Help search', () => {
  it('narrows the list to articles mentioning every word typed, even deep in the article', () => {
    renderAt(ROUTE_HELP);

    search('tap 30');

    expect(articleLink(HELP_ARTICLE_IDS.TRIAGE)).not.toBeNull();
    expect(articleLink(HELP_ARTICLE_IDS.PRIVACY)).toBeNull();
  });

  it('says so when nothing matches', () => {
    renderAt(ROUTE_HELP);

    search('zzqxv');

    expect(screen.getByRole('status')).toHaveTextContent('zzqxv');
  });
});

describe('Help article navigation', () => {
  it('goes straight back to the inbox in one click, as well as back to Help', () => {
    renderAt(helpArticlePath(HELP_ARTICLE_IDS.TRIAGE));

    expect(screen.getByRole('link', { name: new RegExp(en.common.backToInbox) })).toHaveAttribute('href', ROUTE_INBOX);
    expect(screen.getByRole('link', { name: en.help.backToHelp })).toHaveAttribute('href', ROUTE_HELP);
  });

  it('sends the retired Process article to its Action replacement', () => {
    renderAt(`${ROUTE_HELP}/process`);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(en.help.articles.action.title);
  });
});
