#!/usr/bin/env ts-node
/// <reference types="node" />
/**
 * Automatic Security Audit Script
 *
 * Scans all NestJS controllers and checks for potential security issues:
 * 1. Missing authentication guards on endpoints
 * 2. Missing admin guards on admin-only endpoints
 * 3. Endpoints that access userId without JwtAuthGuard
 *
 * LLM analysis is ON by default. Set SECURITY_AUDIT_OPENAI_API_KEY (or OPENAI_API_KEY as fallback).
 *
 * Usage:
 *   Full scan:       npx ts-node -r tsconfig-paths/register scripts/security-audit.ts
 *   No LLM:          npx ts-node -r tsconfig-paths/register scripts/security-audit.ts --no-llm
 *   Diff from main:  npx ts-node -r tsconfig-paths/register scripts/security-audit.ts --diff
 *   CI mode:         npx ts-node -r tsconfig-paths/register scripts/security-audit.ts --ci
 *   JSON output:     npx ts-node -r tsconfig-paths/register scripts/security-audit.ts --json
 *
 * CI mode (--ci):
 *   - Implies --diff (only scans changed controller files)
 *   - Auto-reads GITHUB_BASE_REF env var for the base branch
 *   - Exits 0 cleanly when no controller files have changed (no fallback to full scan)
 *   - Exits 1 when critical findings are detected
 *
 * Environment variables:
 *   SECURITY_AUDIT_OPENAI_API_KEY  Dedicated API key for security audit (recommended)
 *   OPENAI_API_KEY                  Fallback if SECURITY_AUDIT_OPENAI_API_KEY is not set
 *   GITHUB_BASE_REF                 Base branch for diff (set automatically by GitHub Actions)
 */

import * as fs from "fs";
import * as path from "path";
import { execSync, execFileSync } from "child_process";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ControllerInfo {
  filePath: string;
  className: string;
  route: string;
  classLevelGuards: string[];
  endpoints: EndpointInfo[];
}

interface EndpointInfo {
  method: string;
  route: string;
  functionName: string;
  line: number;
  guards: string[];
  effectiveGuards: string[];
  usesUserId: boolean;
  usesRequest: boolean;
}

interface SecurityFinding {
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  file: string;
  line?: number;
  endpoint?: string;
  suggestion: string;
}

interface AuditResult {
  controllers: ControllerInfo[];
  findings: SecurityFinding[];
  summary: {
    totalControllers: number;
    totalEndpoints: number;
    criticalFindings: number;
    warningFindings: number;
    infoFindings: number;
  };
}

// ─── Known public endpoints that intentionally have no auth ──────────────────

const KNOWN_PUBLIC_CONTROLLERS = [
  "AppController", // Health check + hello
  "PublicCalendarController", // Public booking endpoints
];

const KNOWN_PUBLIC_ENDPOINTS: Record<string, string[]> = {
  AuthController: [
    "register",
    "setupPassword",
    "login",
    "googleAuth",
    "googleAuthRedirect",
    "microsoftAuth",
    "microsoftAuthRedirect",
    "zohoAuth",
    "zohoAuthRedirect",
  ],
  WaitlistController: ["submit"],
  SubscriptionsController: ["handleWebhook"],
};

// ─── Parsing ─────────────────────────────────────────────────────────────────

function findControllerFiles(srcDir: string): string[] {
  const files: string[] = [];

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name); // nosemgrep
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith(".controller.ts")) {
        files.push(fullPath);
      }
    }
  }

  walkDir(srcDir);
  return files.sort();
}

function parseController(filePath: string): ControllerInfo | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Extract class name and @Controller route
  const controllerMatch = content.match(
    /@Controller\(["']?([^"')]*)?["']?\)\s*(?:@UseGuards\([^)]*\)\s*)*(?:export\s+)?class\s+(\w+)/s,
  );
  if (!controllerMatch) return null;

  const route = controllerMatch[1] || "/";
  const className = controllerMatch[2];

  // Extract class-level guards
  // Look for @UseGuards between @Controller and `class`
  const classDeclarationRegion = content.substring(
    content.indexOf(`@Controller`),
    content.indexOf(`class ${className}`),
  );
  const classLevelGuards = extractGuards(classDeclarationRegion);

  // Parse endpoints
  const endpoints: EndpointInfo[] = [];
  const httpMethodRegex = /@(Get|Post|Put|Delete|Patch)\s*\(([^)]*)\)/g;
  let match;

  while ((match = httpMethodRegex.exec(content)) !== null) {
    const httpMethod = match[1];
    const endpointRoute = match[2].replace(/['"]/g, "").trim();
    const matchIndex = match.index;

    // Find the line number
    const beforeMatch = content.substring(0, matchIndex);
    const lineNumber = beforeMatch.split("\n").length;

    // Find all @UseGuards decorators in the region around this endpoint:
    // 1. Between previous endpoint and this HTTP decorator (guards before)
    const previousEnd =
      endpoints.length > 0 ? findPreviousEndpointEnd(content, matchIndex) : 0;
    const guardsBefore = extractGuardsForMethod(
      content,
      matchIndex,
      previousEnd,
    );

    // 2. Between the HTTP decorator and the function body opening brace (guards after)
    const funcBodyStart = content.indexOf("{", matchIndex);
    const regionAfterDecorator = content.substring(
      matchIndex,
      funcBodyStart >= 0 ? funcBodyStart : matchIndex + 500,
    );
    const guardsAfter = extractGuards(regionAfterDecorator);

    const methodGuards = [...new Set([...guardsBefore, ...guardsAfter])];

    // Find function name: look for the `async methodName(` pattern after all decorators
    const afterDecorator = content.substring(matchIndex, matchIndex + 800);
    // Match `async functionName(` which is the actual method declaration
    const funcMatch = afterDecorator.match(/\n\s+async\s+(\w+)\s*\(/);
    // Fallback: try non-async method pattern
    const funcMatchFallback = !funcMatch
      ? afterDecorator.match(/\n\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/)
      : null;
    const functionName = funcMatch?.[1] || funcMatchFallback?.[1] || "unknown";

    // Check if the function body uses req.user.userId or @Request
    const funcBodyEnd = findFunctionBodyEnd(content, matchIndex);
    const funcBody = content.substring(matchIndex, funcBodyEnd);
    const usesUserId =
      funcBody.includes("req.user.userId") ||
      funcBody.includes("req.user") ||
      funcBody.includes("userId");
    const usesRequest = funcBody.includes("@Request()");

    // Effective guards = class-level + method-level
    const effectiveGuards = [
      ...new Set([...classLevelGuards, ...methodGuards]),
    ];

    endpoints.push({
      method: httpMethod,
      route: endpointRoute,
      functionName,
      line: lineNumber,
      guards: methodGuards,
      effectiveGuards,
      usesUserId,
      usesRequest,
    });
  }

  return {
    filePath: path.relative(process.cwd(), filePath),
    className,
    route,
    classLevelGuards,
    endpoints,
  };
}

function extractGuards(text: string): string[] {
  const guards: string[] = [];
  const guardRegex = /@UseGuards\(([^)]+)\)/g;
  let match;
  while ((match = guardRegex.exec(text)) !== null) {
    const guardList = match[1]
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    guards.push(...guardList);
  }
  return guards;
}

function extractGuardsForMethod(
  content: string,
  decoratorIndex: number,
  searchStart: number,
): string[] {
  // Look between the previous endpoint (or class start) and this decorator
  // for @UseGuards that belong to this method
  const regionBefore = content.substring(searchStart, decoratorIndex);

  // Find the last block of decorators (they cluster together before the method)
  // Walk backwards from the HTTP decorator to find adjacent @UseGuards
  const linesBeforeDecorator = regionBefore.split("\n");
  const guards: string[] = [];

  // Check the lines right before the HTTP method decorator
  for (let i = linesBeforeDecorator.length - 1; i >= 0; i--) {
    const line = linesBeforeDecorator[i].trim();
    if (line.startsWith("@UseGuards(")) {
      guards.push(...extractGuards(line));
    } else if (
      line === "" ||
      line.startsWith("@") ||
      line.startsWith("//") ||
      line.startsWith("/*") ||
      line.startsWith("*")
    ) {
      // Continue looking through comments and other decorators
      continue;
    } else {
      // Hit a non-decorator line, stop
      break;
    }
  }

  return guards;
}

function findPreviousEndpointEnd(
  content: string,
  currentIndex: number,
): number {
  // Simple heuristic: look backwards for the last closing brace + newline pattern
  const before = content.substring(0, currentIndex);
  const lastBrace = before.lastIndexOf("\n  }\n");
  return lastBrace >= 0 ? lastBrace : 0;
}

function findFunctionBodyEnd(content: string, startIndex: number): number {
  // Find the opening brace of the function body, then match the closing brace
  let braceStart = content.indexOf("{", startIndex);
  if (braceStart === -1) return startIndex + 200;

  let depth = 1;
  let i = braceStart + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === "{") depth++;
    if (content[i] === "}") depth--;
    i++;
  }
  return i;
}

// ─── Security Analysis ───────────────────────────────────────────────────────

function analyzeController(controller: ControllerInfo): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  // Skip known public controllers
  if (KNOWN_PUBLIC_CONTROLLERS.includes(controller.className)) {
    findings.push({
      severity: "info",
      category: "public-controller",
      message: `${controller.className} is intentionally public (health/root endpoints)`,
      file: controller.filePath,
      suggestion: "No action needed - verified as intentionally public",
    });
    return findings;
  }

  const hasClassLevelAuth = controller.classLevelGuards.some(
    (g) => g.includes("JwtAuthGuard") || g.includes("AdminGuard"),
  );

  for (const endpoint of controller.endpoints) {
    const fullRoute =
      `${endpoint.method} /${controller.route}/${endpoint.route}`.replace(
        /\/+/g,
        "/",
      );

    // Check if this endpoint is known public
    const knownPublicEndpoints =
      KNOWN_PUBLIC_ENDPOINTS[controller.className] || [];
    const isKnownPublic = knownPublicEndpoints.includes(endpoint.functionName);

    if (isKnownPublic) {
      findings.push({
        severity: "info",
        category: "known-public",
        message: `${fullRoute} (${endpoint.functionName}) is intentionally public`,
        file: controller.filePath,
        line: endpoint.line,
        endpoint: fullRoute,
        suggestion: "No action needed - verified as intentionally public",
      });
      continue;
    }

    const hasJwtGuard = endpoint.effectiveGuards.some((g) =>
      g.includes("JwtAuthGuard"),
    );
    const hasAnyAuthGuard = endpoint.effectiveGuards.some(
      (g) =>
        g.includes("JwtAuthGuard") ||
        g.includes("LocalAuthGuard") ||
        g.includes("GoogleAuthGuard") ||
        g.includes("MicrosoftAuthGuard") ||
        g.includes("ZohoAuthGuard"),
    );
    const hasAdminGuard = endpoint.effectiveGuards.some((g) =>
      g.includes("AdminGuard"),
    );

    // CRITICAL: Endpoint accesses userId but has no auth guard
    if (endpoint.usesUserId && !hasAnyAuthGuard) {
      findings.push({
        severity: "critical",
        category: "missing-auth-guard",
        message: `${fullRoute} (${endpoint.functionName}) accesses user data but has NO authentication guard`,
        file: controller.filePath,
        line: endpoint.line,
        endpoint: fullRoute,
        suggestion:
          "Add @UseGuards(JwtAuthGuard) to the method or controller class",
      });
    }
    // CRITICAL: Endpoint has no auth guard at all
    else if (!hasAnyAuthGuard && !hasClassLevelAuth) {
      findings.push({
        severity: "critical",
        category: "no-auth-guard",
        message: `${fullRoute} (${endpoint.functionName}) has no authentication guard`,
        file: controller.filePath,
        line: endpoint.line,
        endpoint: fullRoute,
        suggestion:
          "Verify this endpoint should be public, or add @UseGuards(JwtAuthGuard)",
      });
    }

    // CRITICAL: Admin route without AdminGuard
    if (
      (controller.route.includes("admin") ||
        endpoint.route.includes("admin")) &&
      !hasAdminGuard
    ) {
      findings.push({
        severity: "critical",
        category: "missing-admin-guard",
        message: `${fullRoute} (${endpoint.functionName}) appears to be an admin endpoint but lacks AdminGuard`,
        file: controller.filePath,
        line: endpoint.line,
        endpoint: fullRoute,
        suggestion: "Add AdminGuard to protect admin-only endpoints",
      });
    }

    // CRITICAL: Debug endpoint should have admin guard
    if (
      (endpoint.route.includes("debug") ||
        endpoint.functionName.toLowerCase().includes("debug")) &&
      !hasAdminGuard
    ) {
      findings.push({
        severity: "critical",
        category: "debug-endpoint-exposed",
        message: `${fullRoute} (${endpoint.functionName}) is a debug endpoint without AdminGuard`,
        file: controller.filePath,
        line: endpoint.line,
        endpoint: fullRoute,
        suggestion:
          "Add AdminGuard to debug endpoints to prevent exposure in production",
      });
    }
  }

  return findings;
}

// ─── Diff Mode ───────────────────────────────────────────────────────────────

function getChangedControllerFiles(): { files: string[]; diffFailed: boolean } {
  let diffFailed = false;

  try {
    // Try multiple git diff strategies in order of preference.
    // This avoids hard-failing when origin/<base> is unavailable in CI shallow clones.
    const baseRefs: string[] = [];
    if (process.env.GITHUB_BASE_SHA) baseRefs.push(process.env.GITHUB_BASE_SHA);
    if (process.env.GITHUB_BASE_REF) {
      baseRefs.push(`origin/${process.env.GITHUB_BASE_REF}`);
      baseRefs.push(process.env.GITHUB_BASE_REF);
    }
    baseRefs.push("main", "origin/main", "HEAD~1");

    // Build candidate strategies: three-dot (merge-base), then direct tree diff (no dots)
    const candidateRefs: Array<{
      ref: string;
      diffMode: "three-dot" | "direct";
    }> = [];
    for (const ref of baseRefs) {
      candidateRefs.push({ ref, diffMode: "three-dot" });
    }
    for (const ref of baseRefs) {
      candidateRefs.push({ ref, diffMode: "direct" });
    }

    // In CI shallow clones, refs like origin/main may not exist.
    // Try to fetch the base ref if we're in a shallow clone.
    try {
      const isShallow = execFileSync(
        "git",
        ["rev-parse", "--is-shallow-repository"],
        {
          encoding: "utf-8",
        },
      ).trim();
      if (isShallow === "true") {
        const baseRef = process.env.GITHUB_BASE_REF || "main";
        console.error(`Shallow clone detected, fetching ${baseRef}...`);
        try {
          execFileSync("git", ["fetch", "origin", baseRef, "--depth=1"], {
            encoding: "utf-8",
          });
          console.error(`Fetched origin/${baseRef} for diff comparison`);
        } catch (fetchErr) {
          console.error(
            `Warning: Could not fetch ${baseRef}: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
          );
        }
      }
    } catch {
      // git rev-parse not available, skip
    }

    let result = "";
    let selectedRef: string | null = null;
    const refErrors: string[] = [];

    for (const candidate of candidateRefs) {
      const { ref, diffMode } = candidate;
      // three-dot: uses merge-base (needs full history)
      // direct: compares trees directly (works in shallow clones)
      const diffArgs =
        diffMode === "three-dot"
          ? [
              "diff",
              "--name-only",
              `${ref}...HEAD`,
              "--",
              "server/src/**/*.controller.ts",
            ]
          : [
              "diff",
              "--name-only",
              ref,
              "HEAD",
              "--",
              "server/src/**/*.controller.ts",
            ];
      try {
        result = execFileSync("git", diffArgs, { encoding: "utf-8" });
        selectedRef = `${ref} (${diffMode})`;
        break;
      } catch (error) {
        const refLabel = `${ref}(${diffMode})`;
        const stderr =
          error instanceof Error &&
          (error as NodeJS.ErrnoException & { stderr?: Buffer }).stderr
            ? (error as NodeJS.ErrnoException & { stderr?: Buffer })
                .stderr!.toString()
                .trim()
            : "";
        refErrors.push(
          `${refLabel}: ${error instanceof Error ? error.message : String(error)}${stderr ? " | stderr: " + stderr : ""}`,
        );
      }
    }

    if (!selectedRef) {
      const refLabels = candidateRefs.map((c) => `${c.ref}(${c.diffMode})`);
      throw new Error(
        `Unable to diff against any candidate refs: ${refLabels.join(", ")}.\nDetailed errors:\n${refErrors.map((e, i) => "  " + (i + 1) + ". " + e).join("\n")}`,
      );
    }

    console.error(`Using git diff base ref: ${selectedRef}`);

    const files = result
      .trim()
      .split("\n")
      .filter((f) => f && f.endsWith(".controller.ts"))
      .map((f) => path.resolve(process.cwd(), "..", f)); // nosemgrep

    return { files, diffFailed: false };
  } catch (error) {
    // If all diff strategies fail, tell caller to run full scan
    diffFailed = true;
    console.error(
      `Warning: Could not determine changed controller files: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(`Falling back to full scan`);
    return { files: [], diffFailed };
  }
}

function getChangedFunctions(
  filePath: string,
  baseBranch: string = "main",
): string[] {
  try {
    const relativePath = path.relative(
      path.resolve(process.cwd(), ".."),
      filePath,
    );
    const diffOutput = execSync( // nosemgrep
      `git diff origin/${baseBranch}...HEAD -- "${relativePath}"`,
      { encoding: "utf-8", stdio: "pipe" },
    );

    // Extract function names from the diff (lines starting with + that contain async methodName)
    const changedFunctions: string[] = [];
    const funcRegex =
      /^\+.*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/gm;
    let match;
    while ((match = funcRegex.exec(diffOutput)) !== null) {
      if (match[1] && match[1] !== "constructor") {
        changedFunctions.push(match[1]);
      }
    }

    // Also look for changed decorators (added/removed guards)
    const decoratorRegex = /^\+\s*@(UseGuards|Get|Post|Put|Delete|Patch)/gm;
    while ((match = decoratorRegex.exec(diffOutput)) !== null) {
      // The function that follows this decorator was potentially changed
      const afterMatch = diffOutput.substring(match.index, match.index + 500);
      const funcAfter = afterMatch.match(/(?:async\s+)?(\w+)\s*\([^)]*\)/);
      if (funcAfter && funcAfter[1] && funcAfter[1] !== "constructor") {
        changedFunctions.push(funcAfter[1]);
      }
    }

    return [...new Set(changedFunctions)];
  } catch {
    return [];
  }
}

// ─── LLM Analysis ────────────────────────────────────────────────────────────

function buildLLMPrompt(controller: ControllerInfo): string {
  const content = fs.readFileSync(
    path.resolve(process.cwd(), controller.filePath), // nosemgrep
    "utf-8",
  );

  return `You are a security auditor reviewing a NestJS controller for security issues.

Analyze the following controller code and identify:
1. Endpoints missing authentication guards (@UseGuards with JwtAuthGuard)
2. Endpoints that access user data (req.user) without proper auth
3. Admin endpoints missing AdminGuard
4. Potential injection vulnerabilities (unsanitized params used in queries)
5. Sensitive data exposure (returning passwords, tokens, etc.)
6. Missing input validation
7. Rate limiting concerns for sensitive operations

Controller: ${controller.className}
Route: ${controller.route}
Class-level guards: ${controller.classLevelGuards.join(", ") || "NONE"}

Code:
\`\`\`typescript
${content}
\`\`\`

Respond with a JSON array of findings. Each finding should have:
- severity: "critical" | "warning" | "info"
- category: string (e.g., "missing-auth", "injection-risk", "data-exposure")
- message: string (description of the issue)
- line: number (approximate line number)
- suggestion: string (how to fix it)

If there are no issues, return an empty array: []

Return ONLY valid JSON, no other text.`;
}

async function analyzWithLLM(
  controllers: ControllerInfo[],
): Promise<SecurityFinding[]> {
  // Check for OpenAI API key (dedicated key preferred, fallback to main key)
  const apiKey =
    process.env.SECURITY_AUDIT_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const keySource = process.env.SECURITY_AUDIT_OPENAI_API_KEY
    ? "SECURITY_AUDIT_OPENAI_API_KEY"
    : process.env.OPENAI_API_KEY
      ? "OPENAI_API_KEY (fallback)"
      : "NOT SET";

  if (!apiKey) {
    console.error(
      "\n  LLM analysis requires SECURITY_AUDIT_OPENAI_API_KEY (or OPENAI_API_KEY as fallback).",
    );
    console.error(
      "  Set it with: export SECURITY_AUDIT_OPENAI_API_KEY=your-key-here",
    );
    console.error("  Or disable LLM with: --no-llm\n");
    return [];
  }

  console.log(`  Using API key from: ${keySource}`);

  const findings: SecurityFinding[] = [];

  for (const controller of controllers) {
    process.stdout.write(`  Analyzing ${controller.className} with LLM...`);

    const prompt = buildLLMPrompt(controller);

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are a security auditor. Respond only with valid JSON arrays.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_tokens: 2000,
          }),
        },
      );

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
        }>;
        error?: { message?: string };
      };

      if (data.error) {
        console.log(` ERROR: ${data.error.message}`);
        continue;
      }

      const content = data.choices?.[0]?.message?.content || "[]";
      // Extract JSON from response (handle markdown code blocks)
      const jsonStr = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          for (const finding of parsed) {
            findings.push({
              severity: finding.severity || "warning",
              category: `llm-${finding.category || "security"}`,
              message: `[LLM] ${finding.message}`,
              file: controller.filePath,
              line: finding.line,
              endpoint: finding.endpoint,
              suggestion: finding.suggestion || "",
            });
          }
          console.log(` ${parsed.length} finding(s)`);
        } else {
          console.log(" no findings");
        }
      } else {
        console.log(" no findings");
      }
    } catch (error) {
      console.log(
        ` ERROR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return findings;
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function printReport(result: AuditResult, jsonOutput: boolean): void {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("\n" + "=".repeat(70));
  console.log("  SECURITY AUDIT REPORT");
  console.log("=".repeat(70));
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Controllers scanned: ${result.summary.totalControllers}`);
  console.log(`  Endpoints scanned: ${result.summary.totalEndpoints}`);
  console.log("");

  // Group findings by severity
  const critical = result.findings.filter((f) => f.severity === "critical");
  const warnings = result.findings.filter((f) => f.severity === "warning");
  const info = result.findings.filter((f) => f.severity === "info");

  if (critical.length > 0) {
    console.log(`\n  CRITICAL (${critical.length})`);
    console.log("  " + "-".repeat(50));
    for (const finding of critical) {
      console.log(`  [CRITICAL] ${finding.message}`);
      console.log(
        `             File: ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
      );
      console.log(`             Fix: ${finding.suggestion}`);
      console.log("");
    }
  }

  if (warnings.length > 0) {
    console.log(`\n  WARNINGS (${warnings.length})`);
    console.log("  " + "-".repeat(50));
    for (const finding of warnings) {
      console.log(`  [WARNING] ${finding.message}`);
      console.log(
        `            File: ${finding.file}${finding.line ? `:${finding.line}` : ""}`,
      );
      console.log(`            Fix: ${finding.suggestion}`);
      console.log("");
    }
  }

  if (info.length > 0) {
    console.log(`\n  INFO (${info.length})`);
    console.log("  " + "-".repeat(50));
    for (const finding of info) {
      console.log(`  [INFO] ${finding.message}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  console.log(`  Critical: ${result.summary.criticalFindings}`);
  console.log(`  Warnings: ${result.summary.warningFindings}`);
  console.log(`  Info:     ${result.summary.infoFindings}`);
  console.log("=".repeat(70));

  if (result.summary.criticalFindings > 0) {
    console.log(
      "\n  ** ACTION REQUIRED: Critical security findings detected! **\n",
    );
  } else if (result.summary.warningFindings > 0) {
    console.log(
      "\n  Review warnings above and address any genuine concerns.\n",
    );
  } else {
    console.log("\n  All checks passed!\n");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const ciMode = args.includes("--ci");
  const diffMode = args.includes("--diff") || ciMode;
  // LLM is ON by default; use --no-llm to disable
  const llmMode = !args.includes("--no-llm");
  const jsonOutput = args.includes("--json");
  // CI mode auto-reads GITHUB_BASE_REF / GITHUB_BASE_SHA (set by GitHub Actions on pull_request events)
  const baseBranch =
    (ciMode ? process.env.GITHUB_BASE_REF : undefined) ||
    args.find((a) => a.startsWith("--base="))?.split("=")[1] ||
    "main";
  // Sanitize baseBranch to prevent command injection via malicious branch names
  const sanitizedBaseBranch = baseBranch.replace(/[^a-zA-Z0-9._\-\/]/g, "");
  // GITHUB_BASE_SHA is used by the resilient diff logic inside getChangedControllerFiles

  const srcDir = path.resolve(__dirname, "../src");

  if (!jsonOutput) {
    console.log("\n  Security Audit Script");
    const modeLabel = ciMode
      ? `CI/diff (vs ${baseBranch})`
      : diffMode
        ? `diff (vs ${baseBranch})`
        : "full scan";
    console.log(
      `  Mode: ${modeLabel}${llmMode ? " + LLM analysis" : " (static only)"}`,
    );
  }

  // Find controller files
  let controllerFiles: string[];
  let changedFunctionsMap: Map<string, string[]> = new Map();

  if (diffMode) {
    const { files: changedFiles, diffFailed } = getChangedControllerFiles();
    controllerFiles = changedFiles;
    if (diffFailed || controllerFiles.length === 0) {
      if (ciMode && !diffFailed && jsonOutput) {
        printReport(
          {
            controllers: [],
            findings: [],
            summary: {
              totalControllers: 0,
              totalEndpoints: 0,
              criticalFindings: 0,
              warningFindings: 0,
              infoFindings: 0,
            },
          },
          true,
        );
      }
      if (ciMode && !diffFailed) {
        // In CI mode with no changed controllers: exit cleanly so CI passes
        if (!jsonOutput) {
          console.log(
            `\n  No controller files changed compared to ${baseBranch}. Skipping security audit.`,
          );
        }
        process.exit(0);
      }
      if (!jsonOutput) {
        if (diffFailed) {
          console.log(
            `\n  Could not determine changed files. Running full scan instead...\n`,
          );
        } else {
          console.log(
            `\n  No controller files changed compared to ${baseBranch}.`,
          );
          console.log("  Running full scan instead...\n");
        }
      }
      controllerFiles = findControllerFiles(srcDir);
    } else {
      if (!jsonOutput) {
        console.log(
          `\n  ${controllerFiles.length} controller file(s) changed:`,
        );
        controllerFiles.forEach((f) =>
          console.log(`    - ${path.relative(process.cwd(), f)}`),
        );
      }
      // Get changed functions for each file
      for (const file of controllerFiles) {
        const changedFns = getChangedFunctions(file, sanitizedBaseBranch);
        if (changedFns.length > 0) {
          changedFunctionsMap.set(file, changedFns);
        }
      }
    }
  } else {
    controllerFiles = findControllerFiles(srcDir);
  }

  if (!jsonOutput) {
    console.log(
      `\n  Scanning ${controllerFiles.length} controller file(s)...\n`,
    );
  }

  // Parse controllers
  const controllers: ControllerInfo[] = [];
  for (const file of controllerFiles) {
    const controller = parseController(file);
    if (controller) {
      // In diff mode, filter endpoints to only changed functions
      if (diffMode && changedFunctionsMap.has(file)) {
        const changedFns = changedFunctionsMap.get(file)!;
        controller.endpoints = controller.endpoints.filter((ep) =>
          changedFns.includes(ep.functionName),
        );
        // Still include the controller even if no endpoints match
        // (class-level guard changes affect all endpoints)
      }
      controllers.push(controller);
    }
  }

  // Run static analysis
  let allFindings: SecurityFinding[] = [];
  for (const controller of controllers) {
    const findings = analyzeController(controller);
    allFindings.push(...findings);
  }

  // Run LLM analysis if requested
  if (llmMode) {
    if (!jsonOutput) {
      console.log("\n  Running LLM-based security analysis...");
    }
    const llmFindings = await analyzWithLLM(controllers);
    allFindings.push(...llmFindings);
  }

  // Compile results
  const totalEndpoints = controllers.reduce(
    (sum, c) => sum + c.endpoints.length,
    0,
  );

  const result: AuditResult = {
    controllers,
    findings: allFindings,
    summary: {
      totalControllers: controllers.length,
      totalEndpoints,
      criticalFindings: allFindings.filter((f) => f.severity === "critical")
        .length,
      warningFindings: allFindings.filter((f) => f.severity === "warning")
        .length,
      infoFindings: allFindings.filter((f) => f.severity === "info").length,
    },
  };

  // Output report
  printReport(result, jsonOutput);

  // Exit with error code if critical findings
  if (result.summary.criticalFindings > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Security audit failed:", error);
  process.exit(2);
});
