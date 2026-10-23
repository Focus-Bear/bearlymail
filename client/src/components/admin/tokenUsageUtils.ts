import { NUMBER_FORMAT_MILLION, NUMBER_FORMAT_THOUSAND } from 'constants/numbers';

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

/** Display name for an operation: the server's label, else the raw operation id. */
export const getOperationLabel = (item: { operation: string; operationLabel?: string }): string =>
  item.operationLabel || item.operation;

const CENTS_PRECISION_THRESHOLD = 0.01;

/**
 * Formats an estimated USD cost. Sub-cent amounts keep four decimals so cheap
 * models (e.g. Nova Micro) don't all collapse to "$0.00"; null (no pricing
 * known for the model) renders as the provided fallback label.
 */
export const formatCostUsd = (cost: number | null, noDataLabel: string): string => {
  if (cost === null || cost === undefined) {
    return noDataLabel;
  }
  if (cost > 0 && cost < CENTS_PRECISION_THRESHOLD) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
};
