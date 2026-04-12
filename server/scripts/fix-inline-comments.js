#!/usr/bin/env node

/**
 * Script to fix inline comments by moving them to separate lines
 *
 * Transforms: code // comment
 * Into:      code
 *            // comment
 *
 * Usage: node scripts/fix-inline-comments.js [file1.ts] [file2.ts] ...
 *        or: find src -name "*.ts" -exec node scripts/fix-inline-comments.js {} +
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function fixInlineComments(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const newLines = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip lines that are already just comments or empty
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed === ""
    ) {
      newLines.push(line);
      continue;
    }

    // Find inline comments: code followed by whitespace and //
    // Pattern: non-comment code, whitespace, //, comment text
    // We need to avoid matching:
    // - URLs in strings (http://)
    // - Regex patterns ending with /
    // - Comments inside strings

    // Check if line has an inline comment
    // Look for // that's not at the start and not part of a URL or string
    const inlineCommentMatch = line.match(/^(.+?)(\s+)(\/\/.+)$/);

    if (inlineCommentMatch) {
      const [, code, whitespace, comment] = inlineCommentMatch;

      // Check if code might contain strings with "//"
      // Count quotes to see if we're inside a string
      const singleQuotes = (code.match(/'/g) || []).length;
      const doubleQuotes = (code.match(/"/g) || []).length;
      const backticks = (code.match(/`/g) || []).length;

      // If quotes are balanced, we're likely safe
      // If unbalanced, the // might be inside a string
      const hasUnbalancedQuotes =
        singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0;

      // Check for regex pattern (code ending with /)
      const mightBeRegex = code.trim().endsWith("/") && !code.includes("//");

      // Check for URLs (http://, https://)
      const hasUrl = code.includes("http://") || code.includes("https://");

      if (!hasUnbalancedQuotes && !mightBeRegex && !hasUrl) {
        // Safe to split: move comment to next line
        const indent = line.match(/^(\s*)/)[1];
        newLines.push(code.trimEnd());
        newLines.push(indent + comment.trim());
        changed = true;
        continue;
      }
    }

    // No transformation needed
    newLines.push(line);
  }

  if (changed) {
    fs.writeFileSync(filePath, newLines.join("\n"), "utf8");
    return true;
  }

  return false;
}

// Main execution
const files = process.argv.slice(2);

if (files.length === 0) {
  console.error(
    "Usage: node scripts/fix-inline-comments.js <file1> [file2] ...",
  );
  console.error(
    '   or: find src -name "*.ts" -exec node scripts/fix-inline-comments.js {} +',
  );
  process.exit(1);
}

let fixedCount = 0;
for (const file of files) {
  try {
    if (fixInlineComments(file)) {
      console.log(`Fixed: ${file}`);
      fixedCount++;
    }
  } catch (error) {
    console.error(`Error processing ${file}: ${error.message}`);
  }
}

console.log(`\nFixed ${fixedCount} file(s)`);
