import * as fs from "fs";
import * as path from "path";
import { logError, logWarn } from "../utils/logger";

interface PromptConfig {
  id: string;
  prompt: string;
  systemPrompt: string;
}

let promptsCache: Map<string, PromptConfig> | null = null;

/**
 * Load prompts from markdown files in promptfoo/prompts/ directory
 */
const PROMPT_FILE_MAP: Array<{
  file: string;
  key: string;
  critical?: boolean;
}> = [
  { file: "extract-action-items.md", key: "extract_action_items" },
  { file: "prioritise-email.md", key: "analyze_priority", critical: true },
  { file: "generate-reply.md", key: "generate_reply" },
  { file: "analyze-email-patterns.md", key: "analyze_email_patterns" },
  {
    file: "search-relevance-explanation.md",
    key: "search_relevance_explanation",
  },
  { file: "generate-multiple-replies.md", key: "generate_multiple_replies" },
  { file: "generate-meeting-reply.md", key: "generate_meeting_reply" },
  { file: "generate-follow-up.md", key: "generate_follow_up" },
  { file: "analyze-priority-feedback.md", key: "analyze_priority_feedback" },
  { file: "extract-common-questions.md", key: "extract_common_questions" },
  { file: "summarize-email-tldr.md", key: "summarize_email_tldr" },
  { file: "summarize-email-bullets.md", key: "summarize_email_bullets" },
  { file: "summarize-email-actions.md", key: "summarize_email_actions" },
  { file: "check-tone-style.md", key: "check_tone_style" },
  { file: "suggest-actions.md", key: "suggest_actions" },
  { file: "classify-email-type.md", key: "classify_email_type" },
  { file: "generate-qa-answer.md", key: "generate_qa_answer" },
  { file: "detect-opt-out.md", key: "detect_opt_out" },
  { file: "redact-names.md", key: "redact_names" },
  { file: "validate-writing-example.md", key: "validate_writing_example" },
  { file: "dispute-tone-check.md", key: "dispute_tone_check" },
  { file: "consolidate-email-categories.md", key: "consolidate_categories" },
  {
    file: "generate-categories-from-other.md",
    key: "generate_categories_from_other",
  },
  { file: "summarize-email-batch.md", key: "summarize_email_batch" },
  { file: "classify-contact-type.md", key: "classify_contact_type" },
  { file: "compress-user-context.md", key: "compress_user_context" },
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
    cache.set(key, { id: key, prompt: content, systemPrompt: "" });
    if (critical) {
      logWarn(`✅ Loaded prompt: ${key} from ${file}`);
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

  logWarn(`✅ Prompts directory found at: ${promptsDir}`);

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
      const content = fs.readFileSync(incrementalPriorityCheckPath, "utf-8");
      promptsCache.set("incremental_priority_check", {
        id: "incremental_priority_check",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load incremental-summary.md (incremental summary update)
    const incrementalSummaryPath = path.join(
      promptsDir,
      "incremental-summary.md",
    );
    if (fs.existsSync(incrementalSummaryPath)) {
      const content = fs.readFileSync(incrementalSummaryPath, "utf-8");
      promptsCache.set("incremental_summary", {
        id: "incremental_summary",
        prompt: content,
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
            new RegExp(`\\{\\{\\s*${itemVar}\\.(\\w+)\\s*\\}\\}`, "g"),
            (match, prop) =>
              item[prop] !== undefined ? String(item[prop]) : match,
          );
          // Also support {{itemVar}} directly (for objects)
          itemContent = itemContent.replace(
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
