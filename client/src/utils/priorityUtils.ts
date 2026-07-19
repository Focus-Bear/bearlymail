import { theme } from 'theme/theme';

import { PRIORITY_HIGH_THRESHOLD, PRIORITY_MEDIUM_THRESHOLD, PRIORITY_VERY_HIGH_THRESHOLD } from 'constants/numbers';

export const getPriorityBadge = (score: number, tFunc?: (key: string) => string) => {
  const veryHighLabel = tFunc ? tFunc('priority.veryHigh') : 'Very High';
  const highLabel = tFunc ? tFunc('priority.high') : 'High';
  const mediumLabel = tFunc ? tFunc('priority.medium') : 'Medium';
  const lowLabel = tFunc ? tFunc('priority.low') : 'Low';
  const veryLowLabel = tFunc ? tFunc('priority.veryLow') : 'Very Low';

  // Priority tier calibration — aligned with PRIORITY_RANGES in useInboxFilters.ts:
  // < 0:       very low  (score < 0)
  // 0–15:      low       (score >= 0 && <= 15)
  // 15–30:     medium    (score > 15 && <= 30)
  // 30–50:     high      (score > 30 && <= 50)
  // > 50:      very high (score > 50)

  // Use high contrast colors: dark text on light backgrounds, or white text on dark backgrounds
  if (score > PRIORITY_VERY_HIGH_THRESHOLD) {
    return { color: theme.colors.accent.error, label: veryHighLabel, bg: theme.colors.sunray.light4 };
  }
  if (score > PRIORITY_HIGH_THRESHOLD) {
    return { color: theme.colors.accent.error, label: highLabel, bg: theme.colors.sunray.light4 };
  }
  if (score > PRIORITY_MEDIUM_THRESHOLD) {
    return { color: theme.colors.text.primary, label: mediumLabel, bg: theme.colors.sunray.light3 };
  } // Dark text on light orange background for better contrast
  if (score >= 0) {
    return { color: theme.colors.primary.main, label: lowLabel, bg: theme.colors.sunray.light4 };
  }
  // Negative scores are "very low" priority
  return { color: theme.colors.text.secondary, label: veryLowLabel, bg: theme.colors.background.subtle };
};
