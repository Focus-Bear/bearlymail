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
    if (parentDir === currentDir) break; // Reached filesystem root
    currentDir = parentDir;
  }

  // Try multiple possible paths to find the prompts directory
  const possiblePaths: string[] = [];

  if (serverDir) {
    possiblePaths.push(path.join(serverDir, "promptfoo/prompts"));
  }

  // Fallback paths
  possiblePaths.push(
    path.join(__dirname, "../../promptfoo/prompts"), // From src/llm (source)
    path.join(__dirname, "../../../promptfoo/prompts"), // From dist/src/llm (compiled)
    path.join(process.cwd(), "promptfoo/prompts"), // From project root
    path.join(process.cwd(), "server/promptfoo/prompts"), // From workspace root
  );

  let promptsDir: string | null = null;
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      promptsDir = possiblePath;
      console.log(`Found prompts directory at: ${promptsDir}`);
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
      console.log("Loaded extract_action_items prompt");
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
      promptsCache.set("search-relevance-explanation", {
        id: "search-relevance-explanation",
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
 * Render a prompt template with variables
 */
export function renderPrompt(
  template: string,
  vars: Record<string, any>,
): string {
  let result = template;

  // Handle {{#if var}}...{{else}}...{{/if}} blocks FIRST (before each loops)
  // This needs to handle the case where the condition is an array
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (match, key, ifContent, elseContent) => {
      const value = vars[key];
      // Arrays are truthy, but empty arrays should be falsy for this check
      const isTruthy = Array.isArray(value) ? value.length > 0 : !!value;
      return isTruthy ? ifContent : elseContent || "";
    },
  );

  // Handle {{#each array}}...{{/each}} blocks (after if blocks)
  result = result.replace(
    /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (match, arrayKey, content) => {
      const array = vars[arrayKey];
      if (!Array.isArray(array) || array.length === 0) {
        return "";
      }
      return array
        .map((item, index) => {
          // Replace {{@index}} with the index
          let itemContent = content.replace(/\{\{@index\}\}/g, String(index));
          // Replace {{property}} with item.property
          itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (m, prop) => {
            return item[prop] !== undefined ? String(item[prop]) : m;
          });
          return itemContent;
        })
        .join("");
    },
  );

  // Simple template rendering: {{var}} - replace variables
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? String(vars[key]) : match;
  });

  return result;
}
