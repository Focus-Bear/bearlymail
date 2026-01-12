import { theme } from 'theme/theme';

export const getPriorityBadge = (score: number, t?: (key: string) => string) => {
  const highLabel = t ? t('priority.high') : 'High';
  const mediumLabel = t ? t('priority.medium') : 'Medium';
  const lowLabel = t ? t('priority.low') : 'Low';
  const veryLowLabel = t ? t('priority.veryLow') : 'Very Low';
  
  // New calibration:
  // < 0: very low priority
  // 0-20: low priority
  // 20-40: medium priority
  // > 40: high priority
  
  // Use high contrast colors: dark text on light backgrounds, or white text on dark backgrounds
  if (score > 40) return { color: theme.colors.accent.error, label: highLabel, bg: theme.colors.sunray.light4 };
  if (score >= 20) return { color: theme.colors.text.primary, label: mediumLabel, bg: theme.colors.sunray.light3 }; // Dark text on light orange background for better contrast
  if (score >= 0) return { color: theme.colors.primary.main, label: lowLabel, bg: theme.colors.sunray.light4 };
  // Negative scores are "very low" priority
  return { color: theme.colors.text.secondary, label: veryLowLabel, bg: theme.colors.background.subtle };
};

