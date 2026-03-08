import { NUMBER_FORMAT_MILLION, NUMBER_FORMAT_THOUSAND } from 'constants/numbers';

const OPERATION_LABELS: Record<string, string> = {
  analyze_email_patterns: 'Analyze Email Patterns',
  summarize_email: 'Summarize Email',
  check_tone: 'Check Tone',
  extract_action_items: 'Extract Action Items',
  suggest_actions: 'Suggest Actions',
  generate_reply: 'Generate Reply',
  generate_reply_options: 'Generate Reply Options',
  generate_meeting_reply: 'Generate Meeting Reply',
  generate_follow_up: 'Generate Follow-up',
  analyze_override_reason: 'Analyze Override Reason',
  extract_qanda: 'Extract Q&A',
  search_relevance: 'Search Relevance',
  search_relevance_batch: 'Search Relevance (Batch)',
  analyze_priority: 'Analyze Priority',
  unknown: 'Unknown Operation',
};

export const formatNumber = (value: number): string => {
  if (value >= NUMBER_FORMAT_MILLION) {
    return `${(value / NUMBER_FORMAT_MILLION).toFixed(2)}M`;
  }
  if (value >= NUMBER_FORMAT_THOUSAND) {
    return `${(value / NUMBER_FORMAT_THOUSAND).toFixed(1)}K`;
  }
  return value.toLocaleString();
};

export const formatDuration = (ms: number | null, noDataLabel: string): string => {
  if (ms === null || ms === undefined) {
    return noDataLabel;
  }
  const MS_PER_SECOND = 1000;
  const MS_PER_MINUTE = 60000;
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < MS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  return `${minutes}m ${seconds}s`;
};

export const getOperationLabel = (operation: string): string => OPERATION_LABELS[operation] || operation;
