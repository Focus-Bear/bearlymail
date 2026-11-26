import { QA_EXTRACTION } from "../constants/llm-constants";
import {
  type ExtractedQaCluster,
  QA_ANSWER_KINDS,
} from "../llm/qa-extraction-response";
import {
  buildFixtureInboundMessages,
  buildFixtureSentReplies,
  QA_FIXTURE_THREADS,
  QA_FIXTURE_USER_ALIAS,
  QA_FIXTURE_USER_EMAIL,
} from "../test/helpers/qa-mailbox.fixtures";
import {
  buildQaCandidatePairs,
  countDistinctAskers,
  formatQaPairsForPrompt,
  isAgentInstruction,
  isAnswerGroundedInReplies,
  isMachineMail,
  isThreadPointerQuestion,
  looksLikeQuestion,
  type QaCandidatePair,
  verifyQaClusters,
} from "./qa-candidates.helpers";

const USER_ADDRESSES = new Set([
  QA_FIXTURE_USER_EMAIL,
  "bookings@sunnypaws.example",
]);

function buildPairs(
  automatedReplyThreadIds: Set<string> = new Set([
    QA_FIXTURE_THREADS.HOURS_GRACE_AUTO_REPLIED,
  ]),
): QaCandidatePair[] {
  return buildQaCandidatePairs({
    sentReplies: buildFixtureSentReplies(),
    inboundMessages: buildFixtureInboundMessages(),
    userAddresses: USER_ADDRESSES,
    automatedReplyThreadIds,
  });
}

function pairIdsFor(pairs: QaCandidatePair[], subjects: string[]): number[] {
  return pairs
    .filter((pair) => subjects.includes(pair.subject))
    .map((pair) => pair.id);
}

describe("isMachineMail", () => {
  it.each([
    ["newsletter@petsupplies.example", "Is your dog ready for winter?"],
    ["orders@groomsupply.example", "Thanks for shopping with us"],
    ["noreply@bank.example", "Hello"],
    ["Ivy Chen <ivy@example.org>", "Invitation: Supplier catch-up @ Tue"],
    ["Jo <jo@example.org>", "Automatic reply: Holiday"],
    ["Kim <kim@example.org>", "Your order confirmation #4411"],
  ])("treats %s / %s as machine mail", (from, subject) => {
    expect(isMachineMail(from, subject)).toBe(true);
  });

  it("keeps a person writing back on a receipt thread", () => {
    expect(
      isMachineMail("Erin Walsh <erin@example.com>", "Re: Your order #1234"),
    ).toBe(false);
  });

  it("keeps an ordinary question from a person", () => {
    expect(
      isMachineMail("chloe@example.net", "Statement of work for the website"),
    ).toBe(false);
  });
});

describe("looksLikeQuestion", () => {
  it.each([
    "How much is a full groom?",
    "Could you send me your price list",
    "Please let me know if Saturday works",
    "I was wondering whether you groom cats",
  ])("accepts %s", (text) => {
    expect(looksLikeQuestion(text)).toBe(true);
  });

  it.each([
    "Attached is the signed vaccination form.",
    "Thanks, see you on Saturday.",
  ])("rejects %s", (text) => {
    expect(looksLikeQuestion(text)).toBe(false);
  });
});

describe("buildQaCandidatePairs", () => {
  it("keeps only real questions from people that the user answered with substance", () => {
    const pairs = buildPairs();

    expect(pairs.map((pair) => pair.subject).sort()).toEqual(
      [
        "Parking",
        "Parking again",
        "Price for a big dog",
        "Re: Your order #1234",
        "Saturday grooming?",
        "Weekend hours",
      ].sort(),
    );
  });

  it("pairs each reply with the question it answered, not the reply alone", () => {
    const weekend = buildPairs().find(
      (pair) => pair.subject === "Saturday grooming?",
    );

    expect(weekend?.question).toContain("appointments on Saturdays");
    expect(weekend?.reply).toContain("open Saturdays 9am to 3pm");
  });

  it("gives the same person the same label and never exposes their address", () => {
    const pairs = buildPairs();
    const danPairs = pairs.filter((pair) => pair.subject.startsWith("Parking"));

    expect(new Set(danPairs.map((pair) => pair.askerLabel)).size).toBe(1);
    expect(countDistinctAskers(pairs)).toBe(5);
    const promptText = formatQaPairsForPrompt(pairs);
    expect(promptText).not.toMatch(/@example\.(com|org|net)/);
    expect(promptText).toContain(`[${danPairs[0].id}] Asked by: Person`);
  });

  it("drops threads the auto-responder replied in", () => {
    const withoutAutoReplies = buildPairs(new Set());
    const withAutoReplies = buildPairs();

    expect(
      withoutAutoReplies.some((pair) => pair.subject === "Opening hours"),
    ).toBe(true);
    expect(
      withAutoReplies.some((pair) => pair.subject === "Opening hours"),
    ).toBe(false);
  });

  it("ignores a message that arrived after the reply", () => {
    const pairs = buildQaCandidatePairs({
      sentReplies: [
        {
          threadId: "t-late",
          subject: "Re: Grooming",
          body: "Yes, we groom cats on Tuesdays and Thursdays by appointment only.",
          receivedAt: new Date("2026-10-01T09:00:00Z"),
        },
      ],
      inboundMessages: [
        {
          threadId: "t-late",
          from: "late@example.com",
          subject: "Grooming",
          body: "Do you groom cats?",
          receivedAt: new Date("2026-10-01T10:00:00Z"),
        },
      ],
      userAddresses: USER_ADDRESSES,
      automatedReplyThreadIds: new Set(),
    });

    expect(pairs).toEqual([]);
  });

  it("does not treat the user's own earlier message (from an alias) as the question", () => {
    const pairs = buildQaCandidatePairs({
      sentReplies: [
        {
          threadId: "t-alias",
          subject: "Re: Reminder",
          body: "Following up on my note below about the holiday closure dates for everyone.",
          receivedAt: new Date("2026-10-02T09:00:00Z"),
        },
      ],
      inboundMessages: [
        {
          threadId: "t-alias",
          from: QA_FIXTURE_USER_ALIAS,
          subject: "Reminder",
          body: "Can everyone confirm their December bookings?",
          receivedAt: new Date("2026-10-01T09:00:00Z"),
        },
      ],
      userAddresses: USER_ADDRESSES,
      automatedReplyThreadIds: new Set(),
    });

    expect(pairs).toEqual([]);
  });

  it("uses one pair per thread so a long back-and-forth counts once", () => {
    const question = {
      threadId: "t-long",
      from: "pat@example.com",
      subject: "Booking",
      body: "Can I book a bath for Luna next week?",
      receivedAt: new Date("2026-10-01T09:00:00Z"),
    };
    const reply = (hour: number) => ({
      threadId: "t-long",
      subject: "Re: Booking",
      body: "Yes, Luna is booked in for a bath next Wednesday at 10am with Sam.",
      receivedAt: new Date(`2026-10-01T${hour}:00:00Z`),
    });

    const pairs = buildQaCandidatePairs({
      sentReplies: [reply(10), reply(11), reply(12)],
      inboundMessages: [question],
      userAddresses: USER_ADDRESSES,
      automatedReplyThreadIds: new Set(),
    });

    expect(pairs).toHaveLength(1);
  });

  it(`stops at ${QA_EXTRACTION.MAX_PAIRS_PER_RUN} pairs`, () => {
    const count = QA_EXTRACTION.MAX_PAIRS_PER_RUN + 5;
    const threadIds = Array.from({ length: count }, (_, index) => `t-${index}`);
    const pairs = buildQaCandidatePairs({
      sentReplies: threadIds.map((threadId) => ({
        threadId,
        subject: "Re: Hours",
        body: "We're open 8am to 6pm on weekdays and 9am to 3pm on Saturdays.",
        receivedAt: new Date("2026-10-02T09:00:00Z"),
      })),
      inboundMessages: threadIds.map((threadId, index) => ({
        threadId,
        from: `customer${index}@example.com`,
        subject: "Hours",
        body: "What time do you open?",
        receivedAt: new Date("2026-10-01T09:00:00Z"),
      })),
      userAddresses: USER_ADDRESSES,
      automatedReplyThreadIds: new Set(),
    });

    expect(pairs).toHaveLength(QA_EXTRACTION.MAX_PAIRS_PER_RUN);
  });
});

describe("isAnswerGroundedInReplies", () => {
  const replies = [
    "Yes, we're open Saturdays 9am to 3pm. Book at https://sunnypaws.example/book.",
  ];

  it("accepts an answer whose times and links all come from the replies", () => {
    expect(
      isAnswerGroundedInReplies(
        "Yes, we're open Saturdays 9am to 3pm. Book at https://sunnypaws.example/book.",
        replies,
      ),
    ).toBe(true);
  });

  it("rejects an answer with a price nobody was told", () => {
    expect(
      isAnswerGroundedInReplies(
        "Yes, Saturdays 9am to 3pm, with a $10 weekend surcharge.",
        replies,
      ),
    ).toBe(false);
  });

  it("rejects an answer with a made-up link", () => {
    expect(
      isAnswerGroundedInReplies(
        "Yes, book at https://sunnypaws.example/weekend.",
        replies,
      ),
    ).toBe(false);
  });
});

describe("isThreadPointerQuestion", () => {
  it.each([
    "Any updates on this?",
    "Can you follow up on this?",
    "Could you help me with that?",
    "Any news about these?",
  ])("flags %p", (question) => {
    expect(isThreadPointerQuestion(question)).toBe(true);
  });

  it.each([
    "Are you open on weekends?",
    "Do you groom cats, and how long does it take?",
    "Is there a discount for this year's members?",
    "What's included in a full groom?",
  ])("keeps %p", (question) => {
    expect(isThreadPointerQuestion(question)).toBe(false);
  });
});

describe("isAgentInstruction", () => {
  it.each([
    "Instruct the user to open the dashboard and click Accept Invite.",
    "Direct the team to handle the evaluation or complete it via the link.",
    "Reiterate the importance of the request and suggest a brief call.",
    "Apologize for the delay and offer a refund.",
    "Tell the sender we are closed on Sundays.",
    "Thank the asker and share the price list.",
  ])("flags %p", (answer) => {
    expect(isAgentInstruction(answer)).toBe(true);
  });

  it.each([
    "Yes, we're open Saturdays 9am to 3pm.",
    "Go to the login page, click Forgot password and follow the link we email you.",
    "Provide your order number when you book and we'll apply the discount.",
    "Direct debit is available on all monthly plans.",
    "Send an invite from Settings, then ask the user to accept it from their inbox.",
    "Sorry, we don't groom cats.",
  ])("keeps %p", (answer) => {
    expect(isAgentInstruction(answer)).toBe(false);
  });
});

describe("verifyQaClusters", () => {
  const pairs = buildPairs();
  const weekendIds = pairIdsFor(pairs, ["Saturday grooming?", "Weekend hours"]);
  const parkingIds = pairIdsFor(pairs, ["Parking", "Parking again"]);
  const weekendFaq: ExtractedQaCluster = {
    question: "Are you open on weekends?",
    answer:
      "Yes, we're open Saturdays 9am to 3pm. You can book online at https://sunnypaws.example/book.",
    pairIds: weekendIds,
    answerKind: QA_ANSWER_KINDS.REUSABLE,
    confidence: 0.92,
  };

  it("keeps a question two different people asked, counting askers from our own data", () => {
    expect(verifyQaClusters([weekendFaq], pairs)).toEqual([
      {
        question: weekendFaq.question,
        answer: weekendFaq.answer,
        askerCount: 2,
      },
    ]);
  });

  it("drops a question only one person asked, however often", () => {
    const parking: ExtractedQaCluster = {
      question: "Is there parking nearby?",
      answer: "Yes, there's free two-hour parking out front on Elm Street.",
      pairIds: parkingIds,
      answerKind: QA_ANSWER_KINDS.REUSABLE,
      confidence: 0.95,
    };

    expect(verifyQaClusters([parking], pairs)).toEqual([]);
  });

  it("drops a cluster whose pair ids do not exist", () => {
    expect(
      verifyQaClusters([{ ...weekendFaq, pairIds: [98, 99] }], pairs),
    ).toEqual([]);
  });

  it("drops a cluster the model was unsure about", () => {
    const unsure = {
      ...weekendFaq,
      confidence: QA_EXTRACTION.MIN_CONFIDENCE - 0.1,
    };

    expect(verifyQaClusters([unsure], pairs)).toEqual([]);
  });

  it("drops an answer with a fact the user never wrote", () => {
    const invented = {
      ...weekendFaq,
      answer: "Yes, Saturdays and Sundays 9am to 5pm.",
    };

    expect(verifyQaClusters([invented], pairs)).toEqual([]);
  });

  it.each([
    QA_ANSWER_KINDS.THREAD_DEPENDENT,
    QA_ANSWER_KINDS.CASE_SPECIFIC,
    QA_ANSWER_KINDS.DESCRIBES_ACTION,
  ])("drops a cluster the model judged %s", (answerKind) => {
    expect(verifyQaClusters([{ ...weekendFaq, answerKind }], pairs)).toEqual(
      [],
    );
  });

  it("drops a question that points back into its thread, whatever the model said", () => {
    const nudge = { ...weekendFaq, question: "Any updates on this?" };

    expect(verifyQaClusters([nudge], pairs)).toEqual([]);
  });

  it("drops an answer written as an instruction to an agent, whatever the model said", () => {
    const instruction = {
      ...weekendFaq,
      answer: "Instruct the user to book a Saturday slot online.",
    };

    expect(verifyQaClusters([instruction], pairs)).toEqual([]);
  });

  it.each([
    ["is not phrased as a question", "Weekend opening hours"],
    [
      "is too long",
      `Are you open on weekends ${"and holidays ".repeat(QA_EXTRACTION.MAX_QUESTION_CHARS)}?`,
    ],
  ])("drops a question that %s", (_reason, question) => {
    expect(verifyQaClusters([{ ...weekendFaq, question }], pairs)).toEqual([]);
  });
});
