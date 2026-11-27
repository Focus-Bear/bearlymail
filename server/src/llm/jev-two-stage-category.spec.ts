import { JEV, JEV_TWO_STAGE } from "../constants/jev.constants";
import type { JevCategoryAnswer } from "./jev-category-request";
import type { JevRequest } from "./jev-system-one";
import {
  categoriseInTwoStages,
  TWO_STAGE_OUTCOMES,
} from "./jev-two-stage-category";

// Stage-1 options: 1 = GitHub / Issues (QA failed, QA passed), 2 = a
// one-member Newsletters & Marketing family, 3 = "Unplaceable thing", which no
// taxonomy family claims, as its own option.
const PARAMS = {
  subject: "QA done",
  summary: "The fix passed QA",
  userId: "test-user",
  categories: [
    { name: "Github QA failed issues", description: "QA rejected the fix" },
    { name: "Newsletters" },
    { name: "Github QA passed issues", description: "QA verified the fix" },
    { name: "Unplaceable thing" },
  ],
};
const MODEL = JEV.DEFAULT_MODEL;
const HIGH = 0.95;
const LOW = 0.5;

const answer = (choice: string, confidence: number): JevCategoryAnswer => ({
  type: JEV.QUESTION_TYPE,
  choice,
  confidence,
  probabilities: { [choice]: confidence },
});

function setup(...answers: JevCategoryAnswer[]) {
  const requests: Array<{ request: JevRequest; questionId: string }> = [];
  const askJev = jest.fn((request: JevRequest, questionId: string) => {
    requests.push({ request, questionId });
    const next = answers.shift();
    if (!next) throw new Error("unexpected Jev call");
    return Promise.resolve(next);
  });
  const logger = { log: jest.fn() };
  const run = () =>
    categoriseInTwoStages({ params: PARAMS, model: MODEL, askJev, logger });
  return { askJev, logger, requests, run };
}

describe("categoriseInTwoStages", () => {
  it("picks the family, then the category within it, numbered against the full list", async () => {
    const { run, requests, logger } = setup(
      answer("1", HIGH),
      answer("2", 0.9),
    );
    const outcome = await run();

    expect(outcome).toEqual({
      kind: TWO_STAGE_OUTCOMES.ACCEPTED,
      result: expect.objectContaining({
        categoryNumber: 3,
        categoryName: "Github QA passed issues",
        categoryConfidence: "HIGH",
      }),
    });
    expect(requests.map((call) => call.questionId)).toEqual([
      JEV_TWO_STAGE.FAMILY_QUESTION_ID,
      JEV.QUESTION_ID,
    ]);
    // Stage 2 offers only the family's members (plus Other).
    expect(
      Object.keys(
        requests[1].request.questions[JEV.QUESTION_ID].criteria ?? {},
      ),
    ).toEqual(["0", "1", "2"]);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(
        /decision=categorise_summary_two_stage outcome=accepted .* options=4 .*stage=family/,
      ),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(/options=3 .*stage=category/),
    );
  });

  it("decides a one-member option in stage 1 alone", async () => {
    const { run, askJev } = setup(answer("2", HIGH));
    const outcome = await run();

    expect(askJev).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      kind: TWO_STAGE_OUTCOMES.ACCEPTED,
      result: expect.objectContaining({
        categoryNumber: 2,
        categoryName: "Newsletters",
      }),
    });
  });

  it("keeps an unfamilied category reachable as its own option", async () => {
    const { run } = setup(answer("3", HIGH));
    const outcome = await run();
    expect(outcome).toEqual({
      kind: TWO_STAGE_OUTCOMES.ACCEPTED,
      result: expect.objectContaining({ categoryName: "Unplaceable thing" }),
    });
  });

  it("declines at an unsure family without naming a category or asking stage 2", async () => {
    const { run, askJev } = setup(answer("1", LOW));
    const outcome = await run();

    expect(askJev).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({
      kind: TWO_STAGE_OUTCOMES.DECLINED,
      pick: {
        categoryName: null,
        confidence: LOW,
        family: { family: "GitHub / Issues", confidence: LOW },
        decision: JEV_TWO_STAGE.DECISION,
      },
    });
  });

  it("hands the family's categories to the fallback when stage 2 is unsure", async () => {
    const { run } = setup(answer("1", HIGH), answer("1", LOW));
    const outcome = await run();

    expect(outcome).toEqual({
      kind: TWO_STAGE_OUTCOMES.DECLINED,
      pick: expect.objectContaining({
        categoryName: "Github QA failed issues",
        confidence: LOW,
        narrowToCategoryNames: [
          "Github QA failed issues",
          "Github QA passed issues",
        ],
      }),
    });
  });

  it("does not trust the family when stage 2 says none of its categories fit", async () => {
    const { run } = setup(answer("1", HIGH), answer(JEV.OTHER_OPTION, HIGH));
    expect(await run()).toEqual({
      kind: TWO_STAGE_OUTCOMES.DECLINED,
      pick: null,
    });
  });

  it("accepts a confident Other in stage 1 and declines an unsure one", async () => {
    expect(await setup(answer(JEV.OTHER_OPTION, HIGH)).run()).toEqual({
      kind: TWO_STAGE_OUTCOMES.ACCEPTED,
      result: expect.objectContaining({
        categoryNumber: 0,
        categoryName: JEV.OTHER_CATEGORY,
      }),
    });
    expect(await setup(answer(JEV.OTHER_OPTION, LOW)).run()).toEqual({
      kind: TWO_STAGE_OUTCOMES.DECLINED,
      pick: null,
    });
  });
});
