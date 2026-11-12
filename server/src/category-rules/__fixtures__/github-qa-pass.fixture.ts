/**
 * Two GitHub notifications from ONE issue thread, modelled on a real
 * mis-filing: the issue was closed by a merged PR (first email), then a tester
 * posted a QA report whose verdict was "Pass ✅" (second email). A coarse
 * "status updates" rule matched the first email; the thread kept that label
 * after the QA pass arrived. Shapes (sender, subject, body headings) are real;
 * every name, login and repository is invented.
 */
import type { CompositeCategoryRuleSpecV3 } from "../../database/entities/category-rule.entity";

export const GITHUB_SENDER = "notifications@github.com";
const ISSUE_URL = "https://github.com/Example-Org/Example-App/issues/3110";

export const ISSUE_SUBJECT =
  "Re: [Example-Org/Example-App] Blank web views never recover when WebKit's content process ends (Issue #3110)";

export const CLOSED_FROM = `Max Maintainer <${GITHUB_SENDER}>`;
export const CLOSED_RECEIVED_AT = new Date("2026-11-05T10:11:25Z");
export const CLOSED_BODY = [
  "Closed #3110 as completed via #3126.",
  "",
  "—",
  "Reply to this email directly, view it on GitHub:",
  `${ISSUE_URL}#event-1`,
  "You are receiving this because you authored the thread.",
  "",
  "Message ID: <Example-Org/Example-App/issues/3110/issue_event/1@github.com>",
].join("\n");

export const QA_PASS_FROM = `Tess Tester <${GITHUB_SENDER}>`;
export const QA_PASS_RECEIVED_AT = new Date("2026-11-10T10:29:04Z");
export const QA_PASS_BODY = [
  "tess-tester left a comment (Example-Org/Example-App#3110)",
  "",
  "## Test Environment",
  "",
  "Device: MacBook Air M1",
  "OS: macOS Tahoe 26.5.2",
  "App Version: 3.36.581",
  "",
  "---",
  "",
  "## Result",
  "3/3 Test Cases Passed",
  "",
  "---",
  "",
  "## QA Status",
  "Pass ✅",
  "",
  "---",
  "",
  "## Test Objective",
  "Verify that the affected web views display a Retry button after their WebKit content process terminates.",
  "",
  "—",
  "Reply to this email directly, view it on GitHub:",
  `${ISSUE_URL}#issuecomment-1`,
  "You are receiving this because you authored the thread.",
  "",
  "Message ID: <Example-Org/Example-App/issues/3110/1@github.com>",
].join("\n");

/**
 * The coarse rule behind "Human GitHub issue status updates" (whose category
 * description says "exclude QA comments"): GitHub sender, "Issue" in the
 * subject, and a status-change body phrase.
 */
export const STATUS_UPDATE_RULE: CompositeCategoryRuleSpecV3 = {
  v: 3,
  fromMatchesAny: [GITHUB_SENDER, "*@github.com"],
  subjectContainsAny: ["Issue"],
  bodyContainsAny: ["Closed #", "working on"],
};

/** A "QA passed" rule pinned to the project board status a tester sets. */
export const QA_PASSED_BOARD_RULE: CompositeCategoryRuleSpecV3 = {
  v: 3,
  fromMatchesAny: ["*@github.com"],
  subjectContainsAny: ["Issue #"],
  bodyContainsAny: [],
  githubProjectStatusAny: [{ status: "QA Passed/Done" }],
};
