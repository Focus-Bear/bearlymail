import { toArticleKeySegment } from 'constants/helpArticles';

/**
 * Help article copy lives in the locale files as numbered keys
 * (help.articles.<id>.content.section0.title, ...item0, ...item1). These helpers
 * read it back into a structure, for the article page and for Help search.
 */

/** Looks up a translation, returning '' when the key doesn't exist. */
export type ReadHelpString = (key: string) => string;

export interface HelpArticleSection {
  title: string;
  content: string;
  items: string[];
}

export interface HelpArticleContent {
  title: string;
  description: string;
  sections: HelpArticleSection[];
}

function readItems(read: ReadHelpString, sectionKey: string): string[] {
  const items: string[] = [];
  for (let itemIndex = 0; ; itemIndex++) {
    const item = read(`${sectionKey}.item${itemIndex}`);
    if (!item) {
      return items;
    }
    items.push(item);
  }
}

function readSections(read: ReadHelpString, contentKey: string, articleTitle: string): HelpArticleSection[] {
  const sections: HelpArticleSection[] = [];
  for (let sectionIndex = 0; ; sectionIndex++) {
    const sectionKey = `${contentKey}.section${sectionIndex}`;
    const sectionTitle = read(`${sectionKey}.title`);
    // The first section may leave out its title and borrow the article's.
    if (!sectionTitle && sectionIndex > 0) {
      return sections;
    }
    sections.push({
      title: sectionTitle || articleTitle,
      content: read(`${sectionKey}.content`),
      items: readItems(read, sectionKey),
    });
  }
}

/** The article's copy, or null when there's no article with this id. */
export function readHelpArticle(articleId: string, read: ReadHelpString): HelpArticleContent | null {
  const keyPrefix = `help.articles.${toArticleKeySegment(articleId)}`;
  const title = read(`${keyPrefix}.title`);
  if (!title) {
    return null;
  }
  return {
    title,
    description: read(`${keyPrefix}.description`),
    sections: readSections(read, `${keyPrefix}.content`, title),
  };
}

/** Everything a reader could search an article for, lower-cased. */
export function toHelpSearchText(article: HelpArticleContent): string {
  const sectionText = article.sections.flatMap(section => [section.title, section.content, ...section.items]);
  return [article.title, article.description, ...sectionText].join(' ').toLowerCase();
}

/** True when every word of the query appears somewhere in the article. */
export function matchesHelpQuery(searchText: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every(word => searchText.includes(word));
}
