import { ROUTE_HELP } from 'constants/strings';

/**
 * Help article ids, as they appear in the URL (/help/<id>). Each id's copy lives
 * under help.articles.<camelCaseId> in the locale files.
 */
export const HELP_ARTICLE_IDS = {
  GETTING_STARTED: 'getting-started',
  TRIAGE: 'triage',
  ACTION: 'action',
  FOLLOW_UP: 'follow-up',
  PRIORITY: 'priority',
  DELIVERY: 'delivery',
  SEARCH: 'search',
  CONTEXT: 'context',
  SETTINGS: 'settings',
  AUTORESPONDER: 'autoresponder',
  KEYBOARD_SHORTCUTS: 'keyboard-shortcuts',
  TROUBLESHOOTING: 'troubleshooting',
  PRIVACY: 'privacy',
} as const;

export type HelpArticleId = (typeof HELP_ARTICLE_IDS)[keyof typeof HELP_ARTICLE_IDS];

export interface HelpArticleGroup {
  titleKey: string;
  articleIds: HelpArticleId[];
}

/** The Help index, in reading order: learn the app first, then reference, then getting unstuck. */
export const HELP_ARTICLE_GROUPS: HelpArticleGroup[] = [
  {
    titleKey: 'help.groups.basics',
    articleIds: [
      HELP_ARTICLE_IDS.GETTING_STARTED,
      HELP_ARTICLE_IDS.TRIAGE,
      HELP_ARTICLE_IDS.ACTION,
      HELP_ARTICLE_IDS.FOLLOW_UP,
      HELP_ARTICLE_IDS.PRIORITY,
      HELP_ARTICLE_IDS.DELIVERY,
    ],
  },
  {
    titleKey: 'help.groups.features',
    articleIds: [
      HELP_ARTICLE_IDS.SEARCH,
      HELP_ARTICLE_IDS.CONTEXT,
      HELP_ARTICLE_IDS.AUTORESPONDER,
      HELP_ARTICLE_IDS.SETTINGS,
      HELP_ARTICLE_IDS.KEYBOARD_SHORTCUTS,
    ],
  },
  {
    titleKey: 'help.groups.support',
    articleIds: [HELP_ARTICLE_IDS.TROUBLESHOOTING, HELP_ARTICLE_IDS.PRIVACY],
  },
];

/**
 * Retired article ids that may still be bookmarked or linked from old emails,
 * mapped to the article that replaced them.
 */
export const HELP_ARTICLE_REDIRECTS: Record<string, HelpArticleId> = {
  // The Process tab was renamed Action.
  process: HELP_ARTICLE_IDS.ACTION,
};

export function helpArticlePath(id: HelpArticleId): string {
  return `${ROUTE_HELP}/${id}`;
}

/**
 * Article ids come from the URL in kebab-case (e.g. `follow-up`), but the
 * localization keys are camelCase (`help.articles.followUp`). Convert so the
 * detail page reads the same keys the help list uses; without this a multi-word
 * article rendered its raw key instead of the text (issue #258). Single-word
 * ids pass through unchanged.
 */
export const toArticleKeySegment = (id: string): string =>
  id.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
