#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const LOCALES_DIR = path.join(__dirname, '../src/locales');
const SUPPORTED_LOCALES = ['en', 'es'];

/**
 * Recursively get all keys from a nested object
 */
function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Check if JSON is valid
 */
function validateJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);
    return { valid: true, json, error: null };
  } catch (error) {
    return { valid: false, json: null, error: error.message };
  }
}

/**
 * Check for duplicate keys at the same level in the JSON structure
 */
function checkDuplicateKeys(obj, path = '', duplicates = []) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return duplicates;
  }

  const keys = Object.keys(obj);
  const seenKeys = new Set();

  keys.forEach(key => {
    if (seenKeys.has(key)) {
      duplicates.push({
        key: path ? `${path}.${key}` : key,
        duplicateKey: key,
      });
    } else {
      seenKeys.add(key);
    }

    // Recursively check nested objects
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      checkDuplicateKeys(obj[key], path ? `${path}.${key}` : key, duplicates);
    }
  });

  return duplicates;
}

/**
 * Compare locale files to find missing keys
 */
function compareLocales(baseLocale, otherLocale) {
  const baseKeys = new Set(getAllKeys(baseLocale));
  const otherKeys = new Set(getAllKeys(otherLocale));

  const missingInOther = Array.from(baseKeys).filter(key => !otherKeys.has(key));
  const extraInOther = Array.from(otherKeys).filter(key => !baseKeys.has(key));

  return { missingInOther, extraInOther };
}

/**
 * Main validation function
 */
function main() {
  console.log('🔍 Validating locale files...\n');

  let hasErrors = false;
  const locales = {};

  // Validate each locale file
  for (const locale of SUPPORTED_LOCALES) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Error: Locale file not found: ${filePath}`);
      hasErrors = true;
      continue;
    }

    console.log(`📄 Checking ${locale}.json...`);

    // Validate JSON syntax
    const { valid, json, error } = validateJSON(filePath);
    if (!valid) {
      console.error(`   ❌ Invalid JSON: ${error}`);
      hasErrors = true;
      continue;
    }
    console.log(`   ✅ Valid JSON syntax`);

    // Check for duplicate keys at the same level
    const duplicates = checkDuplicateKeys(json);
    if (duplicates.length > 0) {
      console.error(`   ❌ Found ${duplicates.length} duplicate key(s) at the same level:`);
      duplicates.forEach(({ key }) => {
        console.error(`      - "${key}"`);
      });
      hasErrors = true;
    } else {
      console.log(`   ✅ No duplicate keys at the same level`);
    }

    // Count keys
    const keys = getAllKeys(json);
    console.log(`   ✅ Found ${keys.length} translation keys`);

    locales[locale] = json;
    console.log('');
  }

  // Compare locales if we have at least the base locale
  if (locales.en && locales.es) {
    console.log('📊 Comparing locales...');
    const { missingInOther, extraInOther } = compareLocales(locales.en, locales.es);

    if (missingInOther.length > 0) {
      console.log(`\n   ⚠️  ${missingInOther.length} key(s) in en.json missing from es.json:`);
      missingInOther.slice(0, 20).forEach(key => {
        console.log(`      - ${key}`);
      });
      if (missingInOther.length > 20) {
        console.log(`      ... and ${missingInOther.length - 20} more`);
      }
    }

    if (extraInOther.length > 0) {
      console.log(`\n   ⚠️  ${extraInOther.length} key(s) in es.json not in en.json:`);
      extraInOther.slice(0, 20).forEach(key => {
        console.log(`      - ${key}`);
      });
      if (extraInOther.length > 20) {
        console.log(`      ... and ${extraInOther.length - 20} more`);
      }
    }

    if (missingInOther.length === 0 && extraInOther.length === 0) {
      console.log('   ✅ All locales have matching keys');
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(50)}`);
  if (hasErrors) {
    console.log('❌ Validation failed. Please fix the errors above.');
    process.exit(1);
  } else {
    console.log('✅ All locale files are valid!');
    process.exit(0);
  }
}

// Run the script
main();
