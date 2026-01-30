#!/usr/bin/env node

/**
 * Custom promptfoo test runner that:
 * 1. Runs all promptfoo evaluations
 * 2. Parses the output to determine actual pass/fail status
 * 3. Provides a summary at the end
 * 4. Returns appropriate exit code based on test results
 */

const { execSync, spawnSync } = require('child_process');
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
    .map(f => path.join(PROMPTFOO_DIR, f));
}

function runEvaluation(configPath) {
  const configName = path.basename(configPath);
  log(`\n${'='.repeat(60)}`, colors.cyan);
  log(`Running: ${configName}`, colors.bold);
  log('='.repeat(60), colors.cyan);

  const result = spawnSync('npx', ['promptfoo', 'eval', '-c', configPath, '--no-progress-bar'], {
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env },
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer
  });

  const output = (result.stdout || '') + (result.stderr || '');
  console.log(output);

  // Parse the output to determine pass/fail
  const stats = parseEvaluationOutput(output, configName);
  stats.exitCode = result.status;
  stats.configName = configName;

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

  // Extract error messages
  const errorLines = output.split('\n').filter(line => 
    line.includes('[ERROR]') || line.includes('Error:')
  );
  stats.errors = errorLines.slice(0, 5); // Keep first 5 errors

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

    const status = result.failed > 0 ? `${colors.red}FAIL${colors.reset}` : `${colors.green}PASS${colors.reset}`;
    const passRate = result.total > 0 ? ((result.passed / result.total) * 100).toFixed(0) : 0;
    
    log(`  ${result.configName}: ${status} (${result.passed}/${result.total} tests, ${passRate}%)`);

    if (result.failed > 0) {
      failedConfigs.push(result);
    }
  }

  log('\n' + '-'.repeat(60));
  log(`Total: ${totalTests} tests, ${totalPassed} passed, ${totalFailed} failed`, colors.bold);

  if (failedConfigs.length > 0) {
    log('\nFailed configurations:', colors.red);
    for (const config of failedConfigs) {
      log(`  - ${config.configName}`, colors.red);
      if (config.errors.length > 0) {
        for (const error of config.errors.slice(0, 3)) {
          log(`      ${error.trim().substring(0, 100)}`, colors.yellow);
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
  log('Finding test configurations...', colors.cyan);

  const yamlFiles = findYamlFiles();
  log(`Found ${yamlFiles.length} test configuration(s)`, colors.cyan);
  yamlFiles.forEach((f, i) => log(`  ${i + 1}. ${path.basename(f)}`));
  log('');

  if (yamlFiles.length === 0) {
    log('No test configurations found!', colors.red);
    process.exit(1);
  }

  const results = [];

  for (let i = 0; i < yamlFiles.length; i++) {
    const configPath = yamlFiles[i];
    log(`\n[${i + 1}/${yamlFiles.length}] Starting evaluation...`, colors.cyan);
    try {
      const result = runEvaluation(configPath);
      results.push(result);
      log(`[${i + 1}/${yamlFiles.length}] Completed: ${result.passed}/${result.total} passed`, colors.cyan);
    } catch (err) {
      log(`[${i + 1}/${yamlFiles.length}] Error running ${path.basename(configPath)}: ${err.message}`, colors.red);
      results.push({
        configName: path.basename(configPath),
        total: 0,
        passed: 0,
        failed: 1,
        errors: [err.message],
        exitCode: 1,
      });
    }
  }

  log('\n\nAll evaluations completed. Generating summary...', colors.cyan);
  const allPassed = printSummary(results);

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Error running promptfoo tests:', err);
  process.exit(1);
});
