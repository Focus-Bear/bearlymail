#!/usr/bin/env node

/**
 * Script to fix error handlers by replacing `catch (error: any)` with `catch (error: unknown)`
 *
 * Usage: node scripts/fix-error-handlers.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function fixErrorHandlers(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  let changed = false;
  let newContent = content;

  // Pattern 1: catch (error: any)
  const pattern1 = /catch\s*\(\s*error\s*:\s*any\s*\)/g;
  if (pattern1.test(newContent)) {
    newContent = newContent.replace(pattern1, "catch (error: unknown)");
    changed = true;
  }

  // Pattern 2: catch (err: any)
  const pattern2 = /catch\s*\(\s*err\s*:\s*any\s*\)/g;
  if (pattern2.test(newContent)) {
    newContent = newContent.replace(pattern2, "catch (err: unknown)");
    changed = true;
  }

  // Pattern 3: catch (e: any)
  const pattern3 = /catch\s*\(\s*e\s*:\s*any\s*\)/g;
  if (pattern3.test(newContent)) {
    newContent = newContent.replace(pattern3, "catch (e: unknown)");
    changed = true;
  }

  // Pattern 4: catch (refreshError: any), catch (threadError: any), etc.
  const pattern4 = /catch\s*\(\s*(\w+)\s*:\s*any\s*\)/g;
  if (pattern4.test(newContent)) {
    newContent = newContent.replace(pattern4, (match, varName) => {
      return `catch (${varName}: unknown)`;
    });
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, newContent, "utf8");
    return true;
  }

  return false;
}

// Get all TypeScript files
const command = 'find src -name "*.ts" -type f';
const files = execSync(command, { encoding: "utf8", cwd: process.cwd() })
  .trim()
  .split("\n")
  .filter((f) => f.trim());

let fixedCount = 0;
for (const file of files) {
  try {
    if (fixErrorHandlers(file)) {
      console.log(`Fixed: ${file}`);
      fixedCount++;
    }
  } catch (error) {
    console.error(`Error processing ${file}: ${error.message}`);
  }
}

console.log(`\nFixed ${fixedCount} file(s)`);
