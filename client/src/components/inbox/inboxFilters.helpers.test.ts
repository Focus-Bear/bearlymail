import { getSelectionSummary } from './inboxFilters.helpers';

const OPTIONS = [
  { id: 'clients', label: 'Clients' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'team', label: 'Team' },
];

const ALL = 'All';
const countText = (count: number) => `${count} selected`;

describe('getSelectionSummary', () => {
  it('says "all" when nothing is selected', () => {
    expect(getSelectionSummary([], OPTIONS, ALL, countText)).toBe(ALL);
  });

  it('names a single selection', () => {
    expect(getSelectionSummary(['receipts'], OPTIONS, ALL, countText)).toBe('Receipts');
  });

  it('names two selections in the order they were picked', () => {
    expect(getSelectionSummary(['receipts', 'clients'], OPTIONS, ALL, countText)).toBe('Receipts, Clients');
  });

  it('counts a selection too long to name', () => {
    expect(getSelectionSummary(['clients', 'receipts', 'team'], OPTIONS, ALL, countText)).toBe('3 selected');
  });

  it('counts when a selected id is no longer among the options', () => {
    expect(getSelectionSummary(['gone'], OPTIONS, ALL, countText)).toBe('1 selected');
    expect(getSelectionSummary(['clients', 'gone'], OPTIONS, ALL, countText)).toBe('2 selected');
  });
});
