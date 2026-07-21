/**
 * LLM client for the email prioritiser Lambda function.
 *
 * Handles two phases:
 *   Phase 1 — Triage (cheap model): batch-priority-triage.md determines which
 *     emails actually need full re-analysis.
 *   Phase 2 — Individual analysis (smart model): prioritise-email.md scores
 *     each flagged email.
 *
 * Prompt templates are bundled with the Lambda deployment package.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { sanitizeLogInput } from "./sanitize-log";
import { getLlmSecrets, resolveLlmProvider } from "./secrets";
import type {
  PriorityEmailPayload,
  UserContext,
  BatchPriorityResult,
  TriageResponse,
} from "./types";

// Lazy-loaded clients (cached across warm invocations)
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

const MAX_TOKENS_SMART = 2048;
const MAX_TOKENS_TRIAGE = 512;
const TEMPERATURE_SMART = 0.3;
const TEMPERATURE_TRIAGE = 0;
const DEFAULT_TRIAGE_MODEL = "gpt-4o-mini";

/** Sentinel value for emails preserved by triage (no reanalysis needed). */
const TRIAGE_PRESERVED_CATEGORY = "TRIAGE_PRESERVED";
const TRIAGE_PRESERVED_EXPLANATIONS = {
  URGENCY: "Score preserved by triage — no significant change detected",
  GOAL_ALIGNMENT: "Score preserved by triage",
  CATEGORY: "Category preserved by triage",
  REASONING: "Triage determined no reanalysis needed",
} as const;

function loadPromptTemplate(envVar: string, fallback: string): string {
  const promptPath = process.env[envVar] || fallback;
  if (!fs.existsSync(promptPath)) {
    throw new Error(
      `Prompt template not found at ${promptPath} — set ${envVar} env var or ensure file exists`,
    );
  }
  return fs.readFileSync(promptPath, "utf-8");
}

function getPrioritisePrompt(): string {
  return loadPromptTemplate(
    "PRIORITISE_PROMPT_PATH",
    path.join(__dirname, "..", "prompts", "prioritise-email.md"),
  );
}

function getTriagePrompt(): string {
  return loadPromptTemplate(
    "TRIAGE_PROMPT_PATH",
    path.join(__dirname, "..", "prompts", "batch-priority-triage.md"),
  );
}

async function getAnthropicClient(): Promise<Anthropic> {
  if (anthropicClient) return anthropicClient;
  const secrets = await getLlmSecrets();
  anthropicClient = new Anthropic({ apiKey: secrets.ANTHROPIC_API_KEY! });
  return anthropicClient;
}

async function getOpenAIClient(): Promise<OpenAI> {
  if (openaiClient) return openaiClient;
  const secrets = await getLlmSecrets();
  const provider = resolveLlmProvider(secrets);
  if (provider === "gemini") {
    // Gemini supports the OpenAI-compatible API endpoint
    openaiClient = new OpenAI({
      apiKey: secrets.GEMINI_API_KEY!,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  } else {
    openaiClient = new OpenAI({ apiKey: secrets.OPENAI_API_KEY! });
  }
  return openaiClient;
}

function buildUserContextTexts(userContext?: UserContext): {
  urgentContextText: string;
  notUrgentContextText: string;
  goalsContextText: string;
  workingOnContextText: string;
  dontCareContextText: string;
  emailCategoriesText: string;
} {
  const u = userContext;
  const urgentContextText =
    u?.urgentItems && u.urgentItems.length > 0
      ? u.urgentItems
          .map(
            (item) =>
              `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`,
          )
          .join("\n")
      : "";
  const notUrgentContextText =
    u?.notUrgentItems && u.notUrgentItems.length > 0
      ? u.notUrgentItems
          .map(
            (item) =>
              `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`,
          )
          .join("\n")
      : "";
  const goalsContextText =
    u?.goals && u.goals.length > 0
      ? u.goals
          .map(
            (goal) =>
              `- ${goal.value}${goal.priority ? ` (Priority ${goal.priority})` : ""}`,
          )
          .join("\n")
      : "";
  const workingOnContextText =
    u?.workingOn && u.workingOn.length > 0
      ? u.workingOn
          .map(
            (item) =>
              `- ${item.value}${item.priority ? ` (Priority ${item.priority})` : ""}`,
          )
          .join("\n")
      : "";
  const dontCareContextText =
    u?.dontCare && u.dontCare.length > 0
      ? u.dontCare.map((item) => `- ${item.value}`).join("\n")
      : "";
  const emailCategoriesText =
    u?.emailCategories && u.emailCategories.length > 0
      ? u.emailCategories
          .map((cat) => {
            const keyPart = cat.categoryKey ? ` [id: ${cat.categoryKey}]` : "";
            const body = cat.description
              ? `${keyPart}"${cat.name}": ${cat.description}`
              : `${keyPart}"${cat.name}"`;
            return `  - ${body}`;
          })
          .join("\n")
      : "";
  return {
    urgentContextText,
    notUrgentContextText,
    goalsContextText,
    workingOnContextText,
    dontCareContextText,
    emailCategoriesText,
  };
}

function buildEmailListForTriage(emails: PriorityEmailPayload[]): string {
  return emails
    .map((email, index) => {
      const categoryHint = `\nExisting category: ${email.existingCategory ?? "unassigned"}`;
      const urgencyHint =
        email.existingUrgencyScore !== undefined
          ? `\nExisting urgency score: ${email.existingUrgencyScore}/100`
          : "";
      // Truncate body for triage prompt
      const bodyPreview =
        email.body.length > 500
          ? email.body.substring(0, 500) + "…"
          : email.body;
      return `--- EMAIL ${index + 1} (key: "${email.emailKey}") ---
From: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}
Subject: ${email.subject}
Summary: ${bodyPreview}${categoryHint}${urgencyHint}`;
    })
    .join("\n\n");
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\}\\}`, "g"), value);
  }
  return result;
}

function cleanEmailBody(body: string, maxChars: number): string {
  if (!body) return "";
  // Strip excessive whitespace
  const cleaned = body.replace(/\s+/g, " ").trim();
  return cleaned.length > maxChars ? cleaned.substring(0, maxChars) + "…" : cleaned;
}

/**
 * Date AND time in the user's timezone (falling back to UTC when missing or
 * invalid) so the model can score deadline proximity — mirrors
 * formatDateTimeForPrompt in server/src/utils/timezone.utils.ts.
 */
function formatDateTimeForPrompt(date: Date, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  };
  try {
    return date.toLocaleString("en-US", { ...options, timeZone: timezone || "UTC" });
  } catch {
    return date.toLocaleString("en-US", { ...options, timeZone: "UTC" });
  }
}

async function callLlm(
  prompt: string,
  systemPrompt: string,
  maxTokens: number,
  temperature: number,
  model?: string,
  jsonMode = false,
): Promise<string> {
  const secrets = await getLlmSecrets();
  const provider = resolveLlmProvider(secrets);
  const effectiveModel =
    model ||
    (provider === "gemini"
      ? (secrets.GEMINI_MODEL || "gemini-2.0-flash")
      : provider === "openai"
        ? "gpt-4o"
        : "gpt-4o-mini");

  if (provider === "openai" || provider === "gemini" || model) {
    const client = await getOpenAIClient();
    const chatParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: effectiveModel,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    };
    const response = await client.chat.completions.create(chatParams);
    return response.choices[0]?.message?.content || "{}";
  }

  // Anthropic (default)
  const client = await getAnthropicClient();
  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: (systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt) }],
  });
  const block = response.content[0];
  return block.type === "text" ? block.text : "{}";
}

function parseTriageResponse(
  response: string,
  emails: PriorityEmailPayload[],
): Set<string> | null {
  // Set of emailKeys that need reanalysis
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (!Array.isArray(parsed["results"])) return null;

    const needsReanalysis = new Set<string>();
    const validKeys = new Set(emails.map((e) => e.emailKey));
    const mentionedKeys = new Set<string>();

    for (const item of parsed["results"] as Record<string, unknown>[]) {
      const key = item["key"] as string | undefined;
      if (key && validKeys.has(key)) {
        mentionedKeys.add(key);
        if (item["needsReanalysis"] === true) {
          needsReanalysis.add(key);
        }
      }
    }

    // Fail-open: omitted keys must be reanalysed
    for (const email of emails) {
      if (!mentionedKeys.has(email.emailKey)) {
        needsReanalysis.add(email.emailKey);
      }
    }
    return needsReanalysis;
  } catch {
    return null;
  }
}

function parsePriorityResponse(
  response: string,
  email: PriorityEmailPayload,
): BatchPriorityResult | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const r = parsed["result"] || parsed;

    const urgencyScore = Math.max(0, Math.min(100, Number(r["urgencyScore"]) || 0));
    const goalAlignmentScore = Math.max(
      0,
      Math.min(100, Number(r["goalAlignmentScore"]) || 0),
    );

    return {
      urgencyScore,
      urgencyExplanation: r["urgencyExplanation"] || "No explanation provided",
      sentimentScore: email.preComputedSentimentScore,
      goalAlignmentScore,
      goalAlignmentExplanation:
        r["goalAlignmentExplanation"] || "No explanation provided",
      category: r["category"] || "Other",
      categoryExplanation: r["categoryExplanation"] || "No explanation provided",
      categoryConfidence:
        r["categoryConfidence"] === "HIGH" ||
        r["categoryConfidence"] === "MEDIUM" ||
        r["categoryConfidence"] === "LOW"
          ? (r["categoryConfidence"] as "HIGH" | "MEDIUM" | "LOW")
          : undefined,
      reasoning: r["reasoning"] || "No reasoning provided",
      protoCategorySuggestion: r["protoCategorySuggestion"],
      isFallback: false,
    };
  } catch {
    return null;
  }
}

function buildFallbackResult(email: PriorityEmailPayload): BatchPriorityResult {
  const hasUrgent = /urgent|asap|critical|emergency/i.test(email.subject);
  return {
    urgencyScore: hasUrgent ? 60 : 30,
    urgencyExplanation: hasUrgent
      ? "Contains urgent keywords (fallback)"
      : "No urgent indicators (fallback)",
    sentimentScore: email.preComputedSentimentScore,
    goalAlignmentScore: 0,
    goalAlignmentExplanation: "No goal alignment detected",
    category: "Other",
    categoryExplanation: "Fallback response",
    reasoning: "Fallback result due to LLM parse failure",
    isFallback: true,
  };
}

/**
 * Phase 1 — Triage: run cheap model to filter emails needing full reanalysis.
 * Returns a Set of emailKeys to re-analyse; emails NOT in the set are triage-preserved.
 */
async function runTriage(
  emails: PriorityEmailPayload[],
): Promise<Set<string>> {
  const template = getTriagePrompt();
  const emailList = buildEmailListForTriage(emails);
  const prompt = renderTemplate(template, { emailList });

  let response: string;
  try {
    response = await callLlm(prompt, "", MAX_TOKENS_TRIAGE, TEMPERATURE_TRIAGE, DEFAULT_TRIAGE_MODEL, true);
  } catch (err) {
    // Log only the message: LLM SDK errors can echo the prompt (email content) — CWE-312.
    console.warn(
      "[LLM] Triage call failed — will analyse all emails:",
      sanitizeLogInput(err instanceof Error ? err.message : err),
    );
    return new Set(emails.map((e) => e.emailKey));
  }

  const flagged = parseTriageResponse(response, emails);
  if (!flagged) {
    console.warn("[LLM] Triage parse failed — analysing all emails");
    return new Set(emails.map((e) => e.emailKey));
  }

  console.log(`[LLM] Triage: ${flagged.size}/${emails.length} emails flagged for reanalysis`);
  return flagged;
}

/**
 * Phase 2 — Individual analysis: run smart model for each email.
 */
async function runIndividualAnalysis(
  email: PriorityEmailPayload,
  userContext?: UserContext,
  userTimezone?: string,
): Promise<BatchPriorityResult> {
  const template = getPrioritisePrompt();
  const ctxTexts = buildUserContextTexts(userContext);
  const currentDateStr = formatDateTimeForPrompt(new Date(), userTimezone);
  const receivedAtStr = email.receivedAt
    ? formatDateTimeForPrompt(new Date(email.receivedAt), userTimezone)
    : "";

  const cleanedBody = cleanEmailBody(
    email.body,
    2000, // CLASSIFICATION_PREVIEW equivalent
  );

  const protoCategoriesText =
    userContext?.protoCategories && userContext.protoCategories.length > 0
      ? userContext.protoCategories
          .map((pc) => {
            const keyPart = pc.categoryKey ? ` [id: ${pc.categoryKey}]` : "";
            const desc = pc.description
              ? `${keyPart}"${pc.name}": ${pc.description}`
              : `${keyPart}"${pc.name}"`;
            return `  - ${desc}`;
          })
          .join("\n")
      : "";

  const prompt = renderTemplate(template, {
    from: email.fromName || email.from,
    fromName: email.fromName || email.from,
    senderJobTitle: email.senderJobTitle || "",
    subject: email.subject,
    body: cleanedBody,
    currentDate: currentDateStr,
    receivedAt: receivedAtStr,
    urgentContext: ctxTexts.urgentContextText,
    notUrgentContext: ctxTexts.notUrgentContextText,
    goalsContext: ctxTexts.goalsContextText,
    workingOnContext: ctxTexts.workingOnContextText,
    dontCareContext: ctxTexts.dontCareContextText,
    emailCategories: ctxTexts.emailCategoriesText,
    protoCategories: protoCategoriesText,
    threadInfo: "",
  });

  let response: string;
  try {
    response = await callLlm(prompt, "", MAX_TOKENS_SMART, TEMPERATURE_SMART, undefined, true);
  } catch (err) {
    // Log only the message: LLM SDK errors can echo the prompt (email content) — CWE-312.
    console.error(
      `[LLM] Individual analysis failed for ${email.emailKey}:`,
      sanitizeLogInput(err instanceof Error ? err.message : err),
    ); // nosemgrep
    return buildFallbackResult(email);
  }

  const parsed = parsePriorityResponse(response, email);
  if (!parsed) {
    console.warn(`[LLM] Parse failed for ${email.emailKey}, using fallback`);
    return buildFallbackResult(email);
  }
  return parsed;
}

/**
 * Run the full two-phase priority analysis on a batch of emails.
 * Returns a Map of emailKey → BatchPriorityResult.
 */
export async function analyzePriorityBatch(
  emails: PriorityEmailPayload[],
  userContext?: UserContext,
  userTimezone?: string,
): Promise<Map<string, BatchPriorityResult>> {
  const results = new Map<string, BatchPriorityResult>();

  if (emails.length === 0) return results;

  // Separate emails with existing analysis (need triage) from new ones
  const emailsNeedingTriage = emails.filter(
    (e) =>
      e.existingCategory !== undefined || e.existingUrgencyScore !== undefined,
  );
  const newEmails = emails.filter(
    (e) =>
      e.existingCategory === undefined && e.existingUrgencyScore === undefined,
  );

  // Phase 1: Triage on emails that already have scores
  const triageFlagged =
    emailsNeedingTriage.length > 0
      ? await runTriage(emailsNeedingTriage)
      : new Set<string>();

  // Phase 2: Individual analysis for flagged emails + all new emails
  const emailsToAnalyse = [
    ...newEmails,
    ...emailsNeedingTriage.filter((e) => triageFlagged.has(e.emailKey)),
  ];

  for (const email of emailsToAnalyse) {
    console.log(`[LLM] Analysing email: ${email.emailKey}`);
    const result = await runIndividualAnalysis(email, userContext, userTimezone);
    results.set(email.emailKey, result);
  }

  // Mark triage-preserved emails (not flagged, keep existing scores)
  for (const email of emailsNeedingTriage) {
    if (!triageFlagged.has(email.emailKey)) {
      results.set(email.emailKey, {
        urgencyScore: -1,
        urgencyExplanation: TRIAGE_PRESERVED_EXPLANATIONS.URGENCY,
        sentimentScore: email.preComputedSentimentScore,
        goalAlignmentScore: -1,
        goalAlignmentExplanation: TRIAGE_PRESERVED_EXPLANATIONS.GOAL_ALIGNMENT,
        category: TRIAGE_PRESERVED_CATEGORY,
        categoryExplanation: TRIAGE_PRESERVED_EXPLANATIONS.CATEGORY,
        reasoning: TRIAGE_PRESERVED_EXPLANATIONS.REASONING,
        isFallback: false,
        triagePreserved: true,
      });
    }
  }

  // Fill fallback entries for any missing emails
  for (const email of emails) {
    if (!results.has(email.emailKey)) {
      results.set(email.emailKey, buildFallbackResult(email));
    }
  }

  return results;
}
