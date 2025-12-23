import { theme } from '../theme/theme';

export const getPriorityBadge = (score: number, t?: (key: string) => string) => {
  const highLabel = t ? t('priority.high') : 'High';
  const mediumLabel = t ? t('priority.medium') : 'Medium';
  const lowLabel = t ? t('priority.low') : 'Low';
  
  // Use high contrast colors: dark text on light backgrounds, or white text on dark backgrounds
  if (score >= 80) return { color: theme.colors.accent.error, label: highLabel, bg: theme.colors.sunray.light4 };
  if (score >= 60) return { color: theme.colors.text.primary, label: mediumLabel, bg: theme.colors.sunray.light3 }; // Dark text on light orange background for better contrast
  return { color: theme.colors.primary.main, label: lowLabel, bg: theme.colors.sunray.light4 };
};

