import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import {
  HelpArticleContent,
  matchesHelpQuery,
  readHelpArticle,
  toHelpSearchText,
} from 'utils/helpArticleContent';

import { ALL_HELP_ARTICLE_IDS, HELP_ARTICLE_GROUPS, HelpArticleId, helpArticlePath } from 'constants/helpArticles';

/** Narrow enough for two columns beside each other inside the 800px Help column, one on phones. */
const CARD_MIN_WIDTH = '260px';

interface IndexedArticle {
  id: HelpArticleId;
  article: HelpArticleContent;
  searchText: string;
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}, 1fr))`,
  gap: theme.spacing.sm,
};

const groupHeadingStyle: React.CSSProperties = {
  color: theme.colors.text.tertiary,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: theme.spacing.sm,
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  marginBottom: theme.spacing.lg,
  fontSize: theme.typography.fontSize.base,
  color: theme.colors.text.primary,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
};

const HelpArticleCard: React.FC<{ id: HelpArticleId; article: HelpArticleContent }> = ({ id, article }) => (
  <Link
    to={helpArticlePath(id)}
    style={{
      display: 'block',
      padding: theme.spacing.md,
      backgroundColor: theme.colors.background.paper,
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.borderRadius.lg,
      textDecoration: 'none',
      transition: theme.transitions.default,
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
        margin: `0 0 ${theme.spacing.xs}`,
        color: theme.colors.text.primary,
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
      }}
    >
      {article.title}
    </h3>
    <p
      style={{
        margin: 0,
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.sm,
        lineHeight: theme.typography.lineHeight.relaxed,
      }}
    >
      {article.description}
    </p>
  </Link>
);

/** Articles whose title matches come before ones that only mention the words in passing. */
function searchArticles(articles: IndexedArticle[], query: string): IndexedArticle[] {
  const matches = articles.filter(entry => matchesHelpQuery(entry.searchText, query));
  const isTitleMatch = (entry: IndexedArticle) => matchesHelpQuery(entry.article.title.toLowerCase(), query);
  return [...matches.filter(isTitleMatch), ...matches.filter(entry => !isTitleMatch(entry))];
}

const SearchResults: React.FC<{ results: IndexedArticle[]; query: string }> = ({ results, query }) => {
  const { t } = useTranslation();
  if (results.length === 0) {
    return (
      <p role="status" style={{ color: theme.colors.text.secondary, lineHeight: theme.typography.lineHeight.relaxed }}>
        {t('help.search.noResults', { query })}
      </p>
    );
  }
  return (
    <section aria-label={t('help.search.resultsLabel')}>
      <div style={gridStyle}>
        {results.map(entry => (
          <HelpArticleCard key={entry.id} id={entry.id} article={entry.article} />
        ))}
      </div>
    </section>
  );
};

const GroupedArticles: React.FC<{ articlesById: Map<HelpArticleId, IndexedArticle> }> = ({ articlesById }) => {
  const { t } = useTranslation();
  return (
    <>
      {HELP_ARTICLE_GROUPS.map(group => (
        <section key={group.titleKey} style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={groupHeadingStyle}>{t(group.titleKey)}</h2>
          <div style={gridStyle}>
            {group.articleIds.flatMap(id => {
              const entry = articlesById.get(id);
              return entry ? [<HelpArticleCard key={id} id={id} article={entry.article} />] : [];
            })}
          </div>
        </section>
      ))}
    </>
  );
};

/**
 * The Help index: a search box over every article's full text, and the
 * articles grouped by topic while nothing has been typed.
 */
export const HelpArticleBrowser: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');

  const articles = useMemo<IndexedArticle[]>(
    () =>
      ALL_HELP_ARTICLE_IDS.flatMap(id => {
        const article = readHelpArticle(id, key => t(key, { defaultValue: '' }));
        return article ? [{ id, article, searchText: toHelpSearchText(article) }] : [];
      }),
    // Re-read when the language changes; `t` alone is stable across it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language]
  );
  const articlesById = useMemo(() => new Map(articles.map(entry => [entry.id, entry])), [articles]);
  const trimmedQuery = query.trim();

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={t('help.search.placeholder')}
        aria-label={t('help.search.label')}
        style={searchInputStyle}
      />
      {trimmedQuery ? (
        <SearchResults results={searchArticles(articles, trimmedQuery)} query={trimmedQuery} />
      ) : (
        <GroupedArticles articlesById={articlesById} />
      )}
    </>
  );
};
