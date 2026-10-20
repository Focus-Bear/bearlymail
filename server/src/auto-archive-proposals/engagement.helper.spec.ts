import {
  classifyEngagement,
  ENGAGEMENT_LEVEL,
  EngagementSignals,
  isLowEngagement,
  isStrongEngagement,
  tallyEngagement,
  wasOpened,
  wilsonUpperBound,
} from "./engagement.helper";

const received = new Date("2026-10-01T09:00:00Z");
const at = (seconds: number) => new Date(received.getTime() + seconds * 1000);

function signals(
  overrides: Partial<EngagementSignals> = {},
): EngagementSignals {
  return {
    receivedAt: received,
    isRead: false,
    openedAt: null,
    archivedAt: null,
    archivedWhileUnread: false,
    archivedByWorkflow: false,
    replied: false,
    starred: false,
    userPriorityOverride: null,
    ...overrides,
  };
}

describe("engagement.helper", () => {
  describe("classifyEngagement", () => {
    it("treats an untouched unread email as ignored", () => {
      expect(classifyEngagement(signals())).toBe(ENGAGEMENT_LEVEL.IGNORED);
    });

    it("treats archived-while-unread as ignored even though archiving marked it read", () => {
      expect(
        classifyEngagement(
          signals({
            isRead: true,
            archivedAt: at(60),
            archivedWhileUnread: true,
          }),
        ),
      ).toBe(ENGAGEMENT_LEVEL.IGNORED);
    });

    it("treats a workflow archive as ignored, not as a read", () => {
      expect(
        classifyEngagement(signals({ isRead: true, archivedByWorkflow: true })),
      ).toBe(ENGAGEMENT_LEVEL.IGNORED);
    });

    it("treats a read it cannot attribute to an archive as engaged (read in Gmail, or legacy)", () => {
      expect(classifyEngagement(signals({ isRead: true }))).toBe(
        ENGAGEMENT_LEVEL.ENGAGED,
      );
    });

    it("treats an open the user stayed on as engaged", () => {
      expect(
        classifyEngagement(
          signals({ isRead: true, openedAt: at(10), archivedAt: at(300) }),
        ),
      ).toBe(ENGAGEMENT_LEVEL.ENGAGED);
    });

    it("treats opened-then-archived-within-seconds as a glance", () => {
      expect(
        classifyEngagement(
          signals({ isRead: true, openedAt: at(10), archivedAt: at(14) }),
        ),
      ).toBe(ENGAGEMENT_LEVEL.GLANCED);
    });

    it.each([
      [{ replied: true }],
      [{ starred: true }],
      [{ userPriorityOverride: 80 }],
    ])("treats %o as strong engagement", (override) => {
      expect(classifyEngagement(signals(override))).toBe(
        ENGAGEMENT_LEVEL.ENGAGED,
      );
      expect(isStrongEngagement(signals(override))).toBe(true);
    });

    it("does not count a lowered priority as engagement", () => {
      expect(isStrongEngagement(signals({ userPriorityOverride: 10 }))).toBe(
        false,
      );
    });
  });

  describe("wasOpened", () => {
    it("is true for BearlyMail opens and unattributed reads only", () => {
      expect(wasOpened(signals({ openedAt: at(5) }))).toBe(true);
      expect(wasOpened(signals({ isRead: true }))).toBe(true);
      expect(
        wasOpened(signals({ isRead: true, archivedWhileUnread: true })),
      ).toBe(false);
    });
  });

  describe("wilsonUpperBound", () => {
    it("matches the closed form for zero successes", () => {
      expect(wilsonUpperBound(0, 20)).toBeCloseTo(0.1611, 3);
      expect(wilsonUpperBound(0, 40)).toBeCloseTo(0.0876, 3);
    });

    it("shrinks as the sample grows and is 1 with no data", () => {
      expect(wilsonUpperBound(0, 5)).toBeGreaterThan(wilsonUpperBound(0, 50));
      expect(wilsonUpperBound(0, 0)).toBe(1);
    });

    it("stays above the observed rate", () => {
      expect(wilsonUpperBound(3, 30)).toBeGreaterThan(0.1);
    });
  });

  describe("isLowEngagement", () => {
    const ignored = (count: number) =>
      Array.from({ length: count }, () => ({
        signals: signals(),
        level: ENGAGEMENT_LEVEL.IGNORED,
      }));

    it("needs enough evidence: 10 never-opened emails are not enough, 20 are", () => {
      expect(isLowEngagement(tallyEngagement(ignored(10)))).toBe(false);
      expect(isLowEngagement(tallyEngagement(ignored(20)))).toBe(true);
    });

    it("is false once the user engages with a meaningful share", () => {
      const mixed = [
        ...ignored(20),
        ...Array.from({ length: 5 }, () => ({
          signals: signals({ openedAt: at(1) }),
          level: ENGAGEMENT_LEVEL.ENGAGED,
        })),
      ];
      expect(isLowEngagement(tallyEngagement(mixed))).toBe(false);
    });
  });
});
