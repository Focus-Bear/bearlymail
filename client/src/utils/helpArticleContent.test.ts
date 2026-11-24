import { matchesHelpQuery, readHelpArticle, toHelpSearchText } from 'utils/helpArticleContent';

const COPY: Record<string, string> = {
  'help.articles.followUp.title': 'Follow Up tab',
  'help.articles.followUp.description': 'Chase replies.',
  'help.articles.followUp.content.section0.content': 'Threads you are waiting on.',
  'help.articles.followUp.content.section1.title': 'Chasing people up',
  'help.articles.followUp.content.section1.item0': 'Generate Follow-ups drafts a reply',
  'help.articles.followUp.content.section1.item1': 'Send them all together',
};

const read = (key: string) => COPY[key] ?? '';

describe('readHelpArticle', () => {
  it('reads the title, description and numbered sections and items of a kebab-case id', () => {
    expect(readHelpArticle('follow-up', read)).toEqual({
      title: 'Follow Up tab',
      description: 'Chase replies.',
      sections: [
        { title: 'Follow Up tab', content: 'Threads you are waiting on.', items: [] },
        {
          title: 'Chasing people up',
          content: '',
          items: ['Generate Follow-ups drafts a reply', 'Send them all together'],
        },
      ],
    });
  });

  it('returns null for an id with no article', () => {
    expect(readHelpArticle('no-such-article', read)).toBeNull();
  });
});

describe('help search', () => {
  const article = readHelpArticle('follow-up', read);
  const searchText = article ? toHelpSearchText(article) : '';

  it('matches words from anywhere in the article, in any order and case', () => {
    expect(matchesHelpQuery(searchText, 'GENERATE chase')).toBe(true);
  });

  it('needs every word to match', () => {
    expect(matchesHelpQuery(searchText, 'generate invoice')).toBe(false);
  });
});
