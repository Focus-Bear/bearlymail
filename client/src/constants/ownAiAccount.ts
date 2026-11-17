import { ANALYTICS_EVENTS } from 'constants/analytics-events';

/** Must match the server's USER_AI_PROVIDERS (server/src/constants/user-ai-providers.constants.ts). */
export const AI_PROVIDER_IDS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  TYPESAFE: 'typesafe',
} as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[keyof typeof AI_PROVIDER_IDS];

type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export interface AiProviderDescriptor {
  id: AiProviderId;
  /** i18n keys under settings.ownAiAccount.providers.<id>. */
  nameKey: string;
  descriptionKey: string;
  keyPlaceholder: string;
  /** Where the user creates a key. */
  keyConsoleUrl: string;
  savedEvent: AnalyticsEventName;
  removedEvent: AnalyticsEventName;
}

const providerCopyKey = (id: AiProviderId, field: 'name' | 'description') =>
  `settings.ownAiAccount.providers.${id}.${field}`;

/** One entry per provider the user can connect; adding a provider is one entry here (plus its server routing). */
export const AI_PROVIDERS: readonly AiProviderDescriptor[] = [
  {
    id: AI_PROVIDER_IDS.OPENAI,
    nameKey: providerCopyKey(AI_PROVIDER_IDS.OPENAI, 'name'),
    descriptionKey: providerCopyKey(AI_PROVIDER_IDS.OPENAI, 'description'),
    keyPlaceholder: 'sk-...',
    keyConsoleUrl: 'https://platform.openai.com/api-keys',
    savedEvent: ANALYTICS_EVENTS.OPENAI_API_KEY_SAVED,
    removedEvent: ANALYTICS_EVENTS.OPENAI_API_KEY_REMOVED,
  },
  {
    id: AI_PROVIDER_IDS.ANTHROPIC,
    nameKey: providerCopyKey(AI_PROVIDER_IDS.ANTHROPIC, 'name'),
    descriptionKey: providerCopyKey(AI_PROVIDER_IDS.ANTHROPIC, 'description'),
    keyPlaceholder: 'sk-ant-...',
    keyConsoleUrl: 'https://console.anthropic.com/settings/keys',
    savedEvent: ANALYTICS_EVENTS.ANTHROPIC_API_KEY_SAVED,
    removedEvent: ANALYTICS_EVENTS.ANTHROPIC_API_KEY_REMOVED,
  },
  {
    id: AI_PROVIDER_IDS.TYPESAFE,
    nameKey: providerCopyKey(AI_PROVIDER_IDS.TYPESAFE, 'name'),
    descriptionKey: providerCopyKey(AI_PROVIDER_IDS.TYPESAFE, 'description'),
    keyPlaceholder: '',
    keyConsoleUrl: 'https://docs.typesafe.ai',
    savedEvent: ANALYTICS_EVENTS.TYPESAFE_API_KEY_SAVED,
    removedEvent: ANALYTICS_EVENTS.TYPESAFE_API_KEY_REMOVED,
  },
];

/** The self-hosting guide in the public source repo. */
export const SELF_HOSTING_DOCS_URL = 'https://github.com/Focus-Bear/bearlymail-oss/blob/main/SELF-HOSTING.md';

export const AI_KEYS_ENDPOINT = '/llm/me/ai-keys';
