#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const SRC_DIR = path.join(__dirname, '../src');
const LOCALE_FILE = path.join(__dirname, '../src/locales/en.json');

// Regex to match t() calls with string literals
// Matches: t('key'), t("key"), t(`key`), t('key', {...})
const T_FUNCTION_REGEX = /t\s*\(\s*['"`]([^'"`]+)['"`]/g;

/**
 * Recursively get all TypeScript/TSX files in a directory
 */
function getAllTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file); // nosemgrep
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and build directories
      if (file !== 'node_modules' && file !== 'build' && file !== 'coverage') {
        getAllTsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Extract all translation keys from a file
 */
function extractTranslationKeys(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  let match;

  // Find all t() function calls
  while ((match = T_FUNCTION_REGEX.exec(content)) !== null) {
    const key = match[1];
    keys.add(key);
  }

  return Array.from(keys);
}

/**
 * Check if a nested key exists in the locale object
 * Handles keys like "debug.panel.title" by checking debug.panel.title
 */
function keyExistsInLocale(locale, key) {
  const parts = key.split('.');
  let current = locale;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]; // nosemgrep
    } else {
      return false;
    }
  }

  return true;
}

/**
 * Get the namespace (first part) of a translation key
 */
function getNamespace(key) {
  const parts = key.split('.');
  return parts[0] || 'root';
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Scanning for missing translation keys...\n');

  // Load locale file
  if (!fs.existsSync(LOCALE_FILE)) {
    console.error(`❌ Error: Locale file not found at ${LOCALE_FILE}`);
    process.exit(1);
  }

  let locale;
  try {
    const localeContent = fs.readFileSync(LOCALE_FILE, 'utf8');
    locale = JSON.parse(localeContent);
  } catch (error) {
    console.error(`❌ Error: Failed to parse locale file: ${error.message}`);
    process.exit(1);
  }

  // Get all TypeScript files
  const files = getAllTsFiles(SRC_DIR);
  console.log(`📁 Found ${files.length} TypeScript/TSX files\n`);

  // Extract all translation keys with their file locations
  const keyUsage = new Map(); // key -> Set of file paths

  files.forEach(filePath => {
    const keys = extractTranslationKeys(filePath);
    keys.forEach(key => {
      if (!keyUsage.has(key)) {
        keyUsage.set(key, new Set());
      }
      keyUsage.get(key).add(filePath);
    });
  });

  console.log(`🔑 Found ${keyUsage.size} unique translation keys in code\n`);

  // Check which keys are missing
  const missingKeys = [];
  keyUsage.forEach((filePaths, key) => {
    if (!keyExistsInLocale(locale, key)) {
      missingKeys.push({
        key,
        files: Array.from(filePaths),
      });
    }
  });

  // Report results
  if (missingKeys.length === 0) {
    console.log('✅ All translation keys are present in the locale file!\n');
    process.exit(0);
  }

  console.log(`❌ Found ${missingKeys.length} missing translation key(s):\n`);

  // Group by namespace
  const groupedByNamespace = {};
  missingKeys.forEach(({ key, files }) => {
    const namespace = getNamespace(key);
    if (!groupedByNamespace[namespace]) {
      groupedByNamespace[namespace] = [];
    }
    groupedByNamespace[namespace].push({ key, files });
  });

  // Print grouped results
  Object.keys(groupedByNamespace)
    .sort()
    .forEach(namespace => {
      console.log(`\n📦 Namespace: ${namespace}`);
      console.log('─'.repeat(50));
      groupedByNamespace[namespace].forEach(({ key, files }) => {
        console.log(`\n  Missing key: ${key}`);
        console.log(`  Used in:`);
        files.forEach(file => {
          const relativePath = path.relative(process.cwd(), file);
          console.log(`    - ${relativePath}`);
        });
      });
    });

  console.log(`\n\n❌ Total missing keys: ${missingKeys.length}`);
  console.log('💡 Add these keys to your locale file to fix the missing translations.\n');
  process.exit(1);
}

// Run the script
main();
