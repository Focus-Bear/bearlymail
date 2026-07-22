import * as fs from "fs";
import * as path from "path";

import { logError, logLog, logWarn } from "../utils/logger";

interface PromptConfig {
  id: string;
  prompt: string;
  systemPrompt: string;
}

let promptsCache: Map<string, PromptConfig> | null = null;

/**
 * Named constants for summarisation prompt IDs.
 *
 * Use these instead of inline string literals when calling `getPrompt()`.
 */
export const SUMMARY_PROMPT_IDS = {
  TLDR: "summarize_email_tldr",
  BULLETS: "summarize_email_bullets",
  ACTIONS: "summarize_email_actions",
  CHECK_PHISHING_ONLY: "check_phishing_only",
  BATCH: "summarize_email_batch",
  CUSTOM: "summarize_email_custom",
} as const;

/**
 * Named constants for priority-analysis prompt IDs.
 */
export const PRIORITY_PROMPT_IDS = {
  ANALYZE_PRIORITY: "analyze_priority",
  ANALYZE_PRIORITY_FEEDBACK: "analyze_priority_feedback",
  INCREMENTAL_PRIORITY_CHECK: "incremental_priority_check",
  BATCH_PRIORITY_TRIAGE: "batch_priority_triage",
} as const;

/**
 * Named constants for reply-generation prompt IDs.
 */
export const REPLY_PROMPT_IDS = {
  GENERATE_REPLY: "generate_reply",
  GENERATE_MULTIPLE_REPLIES: "generate_multiple_replies",
  GENERATE_MEETING_REPLY: "generate_meeting_reply",
  GENERATE_FOLLOW_UP: "generate_follow_up",
  GENERATE_QA_ANSWER: "generate_qa_answer",
} as const;

/**
 * Named constants for classification prompt IDs.
 */
export const CLASSIFICATION_PROMPT_IDS = {
  CLASSIFY_EMAIL_TYPE: "classify_email_type",
  CLASSIFY_CONTACT_TYPE: "classify_contact_type",
  CHECK_CUSTOM_EXCLUSION_RULES: "check_custom_exclusion_rules",
} as const;

/**
 * Named constants for context-analysis and extraction prompt IDs.
 */
export const CONTEXT_PROMPT_IDS = {
  ANALYZE_EMAIL_PATTERNS: "analyze_email_patterns",
  EXTRACT_ACTION_ITEMS: "extract_action_items",
  EXTRACT_COMMON_QUESTIONS: "extract_common_questions",
  INCREMENTAL_SUMMARY: "incremental_summary",
  COMPRESS_USER_CONTEXT: "compress_user_context",
} as const;

/**
 * Named constants for calendar/booking prompt IDs.
 */
export const CALENDAR_PROMPT_IDS = {
  GENERATE_BOOKING_TITLE: "generate_booking_title",
  DETECT_MEETING_PROPOSAL: "detect_meeting_proposal",
} as const;

/**
 * Named constants for miscellaneous utility prompt IDs.
 */
export const UTILITY_PROMPT_IDS = {
  SUGGEST_ACTIONS: "suggest_actions",
  CHECK_TONE_STYLE: "check_tone_style",
  EXTRACT_MEETING_DATE_REFERENCES: "extract_meeting_date_references",
  SEARCH_RELEVANCE_EXPLANATION: "search_relevance_explanation",
  REDACT_NAMES: "redact_names",
  VALIDATE_WRITING_EXAMPLE: "validate_writing_example",
  DISPUTE_TONE_CHECK: "dispute_tone_check",
  CONSOLIDATE_CATEGORIES: "consolidate_categories",
  MERGE_DUPLICATE_CATEGORIES: "merge_duplicate_categories",
  GENERATE_CATEGORIES_FROM_OTHER: "generate_categories_from_other",
  DETECT_OPT_OUT: "detect_opt_out",
  SUGGEST_CATEGORY_RULES: "suggest_category_rules",
  CATEGORISE_SUMMARY: "categorise_summary",
  DERIVE_RULE_EXCLUSIONS: "derive_rule_exclusions",
  ASSESS_CATEGORY_RULE_VALUE: "assess_category_rule_value",
  CHECK_CATEGORY_DUPLICATE: "check_category_duplicate",
  DERIVE_MCP_SENDER_TOOL: "derive_mcp_sender_tool",
  VERIFY_DISTRACTION_PHRASE: "verify_distraction_phrase",
} as const;

/**
 * Named constants for assistant/chat prompt IDs.
 */
export const ASSISTANT_PROMPT_IDS = {
  ASK_AI_EMAIL: "ask_ai_email",
  ASK_AI_AGENT: "ask_ai_agent",
} as const;

/**
 * Named constants for summary type strings.
 *
 * Use these in comparisons and assignments instead of inline string literals.
 */
export const SUMMARY_TYPES = {
  TLDR: "tldr",
  BULLET_POINTS: "bullet-points",
  ACTION_ITEMS: "action-items",
  SENDER_REQUEST: "sender-request",
  CUSTOM: "custom",
} as const;

/** Union type of all valid summary type strings, derived from `SUMMARY_TYPES`. */
export type SummaryType = (typeof SUMMARY_TYPES)[keyof typeof SUMMARY_TYPES];

/**
 * Load prompts from markdown files in promptfoo/prompts/ directory
 */
const PROMPT_FILE_MAP: Array<{
  file: string;
  key: string;
  critical?: boolean;
}> = [
  {
    file: "extract-action-items.md",
    key: CONTEXT_PROMPT_IDS.EXTRACT_ACTION_ITEMS,
  },
  {
    file: "prioritise-email.md",
    key: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY,
    critical: true,
  },
  { file: "generate-reply.md", key: REPLY_PROMPT_IDS.GENERATE_REPLY },
  {
    file: "analyze-email-patterns.md",
    key: CONTEXT_PROMPT_IDS.ANALYZE_EMAIL_PATTERNS,
  },
  {
    file: "search-relevance-explanation.md",
    key: UTILITY_PROMPT_IDS.SEARCH_RELEVANCE_EXPLANATION,
  },
  {
    file: "generate-multiple-replies.md",
    key: REPLY_PROMPT_IDS.GENERATE_MULTIPLE_REPLIES,
  },
  {
    file: "generate-meeting-reply.md",
    key: REPLY_PROMPT_IDS.GENERATE_MEETING_REPLY,
  },
  { file: "generate-follow-up.md", key: REPLY_PROMPT_IDS.GENERATE_FOLLOW_UP },
  {
    file: "analyze-priority-feedback.md",
    key: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY_FEEDBACK,
  },
  {
    file: "extract-common-questions.md",
    key: CONTEXT_PROMPT_IDS.EXTRACT_COMMON_QUESTIONS,
  },
  { file: "summarize-email-tldr.md", key: SUMMARY_PROMPT_IDS.TLDR },
  { file: "summarize-email-bullets.md", key: SUMMARY_PROMPT_IDS.BULLETS },
  { file: "summarize-email-actions.md", key: SUMMARY_PROMPT_IDS.ACTIONS },
  { file: "check-tone-style.md", key: UTILITY_PROMPT_IDS.CHECK_TONE_STYLE },
  {
    file: "extract-meeting-date-references.md",
    key: UTILITY_PROMPT_IDS.EXTRACT_MEETING_DATE_REFERENCES,
  },
  { file: "suggest-actions.md", key: UTILITY_PROMPT_IDS.SUGGEST_ACTIONS },
  {
    file: "classify-email-type.md",
    key: CLASSIFICATION_PROMPT_IDS.CLASSIFY_EMAIL_TYPE,
  },
  { file: "generate-qa-answer.md", key: REPLY_PROMPT_IDS.GENERATE_QA_ANSWER },
  { file: "detect-opt-out.md", key: UTILITY_PROMPT_IDS.DETECT_OPT_OUT },
  { file: "redact-names.md", key: UTILITY_PROMPT_IDS.REDACT_NAMES },
  {
    file: "validate-writing-example.md",
    key: UTILITY_PROMPT_IDS.VALIDATE_WRITING_EXAMPLE,
  },
  { file: "dispute-tone-check.md", key: UTILITY_PROMPT_IDS.DISPUTE_TONE_CHECK },
  {
    file: "consolidate-email-categories.md",
    key: UTILITY_PROMPT_IDS.CONSOLIDATE_CATEGORIES,
  },
  {
    file: "merge-duplicate-categories.md",
    key: UTILITY_PROMPT_IDS.MERGE_DUPLICATE_CATEGORIES,
  },
  {
    file: "generate-categories-from-other.md",
    key: UTILITY_PROMPT_IDS.GENERATE_CATEGORIES_FROM_OTHER,
  },
  { file: "summarize-email-batch.md", key: SUMMARY_PROMPT_IDS.BATCH },
  {
    file: "classify-contact-type.md",
    key: CLASSIFICATION_PROMPT_IDS.CLASSIFY_CONTACT_TYPE,
  },
  {
    file: "check-custom-exclusion-rules.md",
    key: CLASSIFICATION_PROMPT_IDS.CHECK_CUSTOM_EXCLUSION_RULES,
  },
  {
    file: "compress-user-context.md",
    key: CONTEXT_PROMPT_IDS.COMPRESS_USER_CONTEXT,
  },
  {
    file: "check-phishing-only.md",
    key: SUMMARY_PROMPT_IDS.CHECK_PHISHING_ONLY,
  },
  {
    file: "summarize-email-custom.md",
    key: SUMMARY_PROMPT_IDS.CUSTOM,
  },
  {
    file: "generate-booking-title.md",
    key: CALENDAR_PROMPT_IDS.GENERATE_BOOKING_TITLE,
  },
  {
    file: "suggest-category-rules.md",
    key: UTILITY_PROMPT_IDS.SUGGEST_CATEGORY_RULES,
  },
  {
    file: "categorise-summary.md",
    key: UTILITY_PROMPT_IDS.CATEGORISE_SUMMARY,
  },
  {
    file: "derive-rule-exclusions.md",
    key: UTILITY_PROMPT_IDS.DERIVE_RULE_EXCLUSIONS,
  },
  {
    file: "assess-category-rule-value.md",
    key: UTILITY_PROMPT_IDS.ASSESS_CATEGORY_RULE_VALUE,
  },
  {
    file: "batch-priority-triage.md",
    key: PRIORITY_PROMPT_IDS.BATCH_PRIORITY_TRIAGE,
  },
  {
    file: "detect-meeting-proposal.md",
    key: CALENDAR_PROMPT_IDS.DETECT_MEETING_PROPOSAL,
  },
  {
    file: "check-category-duplicate.md",
    key: UTILITY_PROMPT_IDS.CHECK_CATEGORY_DUPLICATE,
  },
  {
    file: "derive-mcp-sender-tool.md",
    key: UTILITY_PROMPT_IDS.DERIVE_MCP_SENDER_TOOL,
  },
  {
    file: "ask-ai-email.md",
    key: ASSISTANT_PROMPT_IDS.ASK_AI_EMAIL,
  },
  {
    file: "ask-ai-agent.md",
    key: ASSISTANT_PROMPT_IDS.ASK_AI_AGENT,
  },
  {
    file: "verify-distraction-phrase.md",
    key: UTILITY_PROMPT_IDS.VERIFY_DISTRACTION_PHRASE,
  },
];

function loadPromptFile(
  promptsDir: string,
  file: string,
  key: string,
  cache: Map<string, PromptConfig>,
  critical?: boolean,
): void {
  const filePath = path.join(promptsDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    // Support optional ---SYSTEM--- delimiter to split static system instructions
    // from the dynamic user prompt (enables provider-side prompt caching).
    const SYSTEM_DELIMITER = "---SYSTEM---";
    const delimiterStart = content.indexOf(SYSTEM_DELIMITER);
    const delimiterEnd = content.indexOf(
      SYSTEM_DELIMITER,
      delimiterStart + SYSTEM_DELIMITER.length,
    );
    let promptText = content;
    let systemPromptText = "";
    if (
      delimiterStart !== -1 &&
      delimiterEnd !== -1 &&
      delimiterEnd > delimiterStart
    ) {
      systemPromptText = content
        .slice(delimiterStart + SYSTEM_DELIMITER.length, delimiterEnd)
        .trim();
      promptText = content.slice(delimiterEnd + SYSTEM_DELIMITER.length).trim();
    }
    cache.set(key, {
      id: key,
      prompt: promptText,
      systemPrompt: systemPromptText,
    });
    if (critical) {
      logLog(`✅ Loaded prompt: ${key} from ${file}`);
    }
  } else if (critical) {
    logError(`❌ CRITICAL: ${file} not found at ${filePath}`, undefined, {
      promptPath: filePath,
    });
  } else {
    logWarn(`${file} not found at ${filePath}`);
  }
}

function findServerDir(): string | null {
  let currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
    const nestCliPath = path.join(currentDir, "nest-cli.json");
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(nestCliPath) || fs.existsSync(packageJsonPath)) {
      const promptfooPath = path.join(currentDir, "promptfoo");
      if (fs.existsSync(promptfooPath)) {
        return currentDir;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

function resolvePromptsDir(serverDir: string | null): string | null {
  const possiblePaths: string[] = [];
  if (serverDir) {
    // nosemgrep
    possiblePaths.push(path.join(serverDir, "promptfoo/prompts"));
  }
  possiblePaths.push(
    path.join(__dirname, "../../promptfoo/prompts"),
    path.join(__dirname, "../../../promptfoo/prompts"),
    path.join(process.cwd(), "promptfoo/prompts"),
    path.join(process.cwd(), "server/promptfoo/prompts"),
  );

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  }

  logError(
    `❌ PROMPTS DIRECTORY NOT FOUND. Tried paths: ${possiblePaths.join(", ")}`,
    undefined,
    { __dirname, cwd: process.cwd(), serverDir },
  );
  logError(
    `Current __dirname: ${__dirname}, process.cwd(): ${process.cwd()}, serverDir: ${serverDir}`,
  );
  logError(
    `This will cause "prompt not found" errors. Check that promptfoo/prompts/ exists relative to the server directory.`,
  );
  return null;
}

export function loadPrompts(): Map<string, PromptConfig> {
  if (promptsCache) {
    return promptsCache;
  }

  promptsCache = new Map();

  const serverDir = findServerDir();
  const promptsDir = resolvePromptsDir(serverDir);

  if (!promptsDir) {
    return promptsCache;
  }

  logLog(`✅ Prompts directory found at: ${promptsDir}`);

  try {
    for (const { file, key, critical } of PROMPT_FILE_MAP) {
      loadPromptFile(promptsDir, file, key, promptsCache, critical);
    }

    // Load incremental-priority-check.md (incremental priority/category assessment)
    const incrementalPriorityCheckPath = path.join(
      promptsDir,
      "incremental-priority-check.md",
    );
    if (fs.existsSync(incrementalPriorityCheckPath)) {
      const incrementalPriorityCheckContent = fs.readFileSync(
        incrementalPriorityCheckPath,
        "utf-8",
      );
      promptsCache.set(PRIORITY_PROMPT_IDS.INCREMENTAL_PRIORITY_CHECK, {
        id: PRIORITY_PROMPT_IDS.INCREMENTAL_PRIORITY_CHECK,
        prompt: incrementalPriorityCheckContent,
        systemPrompt: "",
      });
    }

    // Load incremental-summary.md (incremental summary update)
    const incrementalSummaryPath = path.join(
      promptsDir,
      "incremental-summary.md",
    );
    if (fs.existsSync(incrementalSummaryPath)) {
      const incrementalSummaryContent = fs.readFileSync(
        incrementalSummaryPath,
        "utf-8",
      );
      promptsCache.set(CONTEXT_PROMPT_IDS.INCREMENTAL_SUMMARY, {
        id: CONTEXT_PROMPT_IDS.INCREMENTAL_SUMMARY,
        prompt: incrementalSummaryContent,
        systemPrompt: "",
      });
    }
  } catch (error) {
    logError(
      "Failed to load prompts from markdown files",
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  return promptsCache;
}

/**
 * Get a prompt by ID
 */
export function getPrompt(id: string): PromptConfig | null {
  const prompts = loadPrompts();
  return prompts.get(id) || null;
}

/**
 * Render a prompt template with variables (Nunjucks syntax)
 * @param template - The template string with Nunjucks-style placeholders
 * @param vars - Variables to substitute into the template (can be strings, numbers, arrays, objects)
 */
export function renderPrompt(
  template: string,
  vars: Record<string, unknown>,
): string {
  let result = template;

  // Handle {% if var %}...{% else %}...{% endif %} blocks FIRST (before for loops)
  result = result.replace(
    /\{%\s*if\s+(\w+)\s*%\}([\s\S]*?)(?:\{%\s*else\s*%\}([\s\S]*?))?\{%\s*endif\s*%\}/g,
    (match, key, ifContent, elseContent) => {
      const value = vars[key];
      // Arrays are truthy, but empty arrays should be falsy for this check
      const isTruthy = Array.isArray(value) ? value.length > 0 : !!value;
      return isTruthy ? ifContent : elseContent || "";
    },
  );

  // Handle {% for item in array %}...{% endfor %} blocks (after if blocks)
  result = result.replace(
    /\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
    (match, itemVar, arrayKey, content) => {
      const array = vars[arrayKey];
      if (!Array.isArray(array) || array.length === 0) {
        return "";
      }
      return array
        .map((item, index) => {
          // Replace loop.index0 with the index (Nunjucks convention)
          let itemContent = content.replace(
            /\{\{\s*loop\.index0\s*\}\}/g,
            String(index),
          );
          // Replace {{itemVar.property}} with item.property
          itemContent = itemContent.replace(
            // nosemgrep
            new RegExp(`\\{\\{\\s*${itemVar}\\.(\\w+)\\s*\\}\\}`, "g"),
            (match, prop) =>
              item[prop] !== undefined ? String(item[prop]) : match,
          );
          // Also support {{itemVar}} directly (for objects)
          itemContent = itemContent.replace(
            // nosemgrep
            new RegExp(`\\{\\{\\s*${itemVar}\\s*\\}\\}`, "g"),
            typeof item === "object" ? JSON.stringify(item) : String(item),
          );
          // Replace {{property}} with item.property (when itemVar context is implied)
          itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (match, prop) => {
            // If this property exists in the item, use it; otherwise try vars
            if (item[prop] !== undefined) {
              return String(item[prop]);
            }
            // Fallback to vars if not in item
            return vars[prop] !== undefined ? String(vars[prop]) : match;
          });
          return itemContent;
        })
        .join("");
    },
  );

  // Simple template rendering: {{var}} - replace variables (this works the same in both syntaxes)
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    vars[key] !== undefined ? String(vars[key]) : match,
  );

  return result;
}
