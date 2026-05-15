#!/usr/bin/env node

/**
 * ESLint Issue Analyzer
 *
 * Analyzes ESLint output for a single file and provides actionable next steps.
 *
 * Usage:
 *   node scripts/analyze-eslint-issues.js path/to/file.ts
 *   OR
 *   npx eslint path/to/file.ts | node scripts/analyze-eslint-issues.js
 *   OR
 *   npx eslint path/to/file.ts --format json | node scripts/analyze-eslint-issues.js
 */

const readline = require("readline");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Issue categories and their priorities
const ISSUE_CATEGORIES = {
  errors: {
    priority: "CRITICAL",
    description: "Must fix - prevents compilation/runtime",
    fixable: true,
  },
  "no-explicit-any": {
    priority: "HIGH",
    description: "Type safety - replace `any` with proper types",
    fixable: true,
    count: 0,
  },
  "no-inline-comments": {
    priority: "HIGH",
    description: "Code style - move comments to separate lines",
    fixable: true,
    count: 0,
  },
  "id-length": {
    priority: "MEDIUM",
    description: "Variable naming - rename short variables (u, q, s, m)",
    fixable: true,
    count: 0,
  },
  "no-nested-ternary": {
    priority: "MEDIUM",
    description: "Code clarity - refactor nested ternary operators",
    fixable: true,
    count: 0,
  },
  "max-statements": {
    priority: "MEDIUM",
    description: "Code complexity - function has too many statements",
    fixable: false,
    count: 0,
  },
  "max-lines-per-function": {
    priority: "MEDIUM",
    description: "Code complexity - function is too long",
    fixable: false,
    count: 0,
  },
  complexity: {
    priority: "MEDIUM",
    description: "Code complexity - function is too complex",
    fixable: false,
    count: 0,
  },
  "max-params": {
    priority: "LOW",
    description: "Code design - function has too many parameters",
    fixable: false,
    count: 0,
  },
  "id-denylist": {
    priority: "LOW",
    description: "Variable naming - restricted identifier used",
    fixable: true,
    count: 0,
  },
  "max-lines": {
    priority: "LOW",
    description: "File size - file is too long",
    fixable: false,
    count: 0,
  },
};

function parseESLintOutput(lines) {
  const issues = [];
  let currentFile = null;
  let inErrorSection = false;

  for (const line of lines) {
    // Check if it's a file path
    if (line.startsWith("/") || line.startsWith("src/")) {
      currentFile = line.trim();
      continue;
    }

    // Check if it's an error or warning line
    const match = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+)$/);
    if (match) {
      const [, lineNum, colNum, severity, message] = match;
      const ruleMatch = message.match(/([a-z-]+(?:\/[a-z-]+)?)\s*$/);
      const ruleId = ruleMatch ? ruleMatch[1] : "unknown";

      issues.push({
        file: currentFile,
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
        severity,
        message: message.trim(),
        ruleId,
      });
    }

    // Check for summary line
    if (line.includes("problems") || line.includes("✖")) {
      inErrorSection = true;
    }
  }

  return issues;
}

function parseJSONOutput(jsonText) {
  try {
    // Try to extract JSON from the text (might have other output mixed in)
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return null;
    }

    const data = JSON.parse(jsonMatch[0]);
    const issues = [];

    for (const fileData of data) {
      for (const message of fileData.messages || []) {
        issues.push({
          file: fileData.filePath,
          line: message.line,
          column: message.column,
          severity: message.severity === 2 ? "error" : "warning",
          message: message.message,
          ruleId: message.ruleId || "unknown",
        });
      }
    }

    return issues.length > 0 ? issues : null;
  } catch (e) {
    return null;
  }
}

function categorizeIssues(issues) {
  const categorized = {
    errors: [],
    warnings: {},
    byRule: {},
    byFile: {},
  };

  for (const issue of issues) {
    // Track by severity
    if (issue.severity === "error") {
      categorized.errors.push(issue);
    } else {
      if (!categorized.warnings[issue.ruleId]) {
        categorized.warnings[issue.ruleId] = [];
      }
      categorized.warnings[issue.ruleId].push(issue);
    }

    // Track by rule
    if (!categorized.byRule[issue.ruleId]) {
      categorized.byRule[issue.ruleId] = [];
    }
    categorized.byRule[issue.ruleId].push(issue);

    // Track by file
    if (!categorized.byFile[issue.file]) {
      categorized.byFile[issue.file] = [];
    }
    categorized.byFile[issue.file].push(issue);
  }

  return categorized;
}

function generateSuggestions(categorized) {
  const suggestions = [];

  // Errors first
  if (categorized.errors.length > 0) {
    suggestions.push({
      priority: "CRITICAL",
      title: `Fix ${categorized.errors.length} error(s)`,
      description:
        "These must be fixed before the code can compile/run properly.",
      issues: categorized.errors,
      action: "Fix unused variables, syntax errors, or type errors",
    });
  }

  // High priority warnings
  const highPriorityRules = ["no-explicit-any", "no-inline-comments"];
  for (const ruleId of highPriorityRules) {
    const issues = categorized.byRule[ruleId] || [];
    if (issues.length > 0) {
      const category = ISSUE_CATEGORIES[ruleId] || {};
      suggestions.push({
        priority: category.priority || "HIGH",
        title: `Fix ${issues.length} ${ruleId} issue(s)`,
        description: category.description || ruleId,
        issues: issues.slice(0, 5), // Show first 5
        action: category.fixable
          ? `Use automated fixes or manual refactoring`
          : `Requires manual refactoring`,
        total: issues.length,
      });
    }
  }

  // Medium priority warnings
  const mediumPriorityRules = [
    "id-length",
    "no-nested-ternary",
    "max-statements",
    "max-lines-per-function",
    "complexity",
  ];
  for (const ruleId of mediumPriorityRules) {
    const issues = categorized.byRule[ruleId] || [];
    if (issues.length > 0) {
      const category = ISSUE_CATEGORIES[ruleId] || {};
      suggestions.push({
        priority: category.priority || "MEDIUM",
        title: `Address ${issues.length} ${ruleId} issue(s)`,
        description: category.description || ruleId,
        issues: issues.slice(0, 3), // Show first 3
        action: category.fixable
          ? `Use automated fixes or manual refactoring`
          : `Requires code refactoring - consider breaking into smaller functions`,
        total: issues.length,
      });
    }
  }

  // Other warnings
  const otherRules = Object.keys(categorized.byRule).filter(
    (r) =>
      !highPriorityRules.includes(r) &&
      !mediumPriorityRules.includes(r) &&
      r !== "unknown",
  );
  if (otherRules.length > 0) {
    const otherIssues = otherRules.flatMap((r) => categorized.byRule[r] || []);
    suggestions.push({
      priority: "LOW",
      title: `Review ${otherIssues.length} other issue(s)`,
      description: `Rules: ${otherRules.join(", ")}`,
      issues: [],
      action: "Review and fix as needed",
      total: otherIssues.length,
    });
  }

  return suggestions;
}

function formatOutput(categorized, suggestions) {
  const output = [];

  // Summary
  const totalErrors = categorized.errors.length;
  const totalWarnings = Object.values(categorized.warnings).flat().length;
  const totalIssues = totalErrors + totalWarnings;

  output.push("📊 ESLint Analysis Results");
  output.push("=".repeat(50));
  output.push("");
  output.push(`Total Issues: ${totalIssues}`);
  output.push(`  • Errors: ${totalErrors}`);
  output.push(`  • Warnings: ${totalWarnings}`);
  output.push("");

  // Errors section
  if (totalErrors > 0) {
    output.push("🔴 ERRORS (Must Fix):");
    output.push("-".repeat(50));
    for (const error of categorized.errors) {
      output.push(
        `  ${error.file}:${error.line}:${error.column} - ${error.message}`,
      );
    }
    output.push("");
  }

  // Warnings by rule
  if (totalWarnings > 0) {
    output.push("⚠️  WARNINGS by Rule:");
    output.push("-".repeat(50));
    const rules = Object.keys(categorized.byRule).filter(
      (r) => r !== "unknown",
    );
    for (const ruleId of rules.sort()) {
      const issues = categorized.byRule[ruleId];
      if (issues && issues.length > 0 && issues[0].severity === "warning") {
        output.push(`  ${ruleId}: ${issues.length} issue(s)`);
      }
    }
    output.push("");
  }

  // Suggestions
  if (suggestions.length > 0) {
    output.push("💡 RECOMMENDED NEXT STEPS:");
    output.push("=".repeat(50));
    output.push("");

    for (const suggestion of suggestions) {
      const priorityEmoji =
        suggestion.priority === "CRITICAL"
          ? "🔴"
          : suggestion.priority === "HIGH"
            ? "⚠️"
            : suggestion.priority === "MEDIUM"
              ? "📊"
              : "ℹ️";

      output.push(
        `${priorityEmoji} ${suggestion.priority}: ${suggestion.title}`,
      );
      output.push(`   ${suggestion.description}`);
      output.push(`   Action: ${suggestion.action}`);

      if (suggestion.issues && suggestion.issues.length > 0) {
        output.push(`   Examples:`);
        for (const issue of suggestion.issues.slice(0, 3)) {
          output.push(
            `     - Line ${issue.line}:${issue.column} - ${issue.message}`,
          );
        }
        if (suggestion.total > suggestion.issues.length) {
          output.push(
            `     ... and ${suggestion.total - suggestion.issues.length} more`,
          );
        }
      }
      output.push("");
    }
  }

  return output.join("\n");
}

function runEslintOnFile(filePath) {
  try {
    // Resolve the file path relative to current working directory
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath); // nosemgrep

    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: File not found: ${resolvedPath}`);
      process.exit(1);
    }

    console.log(`Running ESLint on ${resolvedPath}...\n`);

    const output = execFileSync(
      "npx",
      ["eslint", resolvedPath, "--format", "json"],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      },
    );

    return JSON.parse(output);
  } catch (error) {
    // ESLint returns non-zero exit code when there are issues, but still outputs JSON
    try {
      const output = error.stdout || error.stderr || "";
      // Try to extract JSON from the output
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      // If no JSON found, try parsing the whole output
      if (output.trim().startsWith("[")) {
        return JSON.parse(output);
      }
      throw new Error(`Failed to parse ESLint output: ${error.message}`);
    } catch (parseError) {
      console.error(`Error running ESLint: ${error.message}`);
      if (error.stdout) {
        console.error("STDOUT:", error.stdout.substring(0, 500));
      }
      if (error.stderr) {
        console.error("STDERR:", error.stderr.substring(0, 500));
      }
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const filePath = process.argv[2];

  let issues = [];

  if (filePath) {
    // If a file path is provided, run ESLint on it
    if (filePath.endsWith(".json")) {
      // It's a JSON file - read it directly
      try {
        const rawData = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(rawData);
        for (const fileData of data) {
          for (const message of fileData.messages || []) {
            issues.push({
              file: fileData.filePath,
              line: message.line,
              column: message.column,
              severity: message.severity === 2 ? "error" : "warning",
              message: message.message,
              ruleId: message.ruleId || "unknown",
            });
          }
        }
      } catch (error) {
        console.error(`Error reading JSON file: ${error.message}`);
        process.exit(1);
      }
    } else {
      // It's a source file - run ESLint on it
      const eslintOutput = runEslintOnFile(filePath);
      for (const fileData of eslintOutput) {
        for (const message of fileData.messages || []) {
          issues.push({
            file: fileData.filePath,
            line: message.line,
            column: message.column,
            severity: message.severity === 2 ? "error" : "warning",
            message: message.message,
            ruleId: message.ruleId || "unknown",
          });
        }
      }
    }
  } else {
    // No file path - read from stdin
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    const lines = [];
    let jsonBuffer = "";

    for await (const line of rl) {
      lines.push(line);
      jsonBuffer += line + "\n";
    }

    // Try parsing as JSON first
    issues = parseJSONOutput(jsonBuffer.trim()) || [];

    // If JSON parsing failed, try text parsing
    if (issues.length === 0) {
      issues = parseESLintOutput(lines);
    }
  }

  if (issues.length === 0) {
    console.log("✅ No ESLint issues found!");
    process.exit(0);
  }

  const categorized = categorizeIssues(issues);
  const suggestions = generateSuggestions(categorized);
  const output = formatOutput(categorized, suggestions);

  console.log(output);
}

main().catch((error) => {
  console.error("Error analyzing ESLint output:", error);
  process.exit(1);
});
