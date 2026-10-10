import type { Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import { normalizeCategoryNameForDedup } from "../utils/category-format.util";
import { LLMProvider } from "./llm.types";
import type { LLMCoreService } from "./llm-core.service";
import { LLM_OP_DISCOVER_USER_CONTEXT } from "./llm-operations";
import { tryParseJsonObjectFromLlmResponse } from "./llm-summary-utils";
import { CONTEXT_PROMPT_IDS, getPrompt, renderPrompt } from "./prompts";

/**
 * The slice of a thread the discovery prompt sees. Deliberately tiny — no
 * bodies beyond a short snippet — so 100 of these fit in one cheap model call
 * and onboarding never ships a mailbox worth of text to an LLM.
 */
export interface DiscoveryThreadStub {
  threadId: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  /** True when any message in the thread was sent by the user. */
  userReplied: boolean;
}

export interface DiscoveredCategory {
  name: string;
  description: string;
}

export interface DiscoveredVipContact {
  name: string;
  email?: string;
  reason?: string;
}

export interface DiscoveryResult {
  categories: DiscoveredCategory[];
  vipContacts: DiscoveredVipContact[];
  urgentHints: string[];
  notUrgentHints: string[];
}

export interface DiscoverUserContextParams {
  threads: DiscoveryThreadStub[];
  userEmail: string | null;
  existingCategories: string[];
  existingVipContacts: string[];
  userId?: string;
}

type GenerateText = (request: {
  prompt: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
  userId?: string;
}) => Promise<string>;

const NONE_PLACEHOLDER = "(none)";
const USER_REPLIED_YES = "yes";
const USER_REPLIED_NO = "no";

/** One line per thread — the only representation the model ever sees. */
export function formatDiscoveryThreads(threads: DiscoveryThreadStub[]): string {
  return threads
    .map((thread, index) => {
      const sender = thread.fromName
        ? `${thread.fromName} <${thread.from}>`
        : thread.from;
      const replied = thread.userReplied ? USER_REPLIED_YES : USER_REPLIED_NO;
      return `${index + 1}. From: ${sender} | Subject: ${thread.subject || "(no subject)"} | UserReplied: ${replied} | Snippet: ${thread.snippet}`;
    })
    .join("\n");
}

function formatList(items: string[]): string {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0
    ? cleaned.map((item) => `- ${item}`).join("\n")
    : NONE_PLACEHOLDER;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readString(item))
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Categories come back name+description; drop blanks, names that already
 * exist for the user (a cheap model re-proposes "🔔 Monitoring Alerts" as
 * "🚨 Monitoring Alerts" despite being told not to), and duplicates within one
 * response so a chatty model can't pad the list.
 */
function readCategories(
  value: unknown,
  existingCategories: string[],
): DiscoveredCategory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(
    existingCategories
      .map((name) => normalizeCategoryNameForDedup(name))
      .filter(Boolean),
  );
  const categories: DiscoveredCategory[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const name = readString(record.name);
    const key = normalizeCategoryNameForDedup(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    categories.push({ name, description: readString(record.description) });
    if (categories.length >= QUERY_LIMITS.DISCOVERY_MAX_CATEGORIES_PER_BATCH) {
      break;
    }
  }
  return categories;
}

function readVipContacts(
  value: unknown,
  userEmail: string | null,
): DiscoveredVipContact[] {
  if (!Array.isArray(value)) return [];
  const ownEmail = userEmail?.toLowerCase() ?? null;
  const contacts: DiscoveredVipContact[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const name = readString(record.name);
    const email = readString(record.email).toLowerCase() || undefined;
    if (!name) continue;
    // The prompt says never to list the user, but a cheap model still might.
    if (ownEmail && email === ownEmail) continue;
    contacts.push({ name, email, reason: readString(record.reason) });
    if (contacts.length >= QUERY_LIMITS.DISCOVERY_MAX_VIPS_PER_BATCH) break;
  }
  return contacts;
}

/** Narrow a raw model response into a DiscoveryResult; null when unparseable. */
export function parseDiscoveryResponse(
  raw: string,
  userEmail: string | null,
  existingCategories: string[] = [],
): DiscoveryResult | null {
  const parsed = tryParseJsonObjectFromLlmResponse(raw);
  if (!parsed) return null;
  return {
    categories: readCategories(parsed.categories, existingCategories),
    vipContacts: readVipContacts(parsed.vipContacts, userEmail),
    urgentHints: readStringList(
      parsed.urgentHints,
      QUERY_LIMITS.DISCOVERY_MAX_HINTS_PER_BATCH,
    ),
    notUrgentHints: readStringList(
      parsed.notUrgentHints,
      QUERY_LIMITS.DISCOVERY_MAX_HINTS_PER_BATCH,
    ),
  };
}

/**
 * One discovery call over a batch of thread stubs. Returns null on a missing
 * prompt, an LLM error, or an unparseable response so the caller can escalate.
 */
export async function discoverUserContext(
  generateText: GenerateText,
  logger: Logger,
  params: DiscoverUserContextParams,
): Promise<DiscoveryResult | null> {
  const { threads, userEmail, existingCategories, existingVipContacts } =
    params;
  if (threads.length === 0) return null;

  const promptConfig = getPrompt(CONTEXT_PROMPT_IDS.DISCOVER_USER_CONTEXT);
  if (!promptConfig) {
    logger.error("[DISCOVER-CONTEXT] discover_user_context prompt not found");
    return null;
  }

  const renderVars = {
    userEmail: userEmail || "",
    existingCategories: formatList(existingCategories),
    existingVipContacts: formatList(existingVipContacts),
    threadCount: threads.length,
    threads: formatDiscoveryThreads(threads),
  };
  const prompt = renderPrompt(promptConfig.prompt || "", renderVars);
  const systemPrompt = renderPrompt(
    promptConfig.systemPrompt || "",
    renderVars,
  );

  try {
    const response = await generateText({
      prompt,
      systemPrompt,
      temperature: RATIOS.THIRTY_PERCENT,
      maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
      jsonMode: true,
      userId: params.userId,
    });
    const result = parseDiscoveryResponse(
      response,
      userEmail,
      existingCategories,
    );
    if (!result) {
      logger.warn("[DISCOVER-CONTEXT] No JSON object in response");
    }
    return result;
  } catch (error) {
    logger.error(`[DISCOVER-CONTEXT] ERROR: ${getErrorMessage(error)}`);
    return null;
  }
}

/**
 * Discovery with **Nova Micro (Bedrock)** as the primary model, escalating to
 * **Gemini** only when Nova fails outright, returns nothing parseable, or
 * returns no categories at all on a first analysis (a sample of 20 real inbox
 * threads always has at least one bucket, so an empty list means the cheap
 * model gave up). On a re-analysis an empty list is legitimate — every bucket
 * may already exist — so it is not escalated. This mirrors
 * `categoriseWithEscalation` so onboarding rides the same cost curve as the
 * per-email categorisation pipeline.
 */
export async function discoverUserContextWithEscalation(
  llmCoreService: Pick<LLMCoreService, "generateText">,
  logger: Logger,
  params: DiscoverUserContextParams,
): Promise<DiscoveryResult | null> {
  const runWith = (provider: LLMProvider) =>
    discoverUserContext(
      (request) =>
        llmCoreService.generateText(
          { ...request, operation: LLM_OP_DISCOVER_USER_CONTEXT },
          provider,
          params.userId,
        ),
      logger,
      params,
    );

  const primary = await runWith(LLMProvider.BEDROCK);
  const isReanalysis = params.existingCategories.length > 0;
  if (primary && (primary.categories.length > 0 || isReanalysis)) {
    return primary;
  }

  const escalated = await runWith(LLMProvider.GEMINI);
  if (!escalated) {
    return primary;
  }
  logger.log(
    `[DISCOVER-CONTEXT] escalated to Gemini (nova: ${
      primary ? "no categories" : "failed"
    }) → ${escalated.categories.length} categories`,
  );
  return escalated;
}
