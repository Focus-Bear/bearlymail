import { AnalysedEmail } from "./auto-archive-proposals.types";
import { classifyEngagement, EngagementSignals } from "./engagement.helper";
import {
  findClusterCondition,
  PHRASE_FIELD,
  sharedPhrases,
} from "./rule-condition.helper";
import {
  isPrecise,
  matchingEmails,
  simulateRule,
  toWorkflowCondition,
} from "./rule-simulation.helper";

const SENDER = "notifications@example.com";
let counter = 0;

function email(
  subject: string,
  body: string,
  engagement: Partial<EngagementSignals> = {},
): AnalysedEmail {
  counter += 1;
  const signals: EngagementSignals = {
    receivedAt: new Date(Date.UTC(2026, 8, 1) + counter * 60_000),
    isRead: false,
    openedAt: null,
    archivedAt: null,
    archivedWhileUnread: false,
    archivedByWorkflow: false,
    replied: false,
    starred: false,
    userPriorityOverride: null,
    ...engagement,
  };
  return {
    id: `e${counter}`,
    from: SENDER,
    subject,
    body,
    receivedAt: signals.receivedAt,
    signals,
    level: classifyEngagement(signals),
  };
}

const opened = { isRead: true, openedAt: new Date(Date.UTC(2026, 8, 2)) };

const lintFailures = Array.from({ length: 10 }, (_, index) =>
  email(
    `[Acme/app] Run failed: Lint - branch-${index} (abc${index}def)`,
    "Lint: failed",
  ),
);
const reviewRequests = Array.from({ length: 6 }, (_, index) =>
  email(
    `[Acme/app] Feature ${"abcdef"[index]} (PR #${index})`,
    "requested your review",
    opened,
  ),
);

describe("rule-condition.helper", () => {
  describe("sharedPhrases", () => {
    it("keeps only phrases most of the cluster shares", () => {
      const phrases = sharedPhrases(lintFailures, PHRASE_FIELD.SUBJECT);
      expect(phrases).toContain("run failed: lint");
      expect(phrases.some((phrase) => phrase.includes("branch"))).toBe(false);
    });
  });

  describe("findClusterCondition", () => {
    it("prefers the cluster's distinctive words over the prefix it shares with mail the user reads", () => {
      const condition = findClusterCondition(
        lintFailures,
        [...lintFailures, ...reviewRequests],
        SENDER,
      );
      expect(condition).toEqual({
        senderPattern: SENDER,
        subjectPatterns: ["run failed: lint"],
        bodyPatterns: [],
      });
    });

    it("falls back to a body phrase when the subjects have nothing stable in common", () => {
      const errors = [
        "timeout",
        "overflow",
        "segfault",
        "deadlock",
        "leak",
        "panic",
        "abort",
        "hang",
        "corrupt",
        "denied",
      ];
      const alerts = errors.map((error, index) =>
        email(`Alert: ${error}`, `New issue in mobile\nCount ${index}`),
      );
      const important = errors
        .slice(0, 4)
        .map((error) =>
          email(`Alert: ${error}`, "High priority issue in backend", opened),
        );
      expect(
        findClusterCondition(alerts, [...alerts, ...important], SENDER),
      ).toEqual({
        senderPattern: SENDER,
        subjectPatterns: [],
        bodyPatterns: ["new issue in mobile"],
      });
    });

    it("returns null when every candidate would archive mail the user engaged with", () => {
      const twins = Array.from({ length: 10 }, () =>
        email("Weekly digest", "Hello"),
      );
      const engagedTwins = Array.from({ length: 10 }, () =>
        email("Weekly digest", "Hello", { replied: true }),
      );
      expect(
        findClusterCondition(twins, [...twins, ...engagedTwins], SENDER),
      ).toBeNull();
    });
  });

  describe("rule simulation", () => {
    const condition = {
      senderPattern: SENDER,
      subjectPatterns: ["run failed: lint"],
      bodyPatterns: [],
    };

    it("maps a proposal onto a sender + keyword workflow condition", () => {
      expect(toWorkflowCondition(condition)).toEqual({
        fromPatterns: [SENDER],
        subjectPatterns: ["run failed: lint"],
        bodyPatterns: [],
        categories: [],
        priorityLevels: [],
        naturalLanguageCondition: null,
      });
    });

    it("counts what the rule would have archived", () => {
      const { stats } = simulateRule(condition, [
        ...lintFailures,
        ...reviewRequests,
      ]);
      expect(stats).toMatchObject({ matched: 10, engaged: 0, opened: 0 });
    });

    it("never lets a triage-field rule suppress by accident", () => {
      expect(
        matchingEmails(
          { ...toWorkflowCondition(condition), categories: ["x"] },
          lintFailures,
        ),
      ).toEqual([]);
    });

    it("tolerates about zero reads, no replies, and few glances", () => {
      const base = {
        matched: 100,
        engaged: 0,
        strongEngaged: 0,
        glanced: 0,
        opened: 0,
        replied: 0,
        starred: 0,
      };
      expect(isPrecise(base)).toBe(true);
      expect(isPrecise({ ...base, engaged: 2 })).toBe(true);
      expect(isPrecise({ ...base, engaged: 3 })).toBe(false);
      expect(isPrecise({ ...base, engaged: 1, strongEngaged: 1 })).toBe(false);
      expect(isPrecise({ ...base, matched: 40, engaged: 1 })).toBe(false);
      expect(isPrecise({ ...base, glanced: 10 })).toBe(true);
      expect(isPrecise({ ...base, glanced: 11 })).toBe(false);
    });
  });
});
