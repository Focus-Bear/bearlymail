import { CONTEXT_EXPLANATION_VIP_CONTACT_STARRED } from 'constants/strings';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

const EXPLANATION_PARAM_SEPARATOR = ':';

/**
 * Turns a stored context explanation into display text. Most are plain text
 * (e.g. the reason onboarding gave for a VIP); some are `KEY:param` codes that
 * map to a translation, falling back to the raw text when no translation exists.
 */
export function translateContextExplanation(explanation: string, translate: Translate): string {
  if (!explanation.includes(EXPLANATION_PARAM_SEPARATOR)) {
    return explanation;
  }
  const [key, ...params] = explanation.split(EXPLANATION_PARAM_SEPARATOR);
  try {
    if (key === CONTEXT_EXPLANATION_VIP_CONTACT_STARRED && params[0]) {
      const count = parseInt(params[0], 10);
      return translate('settings.contextExplanations.vipContactStarredExplanation', {
        count,
        plural: count > 1 ? 's' : '',
      });
    }
    const normalizedKey = key
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');
    return translate(`settings.contextExplanations.${normalizedKey}`, {
      reason: params.join(EXPLANATION_PARAM_SEPARATOR).trim(),
      defaultValue: explanation,
    });
  } catch {
    return explanation;
  }
}
