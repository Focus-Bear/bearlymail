#!/usr/bin/env node

/**
 * Script to replace all console.error and console.warn calls with logError and logWarn
 * from the utils/logger module.
 */

const fs = require("fs");
const path = require("path");

const filesToProcess = [
  "src/emails/gmail.service.ts",
  "src/replies/replies.service.ts",
  "src/summarization/summarization.service.ts",
  "src/calendar/calendar.service.ts",
  "src/contacts/contacts.service.ts",
  "src/contacts/providers/gmail-contacts.provider.ts",
  "src/context/context-batch-analysis.processor.ts",
  "src/auth/auth.controller.ts",
  "src/auth/auth-logger.ts",
  "src/context/context-analysis-logger.ts",
  "src/auto-responder/autoresponder-logger.ts",
  "src/scripts/bulk-recalculate-priority.ts",
  "src/scripts/fix-migration-state.ts",
  "src/scripts/fix-stuck-calculating.ts",
  "src/scripts/load-test-jobs.ts",
  "src/scripts/reset-stuck-jobs.ts",
];

function getRelativeImportPath(filePath) {
  const depth = filePath.split("/").length - 2; // -2 for src/ and filename
  return "../".repeat(depth) + "utils/logger";
}

function processFile(filePath) {
  const fullPath = path.join(__dirname, filePath); // nosemgrep

  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  Skipping ${filePath} (not found)`);
    return 0;
  }

  let content = fs.readFileSync(fullPath, "utf8");
  const originalContent = content;

  // Count occurrences before replacement
  const errorCount = (content.match(/console\.error/g) || []).length;
  const warnCount = (content.match(/console\.warn/g) || []).length;

  if (errorCount === 0 && warnCount === 0) {
    console.log(`⏭️  Skipping ${filePath} (no console.error/warn found)`);
    return 0;
  }

  // Add import if not already present
  const importPath = getRelativeImportPath(filePath);
  const importStatement = `import { logError, logWarn } from "${importPath}";`;

  if (
    !content.includes('from "../utils/logger"') &&
    !content.includes("from '../utils/logger'")
  ) {
    // Find the last import statement
    const lines = content.split("\n");
    let lastImportIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^import .* from /)) {
        lastImportIndex = i;
      }
    }

    if (lastImportIndex >= 0) {
      lines.splice(lastImportIndex + 1, 0, importStatement);
      content = lines.join("\n");
    }
  }

  // Replace console.error calls
  // Pattern 1: console.error(message, error)
  content = content.replace(
    /console\.error\(([^,]+),\s*([^)]+)\)/g,
    (match, message, error) => {
      return `logError(${message}, ${error} instanceof Error ? ${error} : new Error(String(${error})))`;
    },
  );

  // Pattern 2: console.error(message) - single argument
  content = content.replace(/console\.error\(([^)]+)\)/g, (match, message) => {
    // Skip if already replaced (contains logError)
    if (match.includes("logError")) return match;
    return `logError(${message})`;
  });

  // Replace console.warn calls
  // Pattern 1: console.warn(message, data)
  content = content.replace(
    /console\.warn\(([^,]+),\s*([^)]+)\)/g,
    (match, message, data) => {
      return `logWarn(${message}, ${data})`;
    },
  );

  // Pattern 2: console.warn(message) - single argument
  content = content.replace(/console\.warn\(([^)]+)\)/g, (match, message) => {
    // Skip if already replaced (contains logWarn)
    if (match.includes("logWarn")) return match;
    return `logWarn(${message})`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, "utf8");
    console.log(
      `✅ Processed ${filePath} (${errorCount} errors, ${warnCount} warnings)`,
    );
    return errorCount + warnCount;
  }

  return 0;
}

let totalReplaced = 0;

console.log(
  "🔄 Replacing console.error and console.warn with logError and logWarn...\n",
);

for (const file of filesToProcess) {
  totalReplaced += processFile(file);
}

console.log(
  `\n✅ Complete! Replaced ${totalReplaced} instances across ${filesToProcess.length} files.`,
);
