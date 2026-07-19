/**
 * Unit tests for DataExportSection helpers
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import { formatImportDetails, ImportResult, parseImportFile } from './dataExport.helpers';

const tFunc = (key: string): string => key;

function makeResult(overrides: Partial<ImportResult['imported']> = {}): ImportResult {
  return {
    success: true,
    imported: {
      profile: false,
      batchSchedule: false,
      blockedSenders: 0,
      blockedKeywords: 0,
      contexts: 0,
      toneRules: 0,
      summarizationRules: 0,
      autoResponderSettings: false,
      ...overrides,
    },
    skipped: { blockedSenders: 0, blockedKeywords: 0, contexts: 0 },
    errors: [],
  };
}

describe('parseImportFile', () => {
  it('returns parsed object when JSON has required fields', () => {
    const input = JSON.stringify({ version: '1.0', exportedAt: '2024-01-01', data: {} });
    const result = parseImportFile(input, tFunc);
    expect(result).toEqual({ version: '1.0', exportedAt: '2024-01-01', data: {} });
  });

  it('throws with i18n key when JSON is invalid', () => {
    expect(() => parseImportFile('not-json', tFunc)).toThrow('settings.dataExport.invalidFile');
  });

  it('throws when "version" field is missing', () => {
    const input = JSON.stringify({ exportedAt: '2024-01-01' });
    expect(() => parseImportFile(input, tFunc)).toThrow('settings.dataExport.invalidFile');
  });

  it('throws when "exportedAt" field is missing', () => {
    const input = JSON.stringify({ version: '1.0' });
    expect(() => parseImportFile(input, tFunc)).toThrow('settings.dataExport.invalidFile');
  });

  it('throws for null JSON value', () => {
    expect(() => parseImportFile('null', tFunc)).toThrow('settings.dataExport.invalidFile');
  });
});

describe('formatImportDetails', () => {
  it('returns "no new data" when nothing was imported', () => {
    expect(formatImportDetails(makeResult())).toBe('no new data');
  });

  it('includes "profile" when profile was imported', () => {
    expect(formatImportDetails(makeResult({ profile: true }))).toBe('profile');
  });

  it('includes blocked senders count', () => {
    const result = formatImportDetails(makeResult({ blockedSenders: 2 }));
    expect(result).toBe('2 blocked sender(s)');
  });

  it('includes multiple imported items as comma-joined string', () => {
    const result = formatImportDetails(makeResult({ profile: true, blockedSenders: 3, contexts: 1 }));
    expect(result).toBe('profile, 3 blocked sender(s), 1 context(s)');
  });

  it('includes auto-responder settings', () => {
    const result = formatImportDetails(makeResult({ autoResponderSettings: true }));
    expect(result).toBe('auto-responder settings');
  });

  it('omits fields with 0 count', () => {
    const result = formatImportDetails(makeResult({ blockedSenders: 0, contexts: 0 }));
    expect(result).toBe('no new data');
  });
});
