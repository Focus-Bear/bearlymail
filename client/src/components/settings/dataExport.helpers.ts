/**
 * Pure helper functions extracted from DataExportSection.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

export interface ImportResult {
  success: boolean;
  imported: {
    profile: boolean;
    batchSchedule: boolean;
    blockedSenders: number;
    blockedKeywords: number;
    contexts: number;
    toneRules: number;
    summarizationRules: number;
    autoResponderSettings: boolean;
  };
  skipped: { blockedSenders: number; blockedKeywords: number; contexts: number };
  errors: string[];
}

export function parseImportFile(text: string, tFunc: (tKey: string) => string): unknown {
  let importData: unknown;
  try {
    importData = JSON.parse(text);
  } catch {
    throw new Error(tFunc('settings.dataExport.invalidFile'));
  }
  if (
    !importData ||
    typeof importData !== 'object' ||
    !('version' in (importData as Record<string, unknown>)) ||
    !('exportedAt' in (importData as Record<string, unknown>))
  ) {
    throw new Error(tFunc('settings.dataExport.invalidFile'));
  }
  return importData;
}

export function formatImportDetails(result: ImportResult): string {
  const details: string[] = [];
  if (result.imported.profile) {
    details.push('profile');
  }
  if (result.imported.batchSchedule) {
    details.push('batch schedule');
  }
  if (result.imported.blockedSenders > 0) {
    details.push(`${result.imported.blockedSenders} blocked sender(s)`);
  }
  if (result.imported.blockedKeywords > 0) {
    details.push(`${result.imported.blockedKeywords} blocked keyword(s)`);
  }
  if (result.imported.contexts > 0) {
    details.push(`${result.imported.contexts} context(s)`);
  }
  if (result.imported.toneRules > 0) {
    details.push(`${result.imported.toneRules} tone rule(s)`);
  }
  if (result.imported.summarizationRules > 0) {
    details.push(`${result.imported.summarizationRules} summarization rule(s)`);
  }
  if (result.imported.autoResponderSettings) {
    details.push('auto-responder settings');
  }
  return details.length > 0 ? details.join(', ') : 'no new data';
}
