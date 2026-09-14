import { toArticleKeySegment } from './HelpArticle';

describe('toArticleKeySegment', () => {
  it('converts a kebab-case article id to the camelCase locale key segment', () => {
    // The bug: /help/follow-up looked up help.articles.follow-up.* which does
    // not exist; the keys are help.articles.followUp.* (issue #258).
    expect(toArticleKeySegment('follow-up')).toBe('followUp');
  });

  it('leaves single-word ids unchanged', () => {
    expect(toArticleKeySegment('context')).toBe('context');
    expect(toArticleKeySegment('autoresponder')).toBe('autoresponder');
  });

  it('handles multiple hyphens', () => {
    expect(toArticleKeySegment('one-two-three')).toBe('oneTwoThree');
  });
});
