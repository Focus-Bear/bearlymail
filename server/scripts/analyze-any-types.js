#!/usr/bin/env node

/**
 * Analyze and categorize all `any` type usages in the codebase
 *
 * Usage: node scripts/analyze-any-types.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function analyzeAnyTypes() {
  console.log("Analyzing any type usages...\n");

  // Run ESLint and get JSON output
  const command = 'npx eslint "{src,apps,libs,test}/**/*.ts" --format json';
  let output;
  try {
    output = execSync(command, {
      encoding: "utf8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    // ESLint returns non-zero when there are issues, but still outputs JSON
    output = error.stdout || error.stderr || "";
  }

  let eslintData;
  try {
    // Try to extract JSON from output
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      eslintData = JSON.parse(jsonMatch[0]);
    } else {
      eslintData = JSON.parse(output);
    }
  } catch (e) {
    console.error("Failed to parse ESLint output:", e.message);
    return;
  }

  const patterns = {
    errorHandlers: [],
    apiResponses: [],
    genericUtilities: [],
    typeAssertions: [],
    functionParameters: [],
    returnTypes: [],
    variableDeclarations: [],
    other: [],
  };

  const fileMap = {};

  // Parse ESLint JSON output
  for (const fileData of eslintData) {
    if (!fileData.messages) continue;

    for (const message of fileData.messages) {
      if (message.ruleId === "@typescript-eslint/no-explicit-any") {
        const filePath = fileData.filePath;
        if (!fileMap[filePath]) {
          fileMap[filePath] = [];
        }
        fileMap[filePath].push({
          line: message.line,
          column: message.column,
          message: message.message,
        });
      }
    }
  }

  // Read files and categorize
  for (const [filePath, occurrences] of Object.entries(fileMap)) {
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    for (const { line: lineNum } of occurrences) {
      const line = lines[lineNum - 1];
      if (!line) continue;

      const trimmed = line.trim();

      // Categorize based on context
      if (trimmed.includes("catch") && trimmed.includes("any")) {
        patterns.errorHandlers.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
        });
      } else if (
        trimmed.includes(": any") &&
        (trimmed.includes("response") ||
          trimmed.includes("data") ||
          trimmed.includes("result"))
      ) {
        patterns.apiResponses.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
        });
      } else if (trimmed.includes("as any") || trimmed.includes("<any>")) {
        patterns.typeAssertions.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
        });
      } else if (trimmed.match(/\(.*:\s*any/)) {
        patterns.functionParameters.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
        });
      } else if (trimmed.match(/:\s*any\s*[=;]/)) {
        patterns.variableDeclarations.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
        });
      } else if (trimmed.match(/:\s*any\s*\)/)) {
        patterns.returnTypes.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
        });
      } else {
        patterns.other.push({ file: filePath, line: lineNum, code: trimmed });
      }
    }
  }

  // Print analysis
  console.log("📊 Any Type Usage Analysis\n");
  console.log("=".repeat(60));
  console.log(
    `\nTotal occurrences: ${Object.values(patterns).reduce((sum, arr) => sum + arr.length, 0)}\n`,
  );

  console.log(
    `\n1. Error Handlers (catch blocks): ${patterns.errorHandlers.length}`,
  );
  if (patterns.errorHandlers.length > 0) {
    const files = [...new Set(patterns.errorHandlers.map((p) => p.file))];
    console.log(`   Files: ${files.length}`);
    console.log(`   Pattern: catch (error: any) → catch (error: unknown)`);
    if (patterns.errorHandlers.length <= 10) {
      patterns.errorHandlers.forEach((p) => {
        console.log(`   - ${p.file}:${p.line}`);
      });
    }
  }

  console.log(`\n2. API Responses: ${patterns.apiResponses.length}`);
  if (patterns.apiResponses.length > 0) {
    const files = [...new Set(patterns.apiResponses.map((p) => p.file))];
    console.log(`   Files: ${files.length}`);
    console.log(`   Pattern: response: any → response: ApiResponseType`);
  }

  console.log(`\n3. Type Assertions: ${patterns.typeAssertions.length}`);
  if (patterns.typeAssertions.length > 0) {
    const files = [...new Set(patterns.typeAssertions.map((p) => p.file))];
    console.log(`   Files: ${files.length}`);
  }

  console.log(
    `\n4. Function Parameters: ${patterns.functionParameters.length}`,
  );
  if (patterns.functionParameters.length > 0) {
    const files = [...new Set(patterns.functionParameters.map((p) => p.file))];
    console.log(`   Files: ${files.length}`);
  }

  console.log(
    `\n5. Variable Declarations: ${patterns.variableDeclarations.length}`,
  );
  if (patterns.variableDeclarations.length > 0) {
    const files = [
      ...new Set(patterns.variableDeclarations.map((p) => p.file)),
    ];
    console.log(`   Files: ${files.length}`);
  }

  console.log(`\n6. Return Types: ${patterns.returnTypes.length}`);
  if (patterns.returnTypes.length > 0) {
    const files = [...new Set(patterns.returnTypes.map((p) => p.file))];
    console.log(`   Files: ${files.length}`);
  }

  console.log(`\n7. Other: ${patterns.other.length}`);
  if (patterns.other.length > 0 && patterns.other.length <= 20) {
    patterns.other.slice(0, 10).forEach((p) => {
      console.log(`   - ${p.file}:${p.line} - ${p.code.substring(0, 60)}`);
    });
  }

  // Save detailed report
  const report = {
    summary: {
      total: Object.values(patterns).reduce((sum, arr) => sum + arr.length, 0),
      errorHandlers: patterns.errorHandlers.length,
      apiResponses: patterns.apiResponses.length,
      typeAssertions: patterns.typeAssertions.length,
      functionParameters: patterns.functionParameters.length,
      variableDeclarations: patterns.variableDeclarations.length,
      returnTypes: patterns.returnTypes.length,
      other: patterns.other.length,
    },
    patterns,
  };

  fs.writeFileSync(
    path.join(process.cwd(), "any-types-analysis.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  console.log(`\n\n📄 Detailed report saved to: any-types-analysis.json`);
  console.log(`\n💡 Recommended fixes:`);
  console.log(
    `   1. Replace error handlers: ${patterns.errorHandlers.length} occurrences`,
  );
  console.log(
    `   2. Create API response types: ${patterns.apiResponses.length} occurrences`,
  );
  console.log(
    `   3. Review type assertions: ${patterns.typeAssertions.length} occurrences`,
  );
}

analyzeAnyTypes();
