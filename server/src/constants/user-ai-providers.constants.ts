/**
 * AI providers a user can connect with their own key ("Use your own AI
 * account" in Settings). The ids are part of the API contract (URL segment of
 * /llm/me/ai-keys/:provider and keys of `users.aiKeyRejections`) — never
 * rename them.
 */
export const USER_AI_PROVIDERS = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  /** TypeSafe AI, whose Jev model answers typed decisions and categorisation. */
  TYPESAFE: "typesafe",
} as const;

export type UserAiProvider =
  (typeof USER_AI_PROVIDERS)[keyof typeof USER_AI_PROVIDERS];

/** The `users` column holding each provider's key (encrypted at rest). */
export type UserAiKeyColumn =
  | "openAiApiKey"
  | "anthropicApiKey"
  | "typesafeApiKey";

export interface UserAiProviderDescriptor {
  id: UserAiProvider;
  /** Shown in error messages. */
  displayName: string;
  column: UserAiKeyColumn;
  /** Required key prefix, when the provider has a recognisable one. */
  keyPrefix?: string;
  /**
   * Whether the provider generates text. When a user has a key for at least
   * one generative provider, every AI call runs on their account.
   */
  isGenerative: boolean;
}

/**
 * One entry per provider; adding a provider is one entry here plus its
 * column and routing. Order is the preference order when a call has to move
 * off a BearlyMail-account provider (Gemini, Bedrock) onto the user's own.
 */
export const USER_AI_PROVIDER_DESCRIPTORS: readonly UserAiProviderDescriptor[] =
  [
    {
      id: USER_AI_PROVIDERS.OPENAI,
      displayName: "OpenAI",
      column: "openAiApiKey",
      keyPrefix: "sk-",
      isGenerative: true,
    },
    {
      id: USER_AI_PROVIDERS.ANTHROPIC,
      displayName: "Anthropic",
      column: "anthropicApiKey",
      keyPrefix: "sk-ant-",
      isGenerative: true,
    },
    {
      id: USER_AI_PROVIDERS.TYPESAFE,
      displayName: "TypeSafe AI (Jev)",
      column: "typesafeApiKey",
      isGenerative: false,
    },
  ];

export const USER_AI_KEY_LIMITS = {
  MIN_LENGTH: 20,
  MAX_LENGTH: 500,
  /** Characters of the key's end shown in the masked value. */
  MASK_VISIBLE_SUFFIX: 4,
  MASK_FILLER: "••••",
} as const;

/** Error `code` the client matches to explain a rejected key. */
export const USER_AI_KEY_REJECTED_CODE = "USER_AI_KEY_REJECTED";

export function findUserAiProvider(
  id: string,
): UserAiProviderDescriptor | undefined {
  return USER_AI_PROVIDER_DESCRIPTORS.find((provider) => provider.id === id);
}
