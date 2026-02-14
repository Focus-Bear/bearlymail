import * as fs from "fs";
import * as path from "path";

interface PromptConfig {
  id: string;
  prompt: string;
  systemPrompt: string;
}

let promptsCache: Map<string, PromptConfig> | null = null;

/**
 * Load prompts from markdown files in promptfoo/prompts/ directory
 */
// eslint-disable-next-line max-lines-per-function, max-statements
export function loadPrompts(): Map<string, PromptConfig> {
  if (promptsCache) {
    return promptsCache;
  }

  promptsCache = new Map();

  // Find the server directory by looking for nest-cli.json or package.json
  // Then construct path to promptfoo/prompts
  let serverDir: string | null = null;
  let currentDir = __dirname;

  // Walk up from __dirname to find server directory (contains nest-cli.json or package.json)
  for (let i = 0; i < 5; i++) {
    const nestCliPath = path.join(currentDir, "nest-cli.json");
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(nestCliPath) || fs.existsSync(packageJsonPath)) {
      // Check if this is the server directory by looking for promptfoo
      const promptfooPath = path.join(currentDir, "promptfoo");
      if (fs.existsSync(promptfooPath)) {
        serverDir = currentDir;
        break;
      }
    }
    const parentDir = path.dirname(currentDir);
    // Reached filesystem root
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Try multiple possible paths to find the prompts directory
  const possiblePaths: string[] = [];

  if (serverDir) {
    possiblePaths.push(path.join(serverDir, "promptfoo/prompts"));
  }

  // Fallback paths
  possiblePaths.push(
    // From src/llm (source)
    path.join(__dirname, "../../promptfoo/prompts"),
    // From dist/src/llm (compiled)
    path.join(__dirname, "../../../promptfoo/prompts"),
    // From project root
    path.join(process.cwd(), "promptfoo/prompts"),
    // From workspace root
    path.join(process.cwd(), "server/promptfoo/prompts"),
  );

  let promptsDir: string | null = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      promptsDir = possiblePath;
      break;
    }
  }

  if (!promptsDir) {
    console.warn(
      `Prompts directory not found. Tried paths: ${possiblePaths.join(", ")}`,
    );
    console.warn(
      `Current __dirname: ${__dirname}, process.cwd(): ${process.cwd()}, serverDir: ${serverDir}`,
    );
    return promptsCache;
  }

  try {
    // Load extract-action-items.md
    const extractActionItemsPath = path.join(
      promptsDir,
      "extract-action-items.md",
    );
    if (fs.existsSync(extractActionItemsPath)) {
      const content = fs.readFileSync(extractActionItemsPath, "utf-8");
      promptsCache.set("extract_action_items", {
        id: "extract_action_items",
        prompt: content,
        systemPrompt: "",
      });
    } else {
      console.warn(
        `extract-action-items.md not found at ${extractActionItemsPath}`,
      );
    }

    // Load prioritise-email.md
    const prioritiseEmailPath = path.join(promptsDir, "prioritise-email.md");
    if (fs.existsSync(prioritiseEmailPath)) {
      const content = fs.readFileSync(prioritiseEmailPath, "utf-8");
      promptsCache.set("analyze_priority", {
        id: "analyze_priority",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load generate-reply.md
    const generateReplyPath = path.join(promptsDir, "generate-reply.md");
    if (fs.existsSync(generateReplyPath)) {
      const content = fs.readFileSync(generateReplyPath, "utf-8");
      promptsCache.set("generate_reply", {
        id: "generate_reply",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load analyze-email-patterns.md
    const analyzePatternsPath = path.join(
      promptsDir,
      "analyze-email-patterns.md",
    );
    if (fs.existsSync(analyzePatternsPath)) {
      const content = fs.readFileSync(analyzePatternsPath, "utf-8");
      promptsCache.set("analyze_email_patterns", {
        id: "analyze_email_patterns",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load search-relevance-explanation.md
    const searchRelevancePath = path.join(
      promptsDir,
      "search-relevance-explanation.md",
    );
    if (fs.existsSync(searchRelevancePath)) {
      const content = fs.readFileSync(searchRelevancePath, "utf-8");
      promptsCache.set("search_relevance_explanation", {
        id: "search_relevance_explanation",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load generate-multiple-replies.md
    const generateMultipleRepliesPath = path.join(
      promptsDir,
      "generate-multiple-replies.md",
    );
    if (fs.existsSync(generateMultipleRepliesPath)) {
      const content = fs.readFileSync(generateMultipleRepliesPath, "utf-8");
      promptsCache.set("generate_multiple_replies", {
        id: "generate_multiple_replies",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load generate-meeting-reply.md
    const generateMeetingReplyPath = path.join(
      promptsDir,
      "generate-meeting-reply.md",
    );
    if (fs.existsSync(generateMeetingReplyPath)) {
      const content = fs.readFileSync(generateMeetingReplyPath, "utf-8");
      promptsCache.set("generate_meeting_reply", {
        id: "generate_meeting_reply",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load generate-follow-up.md
    const generateFollowUpPath = path.join(promptsDir, "generate-follow-up.md");
    if (fs.existsSync(generateFollowUpPath)) {
      const content = fs.readFileSync(generateFollowUpPath, "utf-8");
      promptsCache.set("generate_follow_up", {
        id: "generate_follow_up",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load analyze-priority-feedback.md
    const analyzePriorityFeedbackPath = path.join(
      promptsDir,
      "analyze-priority-feedback.md",
    );
    if (fs.existsSync(analyzePriorityFeedbackPath)) {
      const content = fs.readFileSync(analyzePriorityFeedbackPath, "utf-8");
      promptsCache.set("analyze_priority_feedback", {
        id: "analyze_priority_feedback",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load extract-common-questions.md
    const extractCommonQuestionsPath = path.join(
      promptsDir,
      "extract-common-questions.md",
    );
    if (fs.existsSync(extractCommonQuestionsPath)) {
      const content = fs.readFileSync(extractCommonQuestionsPath, "utf-8");
      promptsCache.set("extract_common_questions", {
        id: "extract_common_questions",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load summarize-email-tldr.md
    const summarizeEmailTldrPath = path.join(
      promptsDir,
      "summarize-email-tldr.md",
    );
    if (fs.existsSync(summarizeEmailTldrPath)) {
      const content = fs.readFileSync(summarizeEmailTldrPath, "utf-8");
      promptsCache.set("summarize_email_tldr", {
        id: "summarize_email_tldr",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load summarize-email-bullets.md
    const summarizeEmailBulletsPath = path.join(
      promptsDir,
      "summarize-email-bullets.md",
    );
    if (fs.existsSync(summarizeEmailBulletsPath)) {
      const content = fs.readFileSync(summarizeEmailBulletsPath, "utf-8");
      promptsCache.set("summarize_email_bullets", {
        id: "summarize_email_bullets",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load summarize-email-actions.md
    const summarizeEmailActionsPath = path.join(
      promptsDir,
      "summarize-email-actions.md",
    );
    if (fs.existsSync(summarizeEmailActionsPath)) {
      const content = fs.readFileSync(summarizeEmailActionsPath, "utf-8");
      promptsCache.set("summarize_email_actions", {
        id: "summarize_email_actions",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load check-tone-style.md
    const checkToneStylePath = path.join(promptsDir, "check-tone-style.md");
    if (fs.existsSync(checkToneStylePath)) {
      const content = fs.readFileSync(checkToneStylePath, "utf-8");
      promptsCache.set("check_tone_style", {
        id: "check_tone_style",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load suggest-actions.md
    const suggestActionsPath = path.join(promptsDir, "suggest-actions.md");
    if (fs.existsSync(suggestActionsPath)) {
      const content = fs.readFileSync(suggestActionsPath, "utf-8");
      promptsCache.set("suggest_actions", {
        id: "suggest_actions",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load classify-email-type.md (auto-responder)
    const classifyEmailTypePath = path.join(
      promptsDir,
      "classify-email-type.md",
    );
    if (fs.existsSync(classifyEmailTypePath)) {
      const content = fs.readFileSync(classifyEmailTypePath, "utf-8");
      promptsCache.set("classify_email_type", {
        id: "classify_email_type",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load generate-qa-answer.md (auto-responder)
    const generateQaAnswerPath = path.join(promptsDir, "generate-qa-answer.md");
    if (fs.existsSync(generateQaAnswerPath)) {
      const content = fs.readFileSync(generateQaAnswerPath, "utf-8");
      promptsCache.set("generate_qa_answer", {
        id: "generate_qa_answer",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load detect-opt-out.md (auto-responder)
    const detectOptOutPath = path.join(promptsDir, "detect-opt-out.md");
    if (fs.existsSync(detectOptOutPath)) {
      const content = fs.readFileSync(detectOptOutPath, "utf-8");
      promptsCache.set("detect_opt_out", {
        id: "detect_opt_out",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load redact-names.md (privacy - name redaction for email examples)
    const redactNamesPath = path.join(promptsDir, "redact-names.md");
    if (fs.existsSync(redactNamesPath)) {
      const content = fs.readFileSync(redactNamesPath, "utf-8");
      promptsCache.set("redact_names", {
        id: "redact_names",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load validate-writing-example.md (validate and clean writing style examples)
    const validateWritingExamplePath = path.join(
      promptsDir,
      "validate-writing-example.md",
    );
    if (fs.existsSync(validateWritingExamplePath)) {
      const content = fs.readFileSync(validateWritingExamplePath, "utf-8");
      promptsCache.set("validate_writing_example", {
        id: "validate_writing_example",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load dispute-tone-check.md (tone check dispute feature)
    const disputeToneCheckPath = path.join(promptsDir, "dispute-tone-check.md");
    if (fs.existsSync(disputeToneCheckPath)) {
      const content = fs.readFileSync(disputeToneCheckPath, "utf-8");
      promptsCache.set("dispute_tone_check", {
        id: "dispute_tone_check",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load consolidate-email-categories.md (category deduplication)
    const consolidateCategoriesPath = path.join(
      promptsDir,
      "consolidate-email-categories.md",
    );
    if (fs.existsSync(consolidateCategoriesPath)) {
      const content = fs.readFileSync(consolidateCategoriesPath, "utf-8");
      promptsCache.set("consolidate_categories", {
        id: "consolidate_categories",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load generate-categories-from-other.md (generate new categories from Other emails)
    const generateCategoriesFromOtherPath = path.join(
      promptsDir,
      "generate-categories-from-other.md",
    );
    if (fs.existsSync(generateCategoriesFromOtherPath)) {
      const content = fs.readFileSync(generateCategoriesFromOtherPath, "utf-8");
      promptsCache.set("generate_categories_from_other", {
        id: "generate_categories_from_other",
        prompt: content,
        systemPrompt: "",
      });
    }

    // Load summarize-email-batch.md
    const summarizeEmailBatchPath = path.join(
      promptsDir,
      "summarize-email-batch.md",
    );
    if (fs.existsSync(summarizeEmailBatchPath)) {
      const content = fs.readFileSync(summarizeEmailBatchPath, "utf-8");
      promptsCache.set("summarize_email_batch", {
        id: "summarize_email_batch",
        prompt: content,
        systemPrompt: "",
      });
    }
  } catch (error) {
    console.error("Failed to load prompts from markdown files:", error);
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
