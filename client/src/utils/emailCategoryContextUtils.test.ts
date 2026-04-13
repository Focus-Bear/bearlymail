import {
  getEmailCategoryDescriptionFromContextValue,
  getEmailCategoryDisplayNameFromContextValue,
} from './emailCategoryContextUtils';

describe('getEmailCategoryDisplayNameFromContextValue', () => {
  it('returns the name before the separator', () => {
    expect(getEmailCategoryDisplayNameFromContextValue('GitHub issue reports - PR and issue notifications')).toBe(
      'GitHub issue reports',
    );
  });

  it('returns the whole value when no separator is present', () => {
    expect(getEmailCategoryDisplayNameFromContextValue('Newsletters')).toBe('Newsletters');
  });

  it('handles multiple separators by using only the first', () => {
    expect(getEmailCategoryDisplayNameFromContextValue('A - B - C')).toBe('A');
  });

  it('trims surrounding whitespace', () => {
    expect(getEmailCategoryDisplayNameFromContextValue('  My Category  ')).toBe('My Category');
  });

  it('returns empty string for empty input', () => {
    expect(getEmailCategoryDisplayNameFromContextValue('')).toBe('');
  });
});

describe('getEmailCategoryDescriptionFromContextValue', () => {
  it('returns the description after the separator', () => {
    expect(getEmailCategoryDescriptionFromContextValue('GitHub issue reports - PR and issue notifications')).toBe(
      'PR and issue notifications',
    );
  });

  it('returns null when no separator is present', () => {
    expect(getEmailCategoryDescriptionFromContextValue('Newsletters')).toBeNull();
  });

  it('returns the remainder after the first separator when multiple exist', () => {
    expect(getEmailCategoryDescriptionFromContextValue('A - B - C')).toBe('B - C');
  });

  it('returns null when description is empty after the separator', () => {
    expect(getEmailCategoryDescriptionFromContextValue('Name - ')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(getEmailCategoryDescriptionFromContextValue('')).toBeNull();
  });
});
