import { MODE_ACTION, MODE_FOLLOW_UP, MODE_TRIAGE } from 'constants/strings';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { familyGroupingAppliesTo, orderCategoriesByFamily } from './inboxFamilyGrouping';

const cat = (id: string | null, name: string): CategorySummaryItem => ({ id, name, count: 1 });

describe('orderCategoriesByFamily', () => {
  it('returns the flat list unchanged when no family mapping is known', () => {
    const categories = [cat('a', 'Alpha'), cat('b', 'Beta')];
    const result = orderCategoriesByFamily(categories, new Map());
    expect(result.isGrouped).toBe(false);
    expect(result.ordered).toBe(categories);
    expect(result.firstInFamily.size).toBe(0);
  });

  it('groups same-family categories adjacently and orders families by their highest-priority category', () => {
    // Input arrives priority-sorted (highest first) and interleaves families.
    // Newsletter A is the single highest-priority category, so the Newsletters
    // family outranks GitHub.
    const categories = [
      cat('n1', 'Newsletter A'),
      cat('g1', 'GitHub A'),
      cat('n2', 'Newsletter B'),
      cat('g2', 'GitHub B'),
    ];
    const familyByCategoryId = new Map([
      ['n1', 'Newsletters'],
      ['n2', 'Newsletters'],
      ['g1', 'GitHub'],
      ['g2', 'GitHub'],
    ]);
    const result = orderCategoriesByFamily(categories, familyByCategoryId);

    expect(result.isGrouped).toBe(true);
    expect(result.ordered.map((category) => category.id)).toEqual(['n1', 'n2', 'g1', 'g2']);
    // first category of each family block is flagged
    expect(result.firstInFamily.has('n1')).toBe(true);
    expect(result.firstInFamily.has('g1')).toBe(true);
    expect(result.firstInFamily.has('n2')).toBe(false);
    expect(result.familyByKey.get('g1')).toBe('GitHub');
  });

  it('ranks a family by its single highest-priority category, not its category count', () => {
    // Newsletters has fewer categories (1), but its category is highest priority
    // (index 0), while GitHub has more categories at lower priorities. Priority
    // must win, so the Newsletters family block comes first.
    const categories = [
      cat('n1', 'Newsletter A'),
      cat('g1', 'GitHub A'),
      cat('g2', 'GitHub B'),
    ];
    const familyByCategoryId = new Map([
      ['g1', 'GitHub'],
      ['g2', 'GitHub'],
      ['n1', 'Newsletters'],
    ]);
    const result = orderCategoriesByFamily(categories, familyByCategoryId);

    // Newsletter A is the top category, so Newsletters family leads.
    expect(result.ordered.map((category) => category.id)).toEqual(['n1', 'g1', 'g2']);
  });

  it('preserves original order within a family', () => {
    const categories = [cat('g2', 'GitHub B'), cat('g1', 'GitHub A')];
    const familyByCategoryId = new Map([
      ['g1', 'GitHub'],
      ['g2', 'GitHub'],
    ]);
    const result = orderCategoriesByFamily(categories, familyByCategoryId);
    expect(result.ordered.map((category) => category.id)).toEqual(['g2', 'g1']);
  });

  it('places the Other family last and treats unmapped categories as Other', () => {
    const categories = [cat(null, 'Other'), cat('g1', 'GitHub A'), cat('x1', 'Unmapped')];
    const familyByCategoryId = new Map([
      ['g1', 'GitHub'],
      // the null-id "Other" category and 'x1' are not mapped → Other family
    ]);
    const result = orderCategoriesByFamily(categories, familyByCategoryId);
    const lastFamily = result.familyByKey.get(
      result.ordered[result.ordered.length - 1].id ?? 'uncategorized',
    );
    expect(lastFamily).toBe('Other / Uncategorised');
    // GitHub block comes before the Other block
    expect(result.ordered[0].id).toBe('g1');
  });
});

describe('familyGroupingAppliesTo', () => {
  it('disables nested family grouping in Triage (now a flat, category-sorted list)', () => {
    expect(familyGroupingAppliesTo(MODE_TRIAGE)).toBe(false);
  });

  it('disables family grouping in the strict-score working tabs', () => {
    expect(familyGroupingAppliesTo(MODE_ACTION)).toBe(false);
    expect(familyGroupingAppliesTo(MODE_FOLLOW_UP)).toBe(false);
  });
});
