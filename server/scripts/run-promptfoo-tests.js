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

function findYamlFiles() {
  const files = fs.readdirSync(PROMPTFOO_DIR);
  return files
    .filter(f => f.endsWith('.yaml') && f !== 'promptfoo.yaml')
    .sort()
    .map(f => path.join(PROMPTFOO_DIR, f));
}

function runEvaluation(configPath, index, total) {
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

      if (stats.failed > 0) {
        log(`[${index}/${total}] ${configName}... ${colors.red}FAIL${colors.reset} (${stats.passed}/${stats.total} passed, ${stats.failed} failed)`);
      } else if (stats.total > 0) {
        log(`[${index}/${total}] ${configName}... ${colors.green}PASS${colors.reset} (${stats.passed}/${stats.total})`);
      } else {
        log(`[${index}/${total}] ${configName}... ${colors.yellow}NO TESTS${colors.reset}`);
      }

      resolve(stats);
    });

    child.on('error', (err) => {
      log(`[${index}/${total}] ${configName}... ${colors.red}ERROR${colors.reset} - ${err.message}`);
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

  const yamlFiles = findYamlFiles();
  log(`Found ${yamlFiles.length} test configuration(s)`, colors.cyan);
  log(`Running with concurrency: 5 tests at a time`, colors.cyan);
  log('');

  if (yamlFiles.length === 0) {
    log('No test configurations found!', colors.red);
    process.exit(1);
  }

  // Run tests in parallel
  const results = await runTestsInParallel(yamlFiles, 5);

  const allPassed = printSummary(results);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Error running promptfoo tests:', err);
  process.exit(1);
});
