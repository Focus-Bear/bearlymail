/**
 * Minimal LLM client for the Lambda function.
 *
 * Calls Anthropic (default), OpenAI, or Gemini directly using the SDK.
 * Secrets are loaded via Secrets Manager and cached across warm invocations.
 *
 * The prompt template is bundled with the Lambda deployment package.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { getLlmSecrets, resolveLlmProvider } from "./secrets";

// Lazy-loaded clients (cached across warm invocations)
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

// Prompt template cache
let promptTemplate: string | null = null;

function loadPromptTemplate(): string {
  if (promptTemplate) return promptTemplate;

  // The prompt markdown file is bundled with the Lambda package
  const promptPath =
    process.env.PROMPT_TEMPLATE_PATH ||
    path.join(__dirname, "..", "prompts", "analyze-email-patterns.md");

  promptTemplate = fs.readFileSync(promptPath, "utf-8");
  return promptTemplate;
}

async function getAnthropicClient(): Promise<Anthropic> {
  if (anthropicClient) return anthropicClient;
  const secrets = await getLlmSecrets();
  anthropicClient = new Anthropic({ apiKey: secrets.ANTHROPIC_API_KEY });
  return anthropicClient;
}

async function getOpenAIClient(): Promise<OpenAI> {
  if (openaiClient) return openaiClient;
  const secrets = await getLlmSecrets();
  openaiClient = new OpenAI({ apiKey: secrets.OPENAI_API_KEY });
  return openaiClient;
}

export interface ThreadPayload {
  threadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt: string;
  isRead?: boolean;
  timeToReply?: number | null;
  starCount?: number;
  isArchived?: boolean;
}

export interface SentPayload {
  emailId?: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

export interface ContextItem {
  key: string;
  value: string;
  source: string;
}

export interface AnalysisResult {
  context: ContextItem[];
  writingStyle: {
    tone: string;
    style: string;
    commonPhrases: string[];
    emailExamples?: string[];
  };
}

function buildPrompt(
  template: string,
  receivedEmails: ThreadPayload[],
  sentEmails: SentPayload[],
  currentContext: ContextItem[],
  userEmail?: string,
): string {
  const receivedSection = receivedEmails
    .map(
      (e, i) =>
        `Email ${i + 1}:
From: ${e.from}${e.fromName ? ` (${e.fromName})` : ""}
Subject: ${e.subject}
ReceivedAt: ${e.receivedAt}
IsRead: ${e.isRead ?? false}
TimeToReply: ${e.timeToReply !== null && e.timeToReply !== undefined ? (e.timeToReply < 1800000 ? `QUICK (${Math.round(e.timeToReply / 60000)}min)` : `${Math.round(e.timeToReply / 60000)}min`) : "NoReply"}
StarCount: ${e.starCount ?? 0}
IsArchived: ${e.isArchived ?? false}
Body: ${e.body.substring(0, 500)}`,
    )
    .join("\n\n");

  const sentSection = sentEmails
    .slice(0, 50) // Cap sent emails like the server does
    .map(
      (e, i) =>
        `Sent ${i + 1}:
To: ${e.to}
Subject: ${e.subject}
SentAt: ${e.sentAt}
Body: ${e.body.substring(0, 300)}`,
    )
    .join("\n\n");

  const contextSection =
    currentContext.length > 0
      ? currentContext.map((c) => `${c.key}: ${c.value}`).join("\n")
      : "No existing context.";

  return template
    .replace("{{userEmail}}", userEmail || "unknown")
    .replace("{{currentContext}}", contextSection)
    .replace("{{receivedEmails}}", receivedSection)
    .replace("{{sentEmails}}", sentSection);
}

function parseResult(raw: string): AnalysisResult {
  // Strip markdown code blocks if present
  const cleaned = raw
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<AnalysisResult>;
  return {
    context: Array.isArray(parsed.context) ? parsed.context : [],
    writingStyle: parsed.writingStyle || {
      tone: "Professional",
      style: "Concise",
      commonPhrases: [],
    },
  };
}

export async function analyzeEmailPatterns(options: {
  receivedEmails: ThreadPayload[];
  sentEmails: SentPayload[];
  currentContext: ContextItem[];
  userEmail?: string;
  provider?: string;
}): Promise<AnalysisResult> {
  const { receivedEmails, sentEmails, currentContext, userEmail } = options;
  const secrets = await getLlmSecrets();
  const provider =
    options.provider?.trim().toLowerCase() || resolveLlmProvider(secrets);
  const template = loadPromptTemplate();

  const prompt = buildPrompt(
    template,
    receivedEmails,
    sentEmails,
    currentContext,
    userEmail,
  );

  const MAX_TOKENS = 4096;
  const TEMPERATURE = 0.4;

  let rawResponse: string;

  if (provider === "openai") {
    const client = await getOpenAIClient();
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
    });
    rawResponse = response.choices[0]?.message?.content || "{}";
  } else if (provider === "gemini") {
    // Gemini via REST — use fetch (no heavy SDK in Lambda)
    const geminiKey = secrets.GEMINI_API_KEY;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: TEMPERATURE,
            maxOutputTokens: MAX_TOKENS,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    rawResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  } else {
    // Default: Anthropic
    const client = await getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    rawResponse = block.type === "text" ? block.text : "{}";
  }

  return parseResult(rawResponse);
}
