#!/usr/bin/env node

/**
 * Translation Key Checker
 *
 * This script validates translation files to ensure:
 * 1. Both English and Spanish JSON files are valid
 * 2. Translation keys used in code (t('...')) exist in translation files
 * 3. New translations added to English are also added to Spanish (configurable)
 *
 * Usage: npm run check-translations
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnvFiles() {
  const root = path.join(__dirname, '..');
  loadEnvFile(path.join(root, '.env'));
  loadEnvFile(path.join(root, '.env.local'));
}

loadEnvFiles();

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');
const EN_TRANSLATION_PATH = path.join(LOCALES_DIR, 'en.json');
const ES_TRANSLATION_PATH = path.join(LOCALES_DIR, 'es.json');
const SOURCE_DIR = path.join(__dirname, '..', 'src');

const ALLOW_MISSING_TRANSLATIONS = process.env.ALLOW_MISSING_TRANSLATIONS === 'true';

function validateJsonFile(filePath, name) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    JSON.parse(content);
    console.log(`  [OK] ${name} is valid JSON`);
    return true;
  } catch (error) {
    console.error(`  [ERROR] ${name} has invalid JSON: ${error.message}`);
    return false;
  }
}

function getAllTranslationKeys(obj, prefix = '') {
  const keys = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys.push(...getAllTranslationKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function listLocaleTranslationFiles() {
  const localeFiles = [];
  const supportedLocales = ['en', 'es'];

  for (const locale of supportedLocales) {
    const translationPath = path.join(LOCALES_DIR, `${locale}.json`);
    if (fs.existsSync(translationPath)) {
      localeFiles.push({ locale, translationPath });
    }
  }
  return localeFiles;
}

function walkFiles(dir, extensions, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name); // nosemgrep
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'coverage'
      ) {
        continue;
      }
      walkFiles(fullPath, extensions, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function buildNewlineIndex(text) {
  const newlines = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      newlines.push(i);
    }
  }
  return newlines;
}

function getLineNumberFromIndex(newlineIndex, index) {
  let low = 0;
  let high = newlineIndex.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (newlineIndex[mid] < index) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low + 1;
}

function scanForTranslationCalls(sourceRoot) {
  const files = walkFiles(sourceRoot, new Set(['.ts', '.tsx', '.js', '.jsx']));
  const results = {
    usages: [],
    dynamicUsages: [],
  };

  const literalCallRegex = /\bt\s*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  const anyTCallRegex = /\bt\s*\(\s*/g;

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      continue;
    }

    const newlineIndex = buildNewlineIndex(content);

    let match;
    const literalRanges = [];
    while ((match = literalCallRegex.exec(content)) !== null) {
      const quote = match[1];
      const keyRaw = match[2];
      const startIndex = match.index;
      const endIndex = literalCallRegex.lastIndex;
      literalRanges.push([startIndex, endIndex]);

      if (quote === '`' && /\$\{/.test(keyRaw)) {
        results.dynamicUsages.push({
          filePath,
          line: getLineNumberFromIndex(newlineIndex, startIndex),
          expression: 't(`...`) with interpolation',
        });
        continue;
      }

      const key = keyRaw.replace(/\\n/g, '\n').trim();
      if (!key) {
        continue;
      }
      if (!/^[a-z0-9_.:-]+$/i.test(key)) {
        results.dynamicUsages.push({
          filePath,
          line: getLineNumberFromIndex(newlineIndex, startIndex),
          expression: `t(${quote}${key}${quote}) non-translation literal`,
        });
        continue;
      }
      results.usages.push({
        filePath,
        line: getLineNumberFromIndex(newlineIndex, startIndex),
        key,
      });
    }

    while ((match = anyTCallRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const inLiteralRange = literalRanges.some(([a, b]) => startIndex >= a && startIndex < b);
      if (inLiteralRange) {
        continue;
      }

      const after = content.slice(anyTCallRegex.lastIndex, anyTCallRegex.lastIndex + 10);
      const firstNonWs = after.match(/\S/);
      if (!firstNonWs) {
        continue;
      }
      const ch = firstNonWs[0];
      if (ch === "'" || ch === '"' || ch === '`') {
        continue;
      }

      results.dynamicUsages.push({
        filePath,
        line: getLineNumberFromIndex(newlineIndex, startIndex),
        expression: 't(dynamic)',
      });
    }
  }

  return results;
}

function hasTranslationKey(keySet, key) {
  if (keySet.has(key)) {
    return true;
  }
  const pluralSuffixes = ['_zero', '_one', '_two', '_few', '_many', '_other', '_plural'];
  for (const suffix of pluralSuffixes) {
    if (keySet.has(`${key}${suffix}`)) {
      return true;
    }
  }
  return false;
}

function main() {
  console.log('=== Translation Validation ===\n');

  console.log('Validating JSON syntax...');
  const enValid = validateJsonFile(EN_TRANSLATION_PATH, 'English (en.json)');
  const esValid = validateJsonFile(ES_TRANSLATION_PATH, 'Spanish (es.json)');

  if (!enValid || !esValid) {
    console.error('\nTranslation validation failed: Invalid JSON syntax');
    process.exit(1);
  }

  console.log('\nChecking for issues...');

  const localeFiles = listLocaleTranslationFiles();
  const translationsByLocale = {};
  for (const { locale, translationPath } of localeFiles) {
    translationsByLocale[locale] = JSON.parse(fs.readFileSync(translationPath, 'utf-8'));
  }

  const enTranslations = translationsByLocale['en'];
  if (!enTranslations) {
    console.error('\nTranslation validation failed: Missing en.json');
    process.exit(1);
  }

  const localeKeySets = {};
  for (const locale of Object.keys(translationsByLocale)) {
    localeKeySets[locale] = new Set(getAllTranslationKeys(translationsByLocale[locale]));
  }

  const enKeys = localeKeySets['en'];
  const esKeys = localeKeySets['es'] || new Set();

  console.log(`  English keys: ${enKeys.size}`);
  console.log(`  Spanish keys: ${esKeys.size}`);

  const missingInEs = [...enKeys].filter(key => !esKeys.has(key));

  if (missingInEs.length > 0) {
    if (ALLOW_MISSING_TRANSLATIONS) {
      console.log(`\n  [INFO] ${missingInEs.length} keys in English are not yet translated to Spanish.`);
      console.log('  This is expected - Spanish translations can be added later.');
    } else {
      console.error(`\n  [ERROR] ${missingInEs.length} keys in English are missing in Spanish translations.`);
      for (const key of missingInEs.slice(0, 50)) {
        console.error(`    - ${key}`);
      }
      if (missingInEs.length > 50) {
        console.error(`    ...and ${missingInEs.length - 50} more`);
      }
    }
  }

  console.log('\nScanning codebase for t(...) usage...');
  const scan = scanForTranslationCalls(SOURCE_DIR);
  console.log(`  t(...) usages found: ${scan.usages.length}`);
  if (scan.dynamicUsages.length > 0) {
    console.log(`  [INFO] Dynamic t(...) usages: ${scan.dynamicUsages.length} (not validated)`);
  }

  const missingInEnFromCode = [];
  const missingInOtherLocales = {};
  for (const usage of scan.usages) {
    const key = usage.key;
    if (!hasTranslationKey(enKeys, key)) {
      missingInEnFromCode.push(usage);
      continue;
    }

    for (const locale of Object.keys(localeKeySets)) {
      const localeKeys = localeKeySets[locale];
      if (!hasTranslationKey(localeKeys, key)) {
        if (!missingInOtherLocales[locale]) {
          missingInOtherLocales[locale] = [];
        }
        missingInOtherLocales[locale].push(usage);
      }
    }
  }

  if (missingInEnFromCode.length > 0) {
    console.error(`\n  [ERROR] ${missingInEnFromCode.length} t(...) keys are missing in English translations:`);
    for (const item of missingInEnFromCode.slice(0, 50)) {
      const rel = path.relative(path.join(__dirname, '..'), item.filePath).split(path.sep).join('/');
      console.error(`    - ${rel}:${item.line} -> ${item.key}`);
    }
    if (missingInEnFromCode.length > 50) {
      console.error(`    ...and ${missingInEnFromCode.length - 50} more`);
    }
    process.exit(1);
  }

  let hasMissingInOtherLocales = false;
  for (const locale of Object.keys(missingInOtherLocales)) {
    if (locale === 'en') {
      continue;
    }
    hasMissingInOtherLocales = true;
    if (ALLOW_MISSING_TRANSLATIONS) {
      console.log(
        `\n  [INFO] ${missingInOtherLocales[locale].length} t(...) keys exist in English but are missing in ${locale}.`
      );
    } else {
      console.error(
        `\n  [ERROR] ${missingInOtherLocales[locale].length} t(...) keys exist in English but are missing in ${locale}.`
      );
      for (const item of missingInOtherLocales[locale].slice(0, 50)) {
        const rel = path.relative(path.join(__dirname, '..'), item.filePath).split(path.sep).join('/');
        console.error(`    - ${rel}:${item.line} -> ${item.key}`);
      }
      if (missingInOtherLocales[locale].length > 50) {
        console.error(`    ...and ${missingInOtherLocales[locale].length - 50} more`);
      }
    }
  }

  if (!ALLOW_MISSING_TRANSLATIONS && (missingInEs.length > 0 || hasMissingInOtherLocales)) {
    console.error('\nTranslation validation failed: Missing keys in one or more locales');
    process.exit(1);
  }

  console.log('\nTranslation validation passed!');
  process.exit(0);
}

main();
