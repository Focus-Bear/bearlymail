import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import { WorkflowCondition } from "../workflows/types/workflow.types";
import {
  buildRealisticMailbox,
  TEMPLATE_OF,
} from "./__fixtures__/realistic-mailbox.fixture";
import {
  AnalysedEmail,
  ProposalDraft,
  SenderGroup,
} from "./auto-archive-proposals.types";
import { ENGAGEMENT_LEVEL } from "./engagement.helper";
import { analyseSenderGroup } from "./noise-sender-analysis.helper";
import { simulateRule, toWorkflowCondition } from "./rule-simulation.helper";

/**
 * End-to-end over a realistic mailbox (see the fixture): GitHub and Sentry each
 * mix noise the user never opens with mail they read and reply to. The miner
 * must propose rules for the noise only, and every proposal must pass the
 * precision safeguard on held-out mail.
 */

const mailbox = buildRealisticMailbox();

function kindsCaught(group: SenderGroup, draft: ProposalDraft): Set<string> {
  const { matched } = simulateRule(draft.condition, group.emails);
  return new Set(matched.map((email) => TEMPLATE_OF.get(email.id) as string));
}

function engagedCaught(
  group: SenderGroup,
  draft: ProposalDraft,
): AnalysedEmail[] {
  return simulateRule(draft.condition, group.emails).matched.filter(
    (email) => email.level === ENGAGEMENT_LEVEL.ENGAGED,
  );
}

describe("analyseSenderGroup — realistic mailbox", () => {
  describe("GitHub notifications", () => {
    const drafts = analyseSenderGroup(mailbox.github);

    it("proposes archiving the Check Translations CI failures by subject", () => {
      const translation = drafts.find((draft) =>
        kindsCaught(mailbox.github, draft).has("translationCiFailure"),
      );
      expect(translation?.condition).toEqual({
        senderPattern: "notifications@github.com",
        subjectPatterns: ["check translations"],
        bodyPatterns: [],
      });
      expect(kindsCaught(mailbox.github, translation as ProposalDraft)).toEqual(
        new Set(["translationCiFailure"]),
      );
      expect(translation?.evidence.window.matched).toBe(48);
      expect(translation?.evidence.openRate).toBe(0);
    });

    it("never catches review requests, bot comments or the CI runs the user reads", () => {
      const caught = new Set(
        drafts.flatMap((draft) => [...kindsCaught(mailbox.github, draft)]),
      );
      expect(caught.has("reviewRequest")).toBe(false);
      expect(caught.has("botComment")).toBe(false);
      expect(caught.has("buildCiFailure")).toBe(false);
    });

    it("also finds the never-opened Dependabot stream, scoped to its repo", () => {
      const dependabot = drafts.find((draft) =>
        kindsCaught(mailbox.github, draft).has("dependabot"),
      );
      expect(dependabot?.condition.subjectPatterns).toEqual([
        "[focus-bear/bearlymail] bump",
      ]);
    });

    it("passes the precision safeguard: zero engaged emails archived, in-window and held out", () => {
      for (const draft of drafts) {
        expect(engagedCaught(mailbox.github, draft)).toHaveLength(0);
        expect(draft.evidence.window.engaged).toBe(0);
        expect(draft.evidence.window.strongEngaged).toBe(0);
        expect(draft.evidence.window.replied).toBe(0);
        expect(draft.evidence.holdout.engaged).toBe(0);
        expect(draft.evidence.holdout.matched).toBeGreaterThanOrEqual(
          AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_HOLDOUT_MATCHES,
        );
      }
    });
  });

  describe("Sentry alerts", () => {
    const drafts = analyseSenderGroup(mailbox.sentry);

    it("proposes archiving new-issue alerts by their body, since subjects vary per exception", () => {
      expect(drafts).toHaveLength(1);
      expect(drafts[0].condition).toEqual({
        senderPattern: "noreply@md.getsentry.com",
        subjectPatterns: [],
        bodyPatterns: ["new issue in focus-bear-mac"],
      });
      expect(kindsCaught(mailbox.sentry, drafts[0])).toEqual(
        new Set(["macNewIssue"]),
      );
    });

    it("leaves the high-priority alerts the user opens alone", () => {
      expect(engagedCaught(mailbox.sentry, drafts[0])).toHaveLength(0);
      expect(
        kindsCaught(mailbox.sentry, drafts[0]).has("backendHighPriority"),
      ).toBe(false);
    });

    it("does not propose the weekly report: never opened, but too few to be confident", () => {
      expect(kindsCaught(mailbox.sentry, drafts[0]).has("weeklyReport")).toBe(
        false,
      );
    });
  });

  it("proposes nothing for a colleague the user always reads", () => {
    expect(analyseSenderGroup(mailbox.colleague)).toEqual([]);
  });

  it("proposes a sender-wide rule for a digest that is never opened", () => {
    const drafts = analyseSenderGroup(mailbox.digest);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].condition).toEqual({
      senderPattern: "digest@producthunt.com",
      subjectPatterns: [],
      bodyPatterns: [],
    });
  });

  it("stays quiet about a cluster once a dismissed proposal or an archive rule covers it", () => {
    const [translation] = analyseSenderGroup(mailbox.github);
    const dismissed: WorkflowCondition = toWorkflowCondition(
      translation.condition,
    );
    const again = analyseSenderGroup(mailbox.github, [dismissed]);
    expect(
      again.some((draft) =>
        kindsCaught(mailbox.github, draft).has("translationCiFailure"),
      ),
    ).toBe(false);
  });

  it("does not propose a template that stopped arriving (nothing in the held-out slice)", () => {
    // The template only arrived in the first 40% of the window.
    const cutoff =
      mailbox.github.emails[Math.floor(mailbox.github.emails.length * 0.4)]
        .receivedAt;
    const staleTranslation: SenderGroup = {
      ...mailbox.github,
      emails: mailbox.github.emails.filter(
        (email) =>
          TEMPLATE_OF.get(email.id) !== "translationCiFailure" ||
          email.receivedAt < cutoff,
      ),
    };
    const drafts = analyseSenderGroup(staleTranslation);
    expect(
      drafts.some((draft) =>
        kindsCaught(staleTranslation, draft).has("translationCiFailure"),
      ),
    ).toBe(false);
  });

  it("refuses a proposal once the user replies to even one email it would catch", () => {
    const firstTranslation = mailbox.github.emails.find(
      (email) => TEMPLATE_OF.get(email.id) === "translationCiFailure",
    ) as AnalysedEmail;
    const emails = mailbox.github.emails.map((email) =>
      email === firstTranslation
        ? {
            ...email,
            signals: { ...email.signals, replied: true },
            level: ENGAGEMENT_LEVEL.ENGAGED,
          }
        : email,
    );
    const drafts = analyseSenderGroup({ ...mailbox.github, emails });
    for (const draft of drafts) {
      expect(simulateRule(draft.condition, emails).stats.strongEngaged).toBe(0);
    }
    expect(
      drafts.some((draft) =>
        simulateRule(draft.condition, emails).matched.includes(
          firstTranslation,
        ),
      ),
    ).toBe(false);
  });

  it("ignores senders below the heavy-sender volume", () => {
    const light: SenderGroup = {
      ...mailbox.digest,
      emails: mailbox.digest.emails.slice(
        0,
        AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_SENDER_VOLUME - 1,
      ),
    };
    expect(analyseSenderGroup(light)).toEqual([]);
  });
});
