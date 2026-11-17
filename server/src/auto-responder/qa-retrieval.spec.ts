import {
  combineQAConfidence,
  findLeakedQAPairs,
  QA_RETRIEVAL,
  QAPair,
  selectRelevantQAPairs,
  tokenize,
} from "./qa-retrieval";

const REFUND: QAPair = {
  question: "What is your refund policy for the course?",
  answer: "Full refund within 30 days of purchase.",
};
const PRICE: QAPair = {
  question: "How much does the course cost?",
  answer: "It costs $499 with lifetime access.",
};
const HOURS: QAPair = {
  question: "What are your office hours?",
  answer: "Monday to Thursday, 9am to 3pm.",
};
const DISCOUNT: QAPair = {
  question: "Is there a partner discount code?",
  answer: "Partners use code PARTNER-7741 for forty percent off.",
};
const ALL = [REFUND, PRICE, HOURS, DISCOUNT];

describe("tokenize", () => {
  it("drops stop words and short words, and stems plurals", () => {
    expect([...tokenize("What are the refunds for my courses?")]).toEqual([
      "refund",
      "course",
    ]);
  });

  it("keeps short numbers", () => {
    expect(tokenize("within 30 days").has("30")).toBe(true);
  });
});

describe("selectRelevantQAPairs", () => {
  it("selects the pair whose question matches the email", () => {
    const selected = selectRelevantQAPairs(
      ALL,
      "Refunds\nHi, what's your refund policy for the course?",
    );
    expect(selected[0].pair).toBe(REFUND);
    expect(selected[0].score).toBeGreaterThanOrEqual(QA_RETRIEVAL.MIN_SCORE);
  });

  it("returns nothing when no question is relevant", () => {
    expect(
      selectRelevantQAPairs(ALL, "Partnership\nWant to co-host a webinar?"),
    ).toEqual([]);
  });

  it("requires more than one matching term", () => {
    expect(selectRelevantQAPairs(ALL, "Course\nLoved the course!")).toEqual([]);
  });

  it("never returns more than the maximum number of pairs", () => {
    const many: QAPair[] = Array.from({ length: 10 }, (_, i) => ({
      question: `refund policy course ${i}`,
      answer: `answer ${i}`,
    }));
    const selected = selectRelevantQAPairs(many, "refund policy course");
    expect(selected).toHaveLength(QA_RETRIEVAL.MAX_SELECTED_PAIRS);
  });

  it("caps an email stuffed with every question's words at the maximum", () => {
    const stuffed = ALL.map((pair) => pair.question).join(" ");
    expect(selectRelevantQAPairs(ALL, stuffed).length).toBeLessThanOrEqual(
      QA_RETRIEVAL.MAX_SELECTED_PAIRS,
    );
  });
});

describe("findLeakedQAPairs", () => {
  const email = "What's your refund policy for the course?";

  it("accepts an answer built from the selected pair", () => {
    expect(
      findLeakedQAPairs(
        "You can get a full refund within 30 days of purchase.",
        [REFUND],
        [PRICE, HOURS, DISCOUNT],
        email,
      ),
    ).toEqual([]);
  });

  it("flags an answer that reproduces an unselected pair", () => {
    expect(
      findLeakedQAPairs(
        "Full refund within 30 days. Also, partners use code PARTNER-7741 for forty percent off.",
        [REFUND],
        [PRICE, HOURS, DISCOUNT],
        email,
      ),
    ).toEqual([DISCOUNT]);
  });

  it("flags a dump of several unselected pairs", () => {
    const dump = ALL.map((pair) => `${pair.question} ${pair.answer}`).join(
      "\n",
    );
    expect(
      findLeakedQAPairs(dump, [REFUND], [PRICE, HOURS, DISCOUNT], email),
    ).toEqual([PRICE, HOURS, DISCOUNT]);
  });
});

describe("combineQAConfidence", () => {
  it("is the geometric mean of model confidence and retrieval score", () => {
    expect(combineQAConfidence(0.9, 0.9)).toBeCloseTo(0.9);
    expect(combineQAConfidence(1, 0.25)).toBeCloseTo(0.5);
  });

  it("treats invalid or out-of-range model confidence safely", () => {
    expect(combineQAConfidence("high", 1)).toBe(0);
    expect(combineQAConfidence(5, 0.49)).toBeCloseTo(0.7);
    expect(combineQAConfidence(-1, 1)).toBe(0);
  });
});
