#!/usr/bin/env node
/**
 * Fails the build if any string literal in infrastructure/lib or infrastructure/bin
 * contains a non-ASCII character.
 *
 * AWS rejects non-ASCII in many resource fields (security group GroupDescription,
 * IAM role descriptions, etc.) and the failure only surfaces at deploy time. This
 * catches it at PR time. Comments are not checked because they are stripped at
 * CDK synth and never reach AWS.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['lib', 'bin'].map((d) => path.join(ROOT, d)); // nosemgrep

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name); // nosemgrep
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && full.endsWith('.ts')) yield full;
  }
}

const NON_ASCII = /[^\x00-\x7F]/;
const findings = [];

for (const dir of DIRS) {
  for (const file of walk(dir)) {
    const src = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

    const visit = (node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        const m = node.text.match(NON_ASCII);
        if (m) {
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          findings.push({
            file: path.relative(process.cwd(), file),
            line: line + 1,
            column: character + 1,
            badChar: m[0],
            codepoint: m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
            text: node.text.length > 100 ? node.text.slice(0, 100) + '...' : node.text,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

if (findings.length > 0) {
  console.error(`Found ${findings.length} string literal(s) with non-ASCII characters:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}:${f.column}`);
    console.error(`    char: '${f.badChar}' (U+${f.codepoint})`);
    console.error(`    text: ${JSON.stringify(f.text)}`);
    console.error('');
  }
  console.error('AWS rejects non-ASCII in many resource fields (e.g. SecurityGroup');
  console.error('GroupDescription). Replace with ASCII equivalents.');
  process.exit(1);
}

console.log('OK: no non-ASCII characters in string literals under lib/ and bin/');
