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
  ONBOARDING_SETUP: 'onboarding-setup',
  CONNECT_GMAIL: 'connect-gmail',
  CONNECT_OUTLOOK: 'connect-outlook',
  CONNECT_ZOHO: 'connect-zoho',
  CONNECT_IMAP: 'connect-imap',
  IMAP_CONNECTION_PROBLEMS: 'imap-connection-problems',
  MULTIPLE_ACCOUNTS: 'multiple-accounts',
  IMPORT_OLDER_EMAILS: 'import-older-emails',
  EMAIL_SIGNATURE: 'email-signature',
  SNOOZE: 'snooze',
  BLOCK_SENDER: 'block-sender',
  BLOCK_KEYWORDS: 'block-keywords',
  UNSUBSCRIBE: 'unsubscribe',
  AUTO_ARCHIVE: 'auto-archive',
  BULK_ACTIONS: 'bulk-actions',
  COMPOSE_AND_REPLY: 'compose-and-reply',
  SCHEDULE_SEND: 'schedule-send',
  PRIVATE_NOTES: 'private-notes',
  CALENDAR_INVITES: 'calendar-invites',
  OPEN_TRACKING: 'open-tracking',
  SAVE_EMAIL: 'save-email',
  SEARCH: 'search',
  KEYBOARD_SHORTCUTS: 'keyboard-shortcuts',
  CONTEXT: 'context',
  CATEGORIES: 'categories',
  AI_SUMMARIES: 'ai-summaries',
  ACTION_ITEMS: 'action-items',
  ASK_AI: 'ask-ai',
  TONE_CHECK: 'tone-check',
  EMAIL_DETAIL_PANEL: 'email-detail-panel',
  AUTORESPONDER: 'autoresponder',
  SETTINGS: 'settings',
  WORKFLOWS: 'workflows',
  CONNECTED_APPS: 'connected-apps',
  CONNECT_CLAUDE: 'connect-claude',
  OWN_AI_ACCOUNT: 'own-ai-account',
  GITHUB: 'github',
  FOCUS_BEAR: 'focus-bear',
  SCHEDULING_BOOKING_LINK: 'scheduling-booking-link',
  CRM: 'crm',
  STATS: 'stats',
  PASSWORD_AND_2FA: 'password-and-2fa',
  PLANS_AND_BILLING: 'plans-and-billing',
  TEAM_ACCOUNTS: 'team-accounts',
  EXPORT_IMPORT_DATA: 'export-import-data',
  DELETE_ACCOUNT: 'delete-account',
  PRIVACY: 'privacy',
  TROUBLESHOOTING: 'troubleshooting',
  EMAILS_NOT_ARRIVING: 'emails-not-arriving',
  RECONNECT_ACCOUNT: 'reconnect-account',
  PRIORITY_NOT_CALCULATED: 'priority-not-calculated',
  WRONG_PRIORITY_OR_CATEGORY: 'wrong-priority-or-category',
  CANT_FIND_EMAIL: 'cant-find-email',
  ARCHIVE_NOT_SYNCING: 'archive-not-syncing',
  USAGE_LIMITS: 'usage-limits',
  DISTRACTION_PROMPT: 'distraction-prompt',
  SERVICE_UNAVAILABLE: 'service-unavailable',
  CONTACT_SUPPORT: 'contact-support',
} as const;

export type HelpArticleId = (typeof HELP_ARTICLE_IDS)[keyof typeof HELP_ARTICLE_IDS];

export interface HelpArticleGroup {
  titleKey: string;
  articleIds: HelpArticleId[];
}

/** The Help index, in reading order: learn the app, set it up, use it day to day, then get unstuck. */
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
    titleKey: 'help.groups.setup',
    articleIds: [
      HELP_ARTICLE_IDS.ONBOARDING_SETUP,
      HELP_ARTICLE_IDS.CONNECT_GMAIL,
      HELP_ARTICLE_IDS.CONNECT_OUTLOOK,
      HELP_ARTICLE_IDS.CONNECT_ZOHO,
      HELP_ARTICLE_IDS.CONNECT_IMAP,
      HELP_ARTICLE_IDS.IMAP_CONNECTION_PROBLEMS,
      HELP_ARTICLE_IDS.MULTIPLE_ACCOUNTS,
      HELP_ARTICLE_IDS.IMPORT_OLDER_EMAILS,
      HELP_ARTICLE_IDS.EMAIL_SIGNATURE,
    ],
  },
  {
    titleKey: 'help.groups.everyday',
    articleIds: [
      HELP_ARTICLE_IDS.SNOOZE,
      HELP_ARTICLE_IDS.BLOCK_SENDER,
      HELP_ARTICLE_IDS.BLOCK_KEYWORDS,
      HELP_ARTICLE_IDS.UNSUBSCRIBE,
      HELP_ARTICLE_IDS.AUTO_ARCHIVE,
      HELP_ARTICLE_IDS.BULK_ACTIONS,
      HELP_ARTICLE_IDS.COMPOSE_AND_REPLY,
      HELP_ARTICLE_IDS.SCHEDULE_SEND,
      HELP_ARTICLE_IDS.PRIVATE_NOTES,
      HELP_ARTICLE_IDS.CALENDAR_INVITES,
      HELP_ARTICLE_IDS.OPEN_TRACKING,
      HELP_ARTICLE_IDS.SAVE_EMAIL,
      HELP_ARTICLE_IDS.SEARCH,
      HELP_ARTICLE_IDS.KEYBOARD_SHORTCUTS,
    ],
  },
  {
    titleKey: 'help.groups.ai',
    articleIds: [
      HELP_ARTICLE_IDS.CONTEXT,
      HELP_ARTICLE_IDS.CATEGORIES,
      HELP_ARTICLE_IDS.AI_SUMMARIES,
      HELP_ARTICLE_IDS.ACTION_ITEMS,
      HELP_ARTICLE_IDS.ASK_AI,
      HELP_ARTICLE_IDS.TONE_CHECK,
      HELP_ARTICLE_IDS.EMAIL_DETAIL_PANEL,
      HELP_ARTICLE_IDS.AUTORESPONDER,
    ],
  },
  {
    titleKey: 'help.groups.integrations',
    articleIds: [
      HELP_ARTICLE_IDS.SETTINGS,
      HELP_ARTICLE_IDS.WORKFLOWS,
      HELP_ARTICLE_IDS.CONNECTED_APPS,
      HELP_ARTICLE_IDS.CONNECT_CLAUDE,
      HELP_ARTICLE_IDS.OWN_AI_ACCOUNT,
      HELP_ARTICLE_IDS.GITHUB,
      HELP_ARTICLE_IDS.FOCUS_BEAR,
      HELP_ARTICLE_IDS.SCHEDULING_BOOKING_LINK,
      HELP_ARTICLE_IDS.CRM,
      HELP_ARTICLE_IDS.STATS,
    ],
  },
  {
    titleKey: 'help.groups.account',
    articleIds: [
      HELP_ARTICLE_IDS.PASSWORD_AND_2FA,
      HELP_ARTICLE_IDS.PLANS_AND_BILLING,
      HELP_ARTICLE_IDS.TEAM_ACCOUNTS,
      HELP_ARTICLE_IDS.EXPORT_IMPORT_DATA,
      HELP_ARTICLE_IDS.DELETE_ACCOUNT,
      HELP_ARTICLE_IDS.PRIVACY,
    ],
  },
  {
    titleKey: 'help.groups.troubleshooting',
    articleIds: [
      HELP_ARTICLE_IDS.TROUBLESHOOTING,
      HELP_ARTICLE_IDS.EMAILS_NOT_ARRIVING,
      HELP_ARTICLE_IDS.RECONNECT_ACCOUNT,
      HELP_ARTICLE_IDS.PRIORITY_NOT_CALCULATED,
      HELP_ARTICLE_IDS.WRONG_PRIORITY_OR_CATEGORY,
      HELP_ARTICLE_IDS.CANT_FIND_EMAIL,
      HELP_ARTICLE_IDS.ARCHIVE_NOT_SYNCING,
      HELP_ARTICLE_IDS.USAGE_LIMITS,
      HELP_ARTICLE_IDS.DISTRACTION_PROMPT,
      HELP_ARTICLE_IDS.SERVICE_UNAVAILABLE,
      HELP_ARTICLE_IDS.CONTACT_SUPPORT,
    ],
  },
];

export const ALL_HELP_ARTICLE_IDS: HelpArticleId[] = HELP_ARTICLE_GROUPS.flatMap(group => group.articleIds);

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
