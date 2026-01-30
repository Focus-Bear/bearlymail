#!/usr/bin/env node

/**
 * Custom promptfoo test runner that:
 * 1. Runs all promptfoo evaluations
 * 2. Parses the output to determine actual pass/fail status
 * 3. Provides a summary at the end
 * 4. Returns appropriate exit code based on test results
 * 5. Only shows errors/failures, not full output (quiet mode)
 */

const { spawnSync } = require('child_process');
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
  
  // Show progress inline
  process.stdout.write(`[${index}/${total}] ${configName}... `);

  const result = spawnSync('npx', ['promptfoo', 'eval', '-c', configPath, '--no-progress-bar'], {
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
    maxBuffer: 50 * 1024 * 1024,
  });

  const output = (result.stdout || '') + (result.stderr || '');
  
  // Parse the output to determine pass/fail
  const stats = parseEvaluationOutput(output, configName);
  stats.exitCode = result.status;
  stats.configName = configName;
  stats.output = output;

  // Show result inline
  if (stats.failed > 0) {
    console.log(`${colors.red}FAIL${colors.reset} (${stats.passed}/${stats.total} passed, ${stats.failed} failed)`);
  } else if (stats.total > 0) {
    console.log(`${colors.green}PASS${colors.reset} (${stats.passed}/${stats.total})`);
  } else {
    console.log(`${colors.yellow}NO TESTS${colors.reset}`);
  }

  return stats;
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
    }
  }

  const overallStatus = totalFailed === 0;
  log('\n' + '='.repeat(60));
  if (overallStatus) {
    log('RESULT: ALL TESTS PASSED', colors.green + colors.bold);
  } else {
    log(`RESULT: ${totalFailed} TEST(S) FAILED`, colors.red + colors.bold);
  }
  log('='.repeat(60) + '\n');

  return overallStatus;
}

async function main() {
  log('Promptfoo Test Runner', colors.bold + colors.blue);
  log('');

  const yamlFiles = findYamlFiles();
  log(`Found ${yamlFiles.length} test configuration(s)`, colors.cyan);
  log('');

  if (yamlFiles.length === 0) {
    log('No test configurations found!', colors.red);
    process.exit(1);
  }

  const results = [];

  for (let i = 0; i < yamlFiles.length; i++) {
    const configPath = yamlFiles[i];
    try {
      const result = runEvaluation(configPath, i + 1, yamlFiles.length);
      results.push(result);
    } catch (err) {
      console.log(`${colors.red}ERROR${colors.reset} - ${err.message}`);
      results.push({
        configName: path.basename(configPath),
        total: 0,
        passed: 0,
        failed: 1,
        errors: [err.message],
        exitCode: 1,
        output: '',
      });
    }
  }

  const allPassed = printSummary(results);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Error running promptfoo tests:', err);
  process.exit(1);
});
