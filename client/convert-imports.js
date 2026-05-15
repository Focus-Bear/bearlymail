#!/usr/bin/env node
/**
 * Script to convert relative imports to absolute imports from src/
 *
 * Usage:
 *   node convert-imports.js
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, 'src');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file); // nosemgrep
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function convertImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileDir = path.dirname(filePath);

  // Match import/export statements with relative paths (including multi-line)
  // This regex handles both single-line and multi-line imports
  const importRegex = /(import|export)([\s\S]*?from\s+)?['"](\.\.?\/[^'"]+)['"]/g;

  let newContent = content;
  let hasChanges = false;

  newContent = newContent.replace(importRegex, (match, keyword, middle, importPath) => {
    // Skip if it's a node_modules import or already absolute
    if (importPath.includes('node_modules') || (!importPath.startsWith('./') && !importPath.startsWith('../'))) {
      return match;
    }

    // Resolve the relative import
    const resolvedPath = path.resolve(fileDir, importPath);

    // Check if it's within src/
    if (!resolvedPath.startsWith(srcDir)) {
      return match;
    }

    // Calculate absolute import from src/
    let absoluteImport = path.relative(srcDir, resolvedPath);
    absoluteImport = absoluteImport.replace(/\\/g, '/');
    absoluteImport = absoluteImport.replace(/\.(ts|tsx)$/, '');

    // Only convert if it's a valid path
    if (!absoluteImport.startsWith('..')) {
      hasChanges = true;
      const quote = match.includes("'") ? "'" : '"';
      return `${keyword}${middle || ''}${quote}${absoluteImport}${quote}`;
    }

    return match;
  });

  if (hasChanges) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    return true;
  }

  return false;
}

// Get all TypeScript files
const files = getAllFiles(srcDir);
let changedCount = 0;

console.log(`Found ${files.length} TypeScript files to process...`);

files.forEach(file => {
  if (convertImports(file)) {
    changedCount++;
    console.log(`Converted: ${path.relative(srcDir, file)}`);
  }
});

console.log(`\nDone! Converted ${changedCount} files.`);
