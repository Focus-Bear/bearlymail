import { getMultiSelectDisplayText } from './inboxFilters.helpers';

const OPTIONS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'action', label: 'Action Required' },
  { id: 'follow-up', label: 'Follow Up' },
];

const PLACEHOLDER = 'Select...';

describe('getMultiSelectDisplayText', () => {
  it('returns the placeholder when nothing is selected', () => {
    expect(getMultiSelectDisplayText([], OPTIONS, PLACEHOLDER)).toBe(PLACEHOLDER);
  });

  it('returns the matching label when exactly one id is selected', () => {
    expect(getMultiSelectDisplayText(['action'], OPTIONS, PLACEHOLDER)).toBe('Action Required');
  });

  it('returns the placeholder when the single selected id is not found in options', () => {
    expect(getMultiSelectDisplayText(['unknown-id'], OPTIONS, PLACEHOLDER)).toBe(PLACEHOLDER);
  });

  it('returns "2 selected" when two ids are selected', () => {
    expect(getMultiSelectDisplayText(['inbox', 'action'], OPTIONS, PLACEHOLDER)).toBe('2 selected');
  });

  it('returns "3 selected" when all options are selected', () => {
    expect(getMultiSelectDisplayText(['inbox', 'action', 'follow-up'], OPTIONS, PLACEHOLDER)).toBe('3 selected');
  });

  it('uses the count of selectedIds, not the number matched in options', () => {
    // selectedIds has 3 entries but two are unknown — still "3 selected"
    expect(getMultiSelectDisplayText(['inbox', 'ghost-id-1', 'ghost-id-2'], OPTIONS, PLACEHOLDER)).toBe('3 selected');
  });

  it('works with an empty options array', () => {
    expect(getMultiSelectDisplayText(['inbox'], [], PLACEHOLDER)).toBe(PLACEHOLDER);
  });

  it('works with an empty options array and no selection', () => {
    expect(getMultiSelectDisplayText([], [], PLACEHOLDER)).toBe(PLACEHOLDER);
  });

  it('returns the label for the first matching id when options has duplicates', () => {
    const dupeOptions = [
      { id: 'a', label: 'First' },
      { id: 'a', label: 'Second' },
    ];
    expect(getMultiSelectDisplayText(['a'], dupeOptions, PLACEHOLDER)).toBe('First');
  });
});
