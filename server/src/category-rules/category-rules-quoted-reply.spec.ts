import { CompositeCategoryRuleSpecV3 } from "../database/entities/category-rule.entity";
import { buildRuleMatchText } from "../llm/email-content-cleaner";
import {
  EXTERNAL_FROM,
  EXTERNAL_SUBJECT,
  OUTLOOK_REPLY_HTML,
  OUTLOOK_REPLY_PLAIN,
  RESCHEDULE_RULE_BODY_PHRASES,
  RESCHEDULE_RULE_SENDERS,
  RESCHEDULE_RULE_SUBJECT_PHRASES,
  USER_ADDRESS,
  USER_OWN_MESSAGE_PLAIN,
} from "./__fixtures__/quoted-reply.fixture";
import type { EmailMetadata } from "./category-rules.types";
import { evaluateComposite } from "./category-rules-auto-composite.helper";

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

/** The rule as the user saved it: sender AND subject AND body, OR within each. */
const rescheduleRule: CompositeCategoryRuleSpecV3 = {
  v: 3,
  fromMatchesAny: RESCHEDULE_RULE_SENDERS,
  subjectContainsAny: RESCHEDULE_RULE_SUBJECT_PHRASES,
  bodyContainsAny: RESCHEDULE_RULE_BODY_PHRASES,
};

const externalReplyQuotingUser: EmailMetadata = {
  from: EXTERNAL_FROM,
  subject: EXTERNAL_SUBJECT,
  bodyTextForMatch: buildRuleMatchText(OUTLOOK_REPLY_PLAIN, OUTLOOK_REPLY_HTML),
};

describe("composite rule vs an external reply quoting the user's 'sorry'", () => {
  it("does NOT match: the sender is not the user, and the quoted 'sorry' is ignored", () => {
    const { matches, detail } = evaluateComposite(
      rescheduleRule,
      externalReplyQuotingUser,
      normalise,
    );

    expect(matches).toBe(false);
    expect(detail.senderMatch).toBe(false);
    expect(detail.subjectMatch).toBe(true);
    expect(detail.bodyMatch).toBe(false);
    expect(detail.bodyMatchedPhrase).toBeNull();
  });

  it("does NOT match a sender-less variant of the rule either — the body condition alone must not fire on quoted text", () => {
    const subjectAndBodyOnly: CompositeCategoryRuleSpecV3 = {
      ...rescheduleRule,
      fromMatchesAny: ["*@university.example.edu"],
    };
    const { matches, detail } = evaluateComposite(
      subjectAndBodyOnly,
      externalReplyQuotingUser,
      normalise,
    );

    expect(detail.senderMatch).toBe(true);
    expect(detail.bodyMatch).toBe(false);
    expect(matches).toBe(false);
  });

  it("ANDs the condition types: sender, subject and body must all hold", () => {
    const userSentButNoBodyPhrase = evaluateComposite(
      rescheduleRule,
      {
        from: `Jeremy Nagel <${USER_ADDRESS}>`,
        subject: "Re: Focus Bear at Example University",
        bodyTextForMatch: "Here is the document.",
      },
      normalise,
    );
    expect(userSentButNoBodyPhrase.matches).toBe(false);
    expect(userSentButNoBodyPhrase.detail.senderMatch).toBe(true);
    expect(userSentButNoBodyPhrase.detail.bodyMatch).toBe(false);
  });

  it("control: still matches the user's own message the rule was written for", () => {
    const { matches, detail } = evaluateComposite(
      rescheduleRule,
      {
        from: `Jeremy Nagel <${USER_ADDRESS}>`,
        subject: "Re: Focus Bear at Example University",
        bodyTextForMatch: buildRuleMatchText(USER_OWN_MESSAGE_PLAIN, null),
      },
      normalise,
    );

    expect(matches).toBe(true);
    expect(detail.senderMatchedValue).toBe(USER_ADDRESS);
    expect(detail.bodyMatchedPhrase).toBe("sorry");
  });
});
