import { HttpException, HttpStatus } from "@nestjs/common";

import {
  findUserAiProvider,
  USER_AI_KEY_REJECTED_CODE,
  USER_AI_PROVIDER_DESCRIPTORS,
  USER_AI_PROVIDERS,
  type UserAiProvider,
} from "../constants/user-ai-providers.constants";
import { LLMProvider } from "./llm.types";
import { HTTP_FORBIDDEN, HTTP_UNAUTHORIZED } from "./llm-retry-policy";

/** The decrypted keys a user has saved, by provider. */
export type UserAiKeys = Partial<Record<UserAiProvider, string>>;

/** Generative providers a user can bring, as the LLM provider they drive. */
const GENERATIVE_LLM_PROVIDER: Partial<Record<UserAiProvider, LLMProvider>> = {
  [USER_AI_PROVIDERS.OPENAI]: LLMProvider.OPENAI,
  [USER_AI_PROVIDERS.ANTHROPIC]: LLMProvider.ANTHROPIC,
};

/**
 * Whether the user's AI runs on their own account: they saved a key for at
 * least one provider that generates text. From then on every AI call —
 * generation, Jev decisions, embeddings — uses their keys or is skipped; none
 * goes to BearlyMail's provider accounts. A TypeSafe (Jev) key on its own only
 * moves Jev's decisions, because Jev cannot write summaries or drafts.
 */
export function usesOwnAiAccount(keys: UserAiKeys): boolean {
  return USER_AI_PROVIDER_DESCRIPTORS.some(
    (descriptor) => descriptor.isGenerative && Boolean(keys[descriptor.id]),
  );
}

export interface OwnProviderAttempt {
  provider: LLMProvider;
  userProvider: UserAiProvider;
  apiKey: string;
  /**
   * The caller's model override, kept only when the call stays on the
   * provider it asked for: a Gemini/Bedrock model name means nothing to the
   * user's OpenAI or Anthropic account, which then uses its default model.
   */
  model?: string;
}

/**
 * The user's providers to try for a generative call, in order: the requested
 * provider when the user has a key for it, then the others in
 * USER_AI_PROVIDER_DESCRIPTORS order. Calls that asked for a BearlyMail-account
 * provider (Gemini, Bedrock, the Claude CLI) move to the user's first one.
 */
export function planOwnProviderAttempts(
  keys: UserAiKeys,
  requested: LLMProvider | undefined,
  requestedModel: string | undefined,
): OwnProviderAttempt[] {
  const attempts: OwnProviderAttempt[] = [];
  for (const descriptor of USER_AI_PROVIDER_DESCRIPTORS) {
    const provider = GENERATIVE_LLM_PROVIDER[descriptor.id];
    const apiKey = keys[descriptor.id];
    if (!provider || !apiKey) continue;
    attempts.push({
      provider,
      userProvider: descriptor.id,
      apiKey,
      model: provider === requested ? requestedModel : undefined,
    });
  }
  const requestedIndex = attempts.findIndex(
    (attempt) => attempt.provider === requested,
  );
  if (requestedIndex > 0) {
    const [requestedAttempt] = attempts.splice(requestedIndex, 1);
    attempts.unshift(requestedAttempt);
  }
  return attempts;
}

/** Credentials for one Jev call, or null when Jev must be skipped. */
export interface JevCredentials {
  apiKey: string;
  /** Called when TypeSafe refuses the key (the user's key only). */
  onRejected?: () => void;
}

/**
 * Which TypeSafe key a Jev call uses: the user's own when saved; none for a
 * user on their own AI account without one (their generative provider answers
 * instead, so no email text reaches BearlyMail's TypeSafe account); otherwise
 * BearlyMail's key, when configured.
 */
export function selectJevCredentials(
  keys: UserAiKeys,
  systemApiKey: string | undefined,
  onUserKeyRejected: () => void,
): JevCredentials | null {
  const userKey = keys[USER_AI_PROVIDERS.TYPESAFE];
  if (userKey) return { apiKey: userKey, onRejected: onUserKeyRejected };
  if (usesOwnAiAccount(keys) || !systemApiKey) return null;
  return { apiKey: systemApiKey };
}

/** The provider refused the credentials (bad, revoked or expired key). */
export function isAuthFailure(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN;
}

/**
 * A provider refused the user's own key. Deliberately not a 401: the client
 * treats 401 as "your BearlyMail session ended" and logs the user out.
 */
export class UserAiKeyRejectedException extends HttpException {
  constructor(readonly provider: UserAiProvider) {
    const name = findUserAiProvider(provider)?.displayName ?? provider;
    super(
      {
        statusCode: HttpStatus.FAILED_DEPENDENCY,
        code: USER_AI_KEY_REJECTED_CODE,
        provider,
        message: `${name} rejected your API key (it may be invalid, revoked or out of credit). Update it in Settings → Use your own AI account.`,
      },
      HttpStatus.FAILED_DEPENDENCY,
    );
  }
}
