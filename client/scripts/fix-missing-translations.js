#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Configuration
const LOCALES_DIR = path.join(__dirname, '../src/locales');
const BASE_LOCALE = 'en';
const TARGET_LOCALES = ['es'];

// Language names for translation prompts
const LANGUAGE_NAMES = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
};

// Google Translate language codes
const GOOGLE_LANGUAGE_CODES = {
  es: 'es',
  fr: 'fr',
  de: 'de',
  pt: 'pt',
  it: 'it',
  ja: 'ja',
  zh: 'zh-CN',
  ko: 'ko',
};

/**
 * Get all keys from a nested object
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
 * Get value from nested object by dot-notation key
 */
function getValueByKey(obj, key) {
  const parts = key.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]; // nosemgrep
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Set value in nested object by dot-notation key
 */
function setValueByKey(obj, key, value) {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part]; // nosemgrep
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Translate text using Google Translate free API
 */
async function translateWithGoogle(text, targetLanguage) {
  const targetCode = GOOGLE_LANGUAGE_CODES[targetLanguage] || targetLanguage;

  // Preserve placeholders by replacing them temporarily
  const placeholders = [];
  const processedText = text.replace(/\{\{([^}]+)\}\}/g, match => {
    placeholders.push(match);
    return `__PLACEHOLDER_${placeholders.length - 1}__`;
  });

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetCode}&dt=t&q=${encodeURIComponent(processedText)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Google Translate error: ${response.status}`);
    }

    const data = await response.json();
    let translated = data[0].map(item => item[0]).join('');

    // Restore placeholders
    placeholders.forEach((placeholder, index) => {
      translated = translated.replace(new RegExp(`__PLACEHOLDER_${index}__`, 'gi'), placeholder); // nosemgrep
    });

    return translated;
  } catch (error) {
    console.error(`   Warning: Translation failed for "${text.substring(0, 30)}...": ${error.message}`);
    return text; // Return original on failure
  }
}

/**
 * Translate texts using Google Translate (batch with rate limiting)
 */
async function translateBatchWithGoogle(texts, targetLanguage) {
  const results = [];
  const batchSize = 20;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(texts.length / batchSize);

    console.log(`   Translating batch ${batchIndex}/${totalBatches} (${batch.length} texts)...`);

    // Translate each text in the batch with a small delay to avoid rate limiting
    for (const text of batch) {
      const translated = await translateWithGoogle(text, targetLanguage);
      results.push(translated);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Translate text using OpenAI API
 */
async function translateWithOpenAI(texts, targetLanguage, apiKey) {
  const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

  // Batch texts for efficiency (max 50 at a time)
  const batchSize = 50;
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(texts.length / batchSize);

    console.log(`   Translating batch ${batchIndex}/${totalBatches} (${batch.length} texts)...`);

    const prompt = `Translate the following JSON values from English to ${languageName}. 
Keep the same JSON structure and preserve any placeholders like {{variable}} or {{count}}.
Only translate the values, not the keys.
Return ONLY valid JSON, no explanations.

Input:
${JSON.stringify(batch, null, 2)}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5.4-mini',
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate UI text from English to ${languageName}. Preserve placeholders like {{variable}}, {{count}}, etc. Return only valid JSON array with translated strings in the same order as input.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const translatedText = data.choices[0].message.content.trim();

      // Parse the JSON response
      let translated;
      try {
        // Try to extract JSON from the response (in case there's extra text)
        const jsonMatch = translatedText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          translated = JSON.parse(jsonMatch[0]);
        } else {
          translated = JSON.parse(translatedText);
        }
      } catch (parseError) {
        console.error(`   Warning: Failed to parse translation response, using original texts`);
        translated = batch;
      }

      results.push(...translated);
    } catch (error) {
      console.error(`   Error translating batch: ${error.message}`);
      // Fall back to original texts for this batch
      results.push(...batch);
    }
  }

  return results;
}

/**
 * Find missing keys in target locale compared to base locale
 */
function findMissingKeys(baseLocale, targetLocale) {
  const baseKeys = new Set(getAllKeys(baseLocale));
  const targetKeys = new Set(getAllKeys(targetLocale));

  const missing = [];
  for (const key of baseKeys) {
    if (!targetKeys.has(key)) {
      missing.push({
        key,
        value: getValueByKey(baseLocale, key),
      });
    }
  }

  return missing;
}

/**
 * Sort object keys recursively to maintain consistent ordering
 */
function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }

  return sorted;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const useGoogle = args.includes('--google');
  const apiKey = process.env.OPENAI_API_KEY;

  console.log('🌍 Translation Fixer\n');

  if (!checkOnly && !apiKey && !useGoogle) {
    console.log('⚠️  No OPENAI_API_KEY found. Running in check-only mode.');
    console.log('   Options:');
    console.log('   - Set OPENAI_API_KEY environment variable for OpenAI translation');
    console.log('   - Use --google flag for free Google Translate\n');
  }

  // Load base locale
  const baseLocalePath = path.join(LOCALES_DIR, `${BASE_LOCALE}.json`);
  if (!fs.existsSync(baseLocalePath)) {
    console.error(`❌ Base locale file not found: ${baseLocalePath}`);
    process.exit(1);
  }

  let baseLocale;
  try {
    baseLocale = JSON.parse(fs.readFileSync(baseLocalePath, 'utf8'));
  } catch (error) {
    console.error(`❌ Failed to parse base locale: ${error.message}`);
    process.exit(1);
  }

  const baseKeyCount = getAllKeys(baseLocale).length;
  console.log(`📄 Base locale (${BASE_LOCALE}): ${baseKeyCount} keys\n`);

  let hasIssues = false;

  // Process each target locale
  for (const targetLocaleCode of TARGET_LOCALES) {
    const targetLocalePath = path.join(LOCALES_DIR, `${targetLocaleCode}.json`);

    console.log(`🔍 Checking ${targetLocaleCode}.json...`);

    if (!fs.existsSync(targetLocalePath)) {
      console.error(`   ❌ Target locale file not found: ${targetLocalePath}`);
      hasIssues = true;
      continue;
    }

    let targetLocale;
    try {
      targetLocale = JSON.parse(fs.readFileSync(targetLocalePath, 'utf8'));
    } catch (error) {
      console.error(`   ❌ Failed to parse target locale: ${error.message}`);
      hasIssues = true;
      continue;
    }

    const targetKeyCount = getAllKeys(targetLocale).length;
    console.log(`   Current keys: ${targetKeyCount}`);

    // Find missing keys
    const missingKeys = findMissingKeys(baseLocale, targetLocale);

    if (missingKeys.length === 0) {
      console.log(`   ✅ All keys present!\n`);
      continue;
    }

    console.log(`   ⚠️  Missing ${missingKeys.length} key(s)`);
    hasIssues = true;

    if (checkOnly || (!apiKey && !useGoogle)) {
      // Just report missing keys
      console.log(`\n   Missing keys:`);
      missingKeys.slice(0, 30).forEach(({ key, value }) => {
        const displayValue = typeof value === 'string' && value.length > 50 ? `${value.substring(0, 50)}...` : value;
        console.log(`      - ${key}: "${displayValue}"`);
      });
      if (missingKeys.length > 30) {
        console.log(`      ... and ${missingKeys.length - 30} more`);
      }
      console.log('');
      continue;
    }

    // Translate missing keys
    console.log(`\n   🔄 Translating ${missingKeys.length} missing key(s)...`);

    const textsToTranslate = missingKeys.map(({ value }) => value);
    let translatedTexts;

    if (useGoogle) {
      console.log('   Using Google Translate...');
      translatedTexts = await translateBatchWithGoogle(textsToTranslate, targetLocaleCode);
    } else {
      console.log('   Using OpenAI...');
      translatedTexts = await translateWithOpenAI(textsToTranslate, targetLocaleCode, apiKey);
    }

    // Add translated keys to target locale
    for (let i = 0; i < missingKeys.length; i++) {
      const { key } = missingKeys[i];
      const translatedValue = translatedTexts[i];
      setValueByKey(targetLocale, key, translatedValue);
    }

    // Sort keys for consistent ordering
    const sortedLocale = sortObjectKeys(targetLocale);

    // Write updated locale file
    fs.writeFileSync(targetLocalePath, `${JSON.stringify(sortedLocale, null, 2)}\n`, 'utf8');

    const newKeyCount = getAllKeys(sortedLocale).length;
    console.log(`   ✅ Added ${missingKeys.length} translations. Total keys: ${newKeyCount}\n`);
  }

  // Summary
  console.log('='.repeat(50));
  if (hasIssues) {
    if (checkOnly || (!apiKey && !useGoogle)) {
      console.log('❌ Missing translations found.');
      console.log('   Run with OPENAI_API_KEY or --google flag to auto-translate missing keys.');
      process.exit(1);
    } else {
      console.log('✅ Translations fixed!');
      process.exit(0);
    }
  } else {
    console.log('✅ All translations are complete!');
    process.exit(0);
  }
}

// Run the script
main().catch(error => {
  console.error(`❌ Unexpected error: ${error.message}`);
  process.exit(1);
});
