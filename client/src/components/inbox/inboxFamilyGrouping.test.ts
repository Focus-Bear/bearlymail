import { CategorySummaryItem } from 'store/slices/emailSlice';

import { orderCategoriesByFamily } from './inboxFamilyGrouping';

const cat = (id: string | null, name: string): CategorySummaryItem => ({ id, name, count: 1 });

describe('orderCategoriesByFamily', () => {
  it('returns the flat list unchanged when no family mapping is known', () => {
    const categories = [cat('a', 'Alpha'), cat('b', 'Beta')];
    const result = orderCategoriesByFamily(categories, new Map(), []);
    expect(result.isGrouped).toBe(false);
    expect(result.ordered).toBe(categories);
    expect(result.firstInFamily.size).toBe(0);
  });

  it('groups same-family categories adjacently and orders families by familyOrder', () => {
    // Input order deliberately interleaves families.
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
    // GitHub should come before Newsletters per familyOrder.
    const result = orderCategoriesByFamily(categories, familyByCategoryId, ['GitHub', 'Newsletters']);

    expect(result.isGrouped).toBe(true);
    expect(result.ordered.map((category) => category.id)).toEqual(['g1', 'g2', 'n1', 'n2']);
    // first category of each family block is flagged
    expect(result.firstInFamily.has('g1')).toBe(true);
    expect(result.firstInFamily.has('n1')).toBe(true);
    expect(result.firstInFamily.has('g2')).toBe(false);
    expect(result.familyByKey.get('g1')).toBe('GitHub');
  });

  it('preserves original order within a family', () => {
    const categories = [cat('g2', 'GitHub B'), cat('g1', 'GitHub A')];
    const familyByCategoryId = new Map([
      ['g1', 'GitHub'],
      ['g2', 'GitHub'],
    ]);
    const result = orderCategoriesByFamily(categories, familyByCategoryId, ['GitHub']);
    expect(result.ordered.map((category) => category.id)).toEqual(['g2', 'g1']);
  });

  it('places the Other family last and treats unmapped categories as Other', () => {
    const categories = [cat(null, 'Other'), cat('g1', 'GitHub A'), cat('x1', 'Unmapped')];
    const familyByCategoryId = new Map([
      ['g1', 'GitHub'],
      // the null-id "Other" category and 'x1' are not mapped → Other family
    ]);
    const result = orderCategoriesByFamily(categories, familyByCategoryId, ['GitHub']);
    const lastFamily = result.familyByKey.get(
      result.ordered[result.ordered.length - 1].id ?? 'uncategorized',
    );
    expect(lastFamily).toBe('Other / Uncategorised');
    // GitHub block comes before the Other block
    expect(result.ordered[0].id).toBe('g1');
  });
});
