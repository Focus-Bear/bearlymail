#!/usr/bin/env node

/**
 * Custom promptfoo test runner that:
 * 1. Runs all promptfoo evaluations
 * 2. Parses the output to determine actual pass/fail status
 * 3. Provides a summary at the end
 * 4. Returns appropriate exit code based on test results
 * 5. Only shows errors/failures, not full output (quiet mode)
 */

const { spawn } = require('child_process');
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROMPTFOO_DIR = path.join(__dirname, '..', 'promptfoo');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Get changed prompt files from git diff
 * @returns {Set<string>} Set of changed prompt filenames (e.g., 'prioritise-email.md')
 */
function getChangedPromptFiles() {
  const changedFiles = new Set();
  const changedYamlConfigs = new Set();
  let diffFailed = false;

  try {
    // Try multiple git diff strategies in order of preference.
    // This avoids hard-failing when origin/<base> is unavailable in CI shallow clones.
    const baseRefs = [];
    if (process.env.GITHUB_BASE_SHA) baseRefs.push(process.env.GITHUB_BASE_SHA);
    if (process.env.GITHUB_BASE_REF) {
      baseRefs.push(`origin/${process.env.GITHUB_BASE_REF}`);
      baseRefs.push(process.env.GITHUB_BASE_REF);
    }
    baseRefs.push('main', 'origin/main', 'HEAD~1');

    // Build candidate strategies: three-dot (merge-base), then direct tree diff (no dots)
    const candidateRefs = [];
    for (const ref of baseRefs) {
      candidateRefs.push({ ref, diffMode: 'three-dot' });
    }
    for (const ref of baseRefs) {
      candidateRefs.push({ ref, diffMode: 'direct' });
    }

    // In CI shallow clones, refs like origin/main may not exist.
    // Try to fetch the base ref if we're in a shallow clone.
    try {
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf-8' });
      const isShallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf-8' }).trim();
      if (isShallow === 'true') {
        const baseRef = process.env.GITHUB_BASE_REF || 'main';
        log(`Shallow clone detected, fetching ${baseRef}...`, colors.cyan);
        try {
          execFileSync('git', ['fetch', 'origin', baseRef, '--depth=1'], { encoding: 'utf-8' });
          log(`Fetched origin/${baseRef} for diff comparison`, colors.cyan);
        } catch (fetchErr) {
          log(`Warning: Could not fetch ${baseRef}: ${fetchErr.message}`, colors.yellow);
        }
      }
    } catch (e) {
      // git rev-parse not available, skip
    }

    let result = '';
    let selectedRef = null;
    const refErrors = [];
    for (const candidate of candidateRefs) {
      const { ref, diffMode } = candidate;
      // three-dot: uses merge-base (needs full history)
      // direct: compares trees directly (works in shallow clones)
      const diffArgs = diffMode === 'three-dot'
        ? ['diff', '--name-only', `${ref}...HEAD`, '--', 'promptfoo/']
        : ['diff', '--name-only', ref, 'HEAD', '--', 'promptfoo/'];
      try {
        result = execFileSync('git', diffArgs, { encoding: 'utf-8' });
        selectedRef = `${ref} (${diffMode})`;
        break;
      } catch (error) {
        const refLabel = `${candidate.ref}(${candidate.diffMode})`;
        const stderr = error.stderr ? error.stderr.toString().trim() : '';
        refErrors.push(`${refLabel}: ${error.message}${stderr ? ' | stderr: ' + stderr : ''}`);
      }
    }

    if (!selectedRef) {
      const refLabels = candidateRefs.map(c => `${c.ref}(${c.diffMode})`);
      throw new Error(`Unable to diff against any candidate refs: ${refLabels.join(', ')}.\nDetailed errors:\n${refErrors.map((e, i) => '  ' + (i+1) + '. ' + e).join('\n')}`);
    }

    log(`Using git diff base ref: ${selectedRef}`, colors.cyan);

    const files = result.trim().split('\n').filter(Boolean);
    for (const file of files) {
      const basename = path.basename(file);
      if (file.startsWith('server/promptfoo/') && basename.endsWith('.yaml') && basename !== 'promptfoo.yaml') {
        changedYamlConfigs.add(path.join(PROMPTFOO_DIR, basename));
      } else if (basename.endsWith('.md')) {
        changedFiles.add(basename);
      }
    }
  } catch (error) {
    // If all diff strategies fail, tell caller to run all tests
    diffFailed = true;
    log(`Warning: Could not determine changed files: ${error.message}`, colors.yellow);
    log(`Falling back to running all tests`, colors.yellow);
  }

  return { changedFiles, changedYamlConfigs, diffFailed };
}

/**
 * Map prompt filename to corresponding YAML config file(s)
 * @param {string} promptFile - e.g., 'prioritise-email.md'
 * @returns {string[]} Array of YAML config paths that reference this prompt
 */
function findYamlConfigsForPrompt(promptFile) {
  const allYamlFiles = fs.readdirSync(PROMPTFOO_DIR)
    .filter(f => f.endsWith('.yaml') && f !== 'promptfoo.yaml')
    .map(f => path.join(PROMPTFOO_DIR, f));

  const matchingConfigs = [];

  for (const yamlPath of allYamlFiles) {
    try {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      // Check if this YAML references the prompt file
      // Prompts are referenced like: file://prompts/prioritise-email.md
      if (content.includes(`prompts/${promptFile}`)) {
        matchingConfigs.push(yamlPath);
      }
    } catch (error) {
      log(`Warning: Could not read ${yamlPath}: ${error.message}`, colors.yellow);
    }
  }

  return matchingConfigs;
}

function findYamlFiles(changedPromptsOnly = false) {
  if (!changedPromptsOnly) {
    // Original behavior: return all YAML files
    const files = fs.readdirSync(PROMPTFOO_DIR);
    return files
      .filter(f => f.endsWith('.yaml') && f !== 'promptfoo.yaml')
      .sort()
      .map(f => path.join(PROMPTFOO_DIR, f)); // nosemgrep
  }

  // New behavior: only return YAML files for changed prompts
  const {
    changedFiles: changedPrompts,
    changedYamlConfigs,
    diffFailed,
  } = getChangedPromptFiles();

  if (diffFailed) {
    const files = fs.readdirSync(PROMPTFOO_DIR);
    return files
      .filter(f => f.endsWith('.yaml') && f !== 'promptfoo.yaml')
      .sort()
      .map(f => path.join(PROMPTFOO_DIR, f)); // nosemgrep
  }

  if (changedPrompts.size === 0 && changedYamlConfigs.size === 0) {
    log('No prompt files changed in this PR', colors.cyan);
    return [];
  }

  if (changedPrompts.size > 0) {
    log(`Changed prompt files: ${Array.from(changedPrompts).join(', ')}`, colors.cyan);
  }
  if (changedYamlConfigs.size > 0) {
    log(
      `Changed prompt config files: ${Array.from(changedYamlConfigs).map((c) => path.basename(c)).join(', ')}`,
      colors.cyan,
    );
  }

  const yamlFiles = new Set(changedYamlConfigs);
  for (const promptFile of changedPrompts) {
    const configs = findYamlConfigsForPrompt(promptFile);
    configs.forEach(c => yamlFiles.add(c));
  }

  return Array.from(yamlFiles).sort();
}

/**
 * Check if output indicates a 429 rate-limit error from OpenAI.
 */
function is429Error(output) {
  return /429|rate.?limit|too many requests/i.test(output);
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a single promptfoo evaluation, with exponential backoff retry on 429 errors.
 * Promptfoo's OpenAI provider already retries at the HTTP level (maxRetries defaults to 4),
 * but if the whole eval process exits with a 429-related failure we retry at the process level too.
 */
function runEvaluationOnce(configPath, index, total) {
  const configName = path.basename(configPath);

  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn('npx', ['promptfoo', 'eval', '-c', configPath, '--no-progress-bar'], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data) => chunks.push(data));
    child.stderr.on('data', (data) => chunks.push(data));

    child.on('close', (code) => {
      const output = Buffer.concat(chunks).toString('utf-8');
      const stats = parseEvaluationOutput(output, configName);
      stats.exitCode = code;
      stats.configName = configName;
      stats.output = output;
      resolve(stats);
    });

    child.on('error', (err) => {
      resolve({
        configName,
        total: 0,
        passed: 0,
        failed: 1,
        errors: [err.message],
        exitCode: 1,
        output: '',
      });
    });
  });
}

const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 5000; // 5 s, doubles each attempt

async function runEvaluation(configPath, index, total) {
  const configName = path.basename(configPath);

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const stats = await runEvaluationOnce(configPath, index, total);

    const hitRateLimit = stats.exitCode !== 0 && is429Error(stats.output);

    if (!hitRateLimit || attempt > MAX_RETRIES) {
      // Final result — log and return
      if (stats.failed > 0) {
        log(`[${index}/${total}] ${configName}... ${colors.red}FAIL${colors.reset} (${stats.passed}/${stats.total} passed, ${stats.failed} failed)`);
      } else if (stats.total > 0) {
        log(`[${index}/${total}] ${configName}... ${colors.green}PASS${colors.reset} (${stats.passed}/${stats.total})`);
      } else {
        log(`[${index}/${total}] ${configName}... ${colors.yellow}NO TESTS${colors.reset}`);
      }
      return stats;
    }

    // 429 detected — back off and retry
    const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    log(
      `[${index}/${total}] ${configName}... ${colors.yellow}RATE LIMITED (429)${colors.reset} — ` +
      `retrying in ${delayMs / 1000}s (attempt ${attempt}/${MAX_RETRIES})`,
      colors.yellow,
    );
    await sleep(delayMs);
  }
  return runEvaluationOnce(configPath, index, total);
}

function parseEvaluationOutput(output, configName) {
  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [],
  };

  // Look for the completion line: "[Evaluation] ✓ Complete! X/Y tests in Zs"
  const completionMatch = output.match(/\[Evaluation\].*Complete!\s*(\d+)\/(\d+)\s*tests/);
  if (completionMatch) {
    stats.total = parseInt(completionMatch[2], 10);
  }

  // Count [PASS] occurrences in the output
  const passMatches = output.match(/\[PASS\]/g);
  stats.passed = passMatches ? passMatches.length : 0;

  // Count [ERROR] or [FAIL] occurrences
  const errorMatches = output.match(/\[ERROR\]/g);
  const failMatches = output.match(/\[FAIL\]/g);
  stats.failed = (errorMatches ? errorMatches.length : 0) + (failMatches ? failMatches.length : 0);

  // Extract error messages - look for lines with [ERROR] or [FAIL] and capture context
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('[ERROR]') || line.includes('[FAIL]')) {
      // Try to extract the error message
      const errorMatch = line.match(/\[(?:ERROR|FAIL)\]\s*(.+)/);
      if (errorMatch) {
        stats.errors.push(errorMatch[1].trim().substring(0, 200));
      }
    }
  }

  // If we couldn't parse pass/fail from output, use total - failed
  if (stats.passed === 0 && stats.total > 0 && stats.failed > 0) {
    stats.passed = stats.total - stats.failed;
  }

  return stats;
}

function printSummary(results) {
  log('\n' + '='.repeat(60), colors.bold);
  log('PROMPTFOO TEST SUMMARY', colors.bold);
  log('='.repeat(60), colors.bold);

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const failedConfigs = [];

  for (const result of results) {
    totalTests += result.total;
    totalPassed += result.passed;
    totalFailed += result.failed;

    if (result.failed > 0) {
      failedConfigs.push(result);
    }
  }

  log(`\nTotal: ${totalTests} tests across ${results.length} configurations`, colors.bold);
  log(`  Passed: ${totalPassed}`, colors.green);
  log(`  Failed: ${totalFailed}`, totalFailed > 0 ? colors.red : colors.green);

  if (failedConfigs.length > 0) {
    log('\n' + '-'.repeat(60));
    log('FAILED CONFIGURATIONS:', colors.red + colors.bold);
    for (const config of failedConfigs) {
      log(`\n  ${config.configName}:`, colors.red);
      log(`    ${config.passed}/${config.total} passed, ${config.failed} failed`);
      if (config.errors.length > 0) {
        log('    Errors:', colors.yellow);
        for (const error of config.errors.slice(0, 5)) {
          log(`      - ${error}`, colors.yellow);
        }
      }
      // Show raw output lines containing FAIL or ERROR for debugging
      if (config.output) {
        const failLines = config.output.split('\n').filter(l => l.includes('[FAIL]') || l.includes('[ERROR]'));
        if (failLines.length > 0) {
          log('    Raw failure lines:', colors.yellow);
          for (const line of failLines.slice(0, 10)) {
            log(`      ${line.substring(0, 500)}`, colors.yellow);
          }
        }
      }
    }
  }

  log('\n' + '='.repeat(60));
  if (totalFailed === 0) {
    log('RESULT: ALL TESTS PASSED', colors.green + colors.bold);
  } else {
    log(`RESULT: ${totalFailed} TEST(S) FAILED`, colors.red + colors.bold);
  }
  log('='.repeat(60) + '\n');

  return totalFailed === 0;
}

async function runTestsInParallel(yamlFiles, concurrency = 5) {
  const results = new Array(yamlFiles.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < yamlFiles.length) {
      const i = nextIndex++;
      results[i] = await runEvaluation(yamlFiles[i], i + 1, yamlFiles.length);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, yamlFiles.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

async function main() {
  log('Promptfoo Test Runner', colors.bold + colors.blue);
  log('');

  // Check if we should run only changed prompts
  const changedPromptsOnly = process.env.PROMPTFOO_CHANGED_ONLY === 'true' || process.argv.includes('--changed-only');

  if (changedPromptsOnly) {
    log('Running tests only for changed prompt files', colors.cyan);
    // GITHUB_BASE_SHA must be set in CI for reliable diff detection.
    // In GitHub Actions, ensure the promptfoo-tests job sets:
    //   GITHUB_BASE_SHA: ${{ github.event.pull_request.base.sha }}
    // Without this, the fallback to origin/<base-ref>...HEAD may miss changes
    // in merge-commit checkout environments. (#845)
    if (process.env.CI && !process.env.GITHUB_BASE_SHA) {
      log('Warning: GITHUB_BASE_SHA not set. Diff detection may miss changes in CI.', colors.yellow);
      log('Add GITHUB_BASE_SHA: ${{ github.event.pull_request.base.sha }} to the CI job env.', colors.yellow);
    }
  } else {
    log('Running all promptfoo tests', colors.cyan);
  }
  log('');

  const yamlFiles = findYamlFiles(changedPromptsOnly);

  if (process.env.PROMPTFOO_LIST_ONLY === 'true') {
    log(`List-only mode: ${yamlFiles.length} config(s) selected`, colors.cyan);
    for (const yaml of yamlFiles) {
      log(` - ${path.basename(yaml)}`);
    }
    process.exit(0);
  }

  if (yamlFiles.length === 0) {
    if (changedPromptsOnly) {
      log('No prompt files changed - skipping all tests', colors.green);
      log('✓ No tests needed', colors.green);
      process.exit(0);
    } else {
      log('No test configurations found!', colors.red);
      process.exit(1);
    }
  }

  log(`Found ${yamlFiles.length} test configuration(s) to run`, colors.cyan);
  log(`Running with concurrency: 5 tests at a time`, colors.cyan);
  log('');

  // Run tests in parallel with concurrency 5.
  // 429 rate-limit errors are handled by exponential backoff retry inside runEvaluation(),
  // so we don't need to reduce concurrency as a workaround.
  const results = await runTestsInParallel(yamlFiles, 5);

  const allPassed = printSummary(results);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Error running promptfoo tests:', err);
  process.exit(1);
});


