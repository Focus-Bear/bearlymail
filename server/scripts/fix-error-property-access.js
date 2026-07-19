#!/usr/bin/env node

/**
 * Script to fix error property access after changing error: any to error: unknown
 * Replaces direct property access with type-safe checks
 *
 * Usage: node scripts/fix-error-property-access.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function fixErrorPropertyAccess(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  let changed = false;
  let newContent = content;

  // Pattern: error.message (in catch blocks with unknown)
  // Replace with: error instanceof Error ? error.message : 'Unknown error'
  // But we need to be careful - only replace in catch blocks

  // Find catch blocks with unknown
  const catchBlockRegex = /catch\s*\([^)]*:\s*unknown[^)]*\)\s*\{([^}]*)\}/gs;

  newContent = newContent.replace(catchBlockRegex, (match, blockContent) => {
    let blockChanged = false;
    let newBlock = blockContent;

    // Replace error.message
    if (
      blockContent.includes("error.message") &&
      !blockContent.includes("error instanceof Error")
    ) {
      // Check if we need to create a variable
      const hasErrorVar = /const\s+\w+\s*=.*error\.message/.test(blockContent);
      if (!hasErrorVar) {
        // Replace first occurrence with variable declaration
        newBlock = newBlock.replace(
          /(\s*)([^=]*error\.message[^;]*)/,
          (m, indent, expr) => {
            blockChanged = true;
            // Extract variable name if it's an assignment
            const varMatch = expr.match(/(\w+)\s*=/);
            if (varMatch) {
              const varName = varMatch[1];
              return `${indent}const ${varName} = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : 'Unknown error';`;
            }
            // Otherwise replace inline
            return `${indent}const errorMessage = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : 'Unknown error';${indent}${expr.replace(/error\.message/g, "errorMessage")}`;
          },
        );
        // Replace remaining occurrences
        newBlock = newBlock.replace(/error\.message/g, "errorMessage");
      }
    }

    // Replace error.status
    if (
      blockContent.includes("error.status") &&
      !blockContent.includes("error instanceof Error")
    ) {
      newBlock = newBlock.replace(
        /(\s*)([^=]*error\.status[^;]*)/,
        (m, indent, expr) => {
          blockChanged = true;
          const varMatch = expr.match(/(\w+)\s*=/);
          if (varMatch) {
            const varName = varMatch[1];
            return `${indent}const ${varName} = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined;`;
          }
          return `${indent}const errorStatus = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined;${indent}${expr.replace(/error\.status/g, "errorStatus")}`;
        },
      );
      newBlock = newBlock.replace(/error\.status/g, "errorStatus");
    }

    // Replace error.code
    if (
      blockContent.includes("error.code") &&
      !blockContent.includes("error instanceof Error")
    ) {
      newBlock = newBlock.replace(
        /(\s*)([^=]*error\.code[^;]*)/,
        (m, indent, expr) => {
          blockChanged = true;
          const varMatch = expr.match(/(\w+)\s*=/);
          if (varMatch) {
            const varName = varMatch[1];
            return `${indent}const ${varName} = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string | number }).code : undefined;`;
          }
          return `${indent}const errorCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string | number }).code : undefined;${indent}${expr.replace(/error\.code/g, "errorCode")}`;
        },
      );
      newBlock = newBlock.replace(/error\.code/g, "errorCode");
    }

    if (blockChanged) {
      changed = true;
      return match.replace(blockContent, newBlock);
    }

    return match;
  });

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
    if (fixErrorPropertyAccess(file)) {
      console.log(`Fixed: ${file}`);
      fixedCount++;
    }
  } catch (error) {
    console.error(`Error processing ${file}: ${error.message}`);
  }
}

console.log(`\nFixed ${fixedCount} file(s)`);
