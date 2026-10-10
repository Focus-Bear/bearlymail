/**
 * Every shipped prompt must render to plain text: a leftover `{% endif %}` or
 * `{{ phishingSignals.senderDomain }}` goes straight to the model as garbage
 * (both happened in production — see PR #220, recommendation K).
 *
 * Variables are derived from each template's own tags, so a new prompt is
 * covered automatically. Each file is rendered twice: with every referenced
 * variable present, and with every variable empty/false.
 */
import * as fs from "fs";
import * as path from "path";

import { PhishingSignals } from "../summarization/phishing-detection.service";
import {
  renderTemplate,
  UNRENDERED_TEMPLATE_SYNTAX_PATTERN,
} from "./prompt-template-renderer";
import { getPrompt, renderPrompt, SUMMARY_PROMPT_IDS } from "./prompts";

const PROMPTS_DIR = path.join(__dirname, "../../promptfoo/prompts");
const PROMPT_FILE_EXTENSION = ".md";
const TAG_PATTERN = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g;
const FOR_TAG_PATTERN = /^for\s+(\w+)\s+in\s+(\S+)/;
const CONDITION_TAG_PATTERN = /^(?:if|elif)\s+(?:not\s+)?(\S+)/;
const LOOP_VARIABLE = "loop";
const SAMPLE_LIST_LENGTH = 2;

function listPromptFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPromptFiles(full);
    return entry.name.endsWith(PROMPT_FILE_EXTENSION) ? [full] : [];
  });
}

interface TemplateShape {
  /** loop list variable → item variable name */
  loops: Map<string, string>;
  /** item variable name → properties referenced as item.prop */
  loopItemProps: Map<string, Set<string>>;
  /** top-level variable → dotted sub-properties (empty set = scalar use) */
  roots: Map<string, Set<string>>;
  /** paths used with a `| join` filter (rendered as arrays) */
  joined: Set<string>;
}

function collectPath(shape: TemplateShape, rawPath: string, joined: boolean) {
  const [root, ...rest] = rawPath.split(".");
  if (root === LOOP_VARIABLE) return;
  if (shape.loopItemProps.has(root)) {
    if (rest.length > 0) shape.loopItemProps.get(root)!.add(rest[0]);
    return;
  }
  if (!shape.roots.has(root)) shape.roots.set(root, new Set());
  if (rest.length > 0) shape.roots.get(root)!.add(rest.join("."));
  if (joined) shape.joined.add(rawPath);
}

function analyseTemplate(template: string): TemplateShape {
  const shape: TemplateShape = {
    loops: new Map(),
    loopItemProps: new Map(),
    roots: new Map(),
    joined: new Set(),
  };
  const tags = [...template.matchAll(TAG_PATTERN)];
  // Register loop item names first so item.prop references inside the body
  // are attributed to the item rather than treated as top-level variables.
  for (const tag of tags) {
    const forMatch = tag[2]?.trim().match(FOR_TAG_PATTERN);
    if (forMatch) {
      shape.loops.set(forMatch[2], forMatch[1]);
      shape.loopItemProps.set(forMatch[1], new Set());
    }
  }
  for (const tag of tags) {
    if (tag[1] !== undefined) {
      const [expression, ...filters] = tag[1].split("|");
      collectPath(shape, expression.trim(), filters.length > 0);
      continue;
    }
    const conditionMatch = tag[2].trim().match(CONDITION_TAG_PATTERN);
    if (conditionMatch) collectPath(shape, conditionMatch[1], false);
  }
  return shape;
}

function buildSampleItem(itemName: string, props: Set<string>): unknown {
  if (props.size === 0) return `sample-${itemName}`;
  return Object.fromEntries(
    [...props].map((prop) => [prop, `sample-${itemName}-${prop}`]),
  );
}

function buildPresentVars(shape: TemplateShape): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const [root, subPaths] of shape.roots) {
    if (shape.loops.has(root)) {
      const itemName = shape.loops.get(root)!;
      vars[root] = Array.from({ length: SAMPLE_LIST_LENGTH }, () =>
        buildSampleItem(itemName, shape.loopItemProps.get(itemName)!),
      );
      continue;
    }
    if (subPaths.size === 0) {
      vars[root] = shape.joined.has(root)
        ? [`sample-${root}-1`, `sample-${root}-2`]
        : `sample-${root}`;
      continue;
    }
    const nested: Record<string, unknown> = {};
    for (const subPath of subPaths) {
      nested[subPath] = shape.joined.has(`${root}.${subPath}`)
        ? [`sample-${subPath}-1`, `sample-${subPath}-2`]
        : `sample-${subPath}`;
    }
    vars[root] = nested;
  }
  for (const listName of shape.loops.keys()) {
    if (!(listName in vars)) {
      const itemName = shape.loops.get(listName)!;
      vars[listName] = Array.from({ length: SAMPLE_LIST_LENGTH }, () =>
        buildSampleItem(itemName, shape.loopItemProps.get(itemName)!),
      );
    }
  }
  return vars;
}

function buildEmptyVars(shape: TemplateShape): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const [root, subPaths] of shape.roots) {
    if (shape.loops.has(root)) {
      vars[root] = [];
    } else {
      vars[root] = subPaths.size > 0 ? null : "";
    }
  }
  for (const listName of shape.loops.keys()) {
    vars[listName] = [];
  }
  return vars;
}

function expectClean(rendered: string, label: string) {
  const leftover = rendered.match(UNRENDERED_TEMPLATE_SYNTAX_PATTERN);
  if (leftover) {
    const at = rendered.indexOf(leftover[0]);
    throw new Error(
      `${label}: template syntax left in rendered prompt near: …${rendered.slice(Math.max(0, at - 60), at + 80)}…`,
    );
  }
}

describe("shipped prompt files render without leftover template syntax", () => {
  const files = listPromptFiles(PROMPTS_DIR);

  it("finds the prompt files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files.map((file) => [path.relative(PROMPTS_DIR, file), file]))(
    "%s",
    (label, file) => {
      const template = fs.readFileSync(file, "utf-8");
      const shape = analyseTemplate(template);

      it("renders cleanly with every variable present", () => {
        expectClean(
          renderTemplate(template, buildPresentVars(shape)),
          `${label} (present)`,
        );
      });

      it("renders cleanly with every variable empty", () => {
        expectClean(
          renderTemplate(template, buildEmptyVars(shape)),
          `${label} (empty)`,
        );
      });
    },
  );
});

describe("loaded prompts render with the variables the services pass", () => {
  const signals: PhishingSignals = {
    hasDomainMismatch: true,
    senderDomain: "commbank-secure-verify.xyz",
    linkedDomains: ["commbank-secure-verify.xyz", "bit.ly"],
    suspiciousKeywords: ["account suspended/locked", "urgency language"],
    rawScore: 8,
  };

  it("check_phishing_only substitutes the nested phishing signals and join filters", () => {
    const config = getPrompt(SUMMARY_PROMPT_IDS.CHECK_PHISHING_ONLY)!;
    const rendered = renderPrompt(config.prompt, {
      subject: "Account suspended",
      contextNote: "",
      body: "Verify now",
      phishingSignals: signals,
    });
    expect(rendered).toContain("Sender domain: commbank-secure-verify.xyz");
    expect(rendered).toContain(
      "Domains linked in body: commbank-secure-verify.xyz, bit.ly",
    );
    expect(rendered).toContain("Domain mismatch detected: true");
    expect(rendered).toContain(
      "Suspicious keywords found: account suspended/locked, urgency language",
    );
    expectClean(rendered, "check_phishing_only");
    expectClean(config.systemPrompt, "check_phishing_only system");
    expect(config.systemPrompt).toContain("Default to NOT phishing");
  });

  it.each([
    SUMMARY_PROMPT_IDS.TLDR,
    SUMMARY_PROMPT_IDS.BULLETS,
    SUMMARY_PROMPT_IDS.ACTIONS,
  ])(
    "%s keeps its static instructions in the system block and puts the body last",
    (promptId) => {
      const config = getPrompt(promptId)!;
      expect(config.systemPrompt).toContain("Return a JSON object");
      expect(config.systemPrompt).not.toMatch(/phishing/i);
      expect(config.prompt).not.toMatch(/phishing/i);
      expectClean(config.systemPrompt, `${promptId} system`);

      const received = renderPrompt(config.prompt, {
        isThread: false,
        subject: "Intro",
        body: "Hi Jeremy, meet Priya.",
        isUserSender: false,
        from: "sam@example.com",
        fromName: "Sam Connector",
        userName: "Jeremy Nagel",
        hasExistingActions: true,
        existingActions: "Reply to Sam",
        currentDatetime: "2026-05-22T00:00:00.000Z",
        userTimezone: "Australia/Melbourne",
      });
      expectClean(received, `${promptId} received`);
      expect(received).toContain(
        "RECEIVED by you from Sam Connector (sam@example.com)",
      );
      expect(received).toContain("Reply to Sam");
      expect(received.trim().endsWith("Hi Jeremy, meet Priya.")).toBe(true);

      const thread = renderPrompt(config.prompt, {
        isThread: true,
        subject: "Intro",
        body: "[Message 1] ... --- [Message 2]",
        userName: "",
      });
      expectClean(thread, `${promptId} thread`);
      expect(thread).toContain("email THREAD");
      expect(thread).not.toContain("Account owner");
    },
  );
});
