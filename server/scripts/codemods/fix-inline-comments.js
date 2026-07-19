/**
 * Codemod to fix inline comments by moving them to separate lines
 *
 * Transforms: code // comment
 * Into:      code
 *            // comment
 *
 * Usage: npx jscodeshift -t scripts/codemods/fix-inline-comments.js src/
 *
 * Note: This uses a regex-based approach since jscodeshift doesn't handle
 * trailing comments well. We parse the source and transform inline comments.
 */

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const source = file.source;

  // Pattern to match inline comments
  // Matches: code // comment (but not // at start of line, and not in strings)
  // We need to be careful about:
  // - Strings containing "//"
  // - Regex patterns
  // - URLs in strings
  // - Comments that are already on their own line

  let transformed = source;
  const lines = source.split("\n");
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip lines that are already just comments
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      newLines.push(line);
      continue;
    }

    // Find inline comments (// that appears after code)
    // Pattern: non-whitespace, whitespace, //, comment text
    const inlineCommentMatch = line.match(/^(.+?)(\s+)(\/\/.+)$/);

    if (inlineCommentMatch) {
      const [, code, whitespace, comment] = inlineCommentMatch;

      // Check if the code part contains a string that might have "//"
      // Simple heuristic: if code has unmatched quotes, be cautious
      const singleQuotes = (code.match(/'/g) || []).length;
      const doubleQuotes = (code.match(/"/g) || []).length;
      const backticks = (code.match(/`/g) || []).length;

      // If quotes are balanced (even number), it's likely safe
      // If unbalanced, the // might be inside a string
      const hasUnbalancedQuotes =
        singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0;

      // Also check for regex patterns (code ending with /)
      const mightBeRegex = code.trim().endsWith("/") && !code.includes("//");

      if (!hasUnbalancedQuotes && !mightBeRegex) {
        // Safe to split: move comment to next line
        const indent = line.match(/^(\s*)/)[1];
        newLines.push(code.trimEnd());
        newLines.push(indent + comment.trim());
        continue;
      }
    }

    // No transformation needed
    newLines.push(line);
  }

  // Only return transformed code if it changed
  const newSource = newLines.join("\n");
  if (newSource !== source) {
    return newSource;
  }

  return source;
};
