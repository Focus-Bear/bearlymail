import { WritingStyleLearningService } from "./writing-style-learning.service";

/**
 * Guards the three cost controls on writing-example collection:
 *  1. Once the user has the full set of examples, no LLM validation runs.
 *  2. A single collection run is bounded to a fixed number of LLM calls, so a
 *     large batch of mostly-rejected sent emails can't burn one call per email.
 *  3. Snippets already covered by a stored example are skipped BEFORE the LLM
 *     call — otherwise users stuck below the target count re-validate the same
 *     recent sent emails on every scheduled run.
 */
describe("WritingStyleLearningService — validation cost controls", () => {
  let service: WritingStyleLearningService;
  let usersService: { findOne: jest.Mock; update: jest.Mock };
  let llmService: { validateWritingExample: jest.Mock };

  const humanBody =
    "Hi team, quick update on the launch — the reply copy is ready and I have " +
    "looped in design for the final review before we ship on Friday afternoon.";

  beforeEach(() => {
    usersService = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    llmService = { validateWritingExample: jest.fn() };
    service = new WritingStyleLearningService(
      {} as never,
      usersService as never,
      llmService as never,
    );
  });

  it("makes no LLM validation calls when the user already has 20 examples", async () => {
    const rules = Array.from({ length: 20 }, (_, i) => `Example ${i}: writing`);
    usersService.findOne.mockResolvedValue({ toneSettings: { rules } });

    await service.learnFromSentEmailBodies("user-1", [
      humanBody,
      humanBody,
      humanBody,
    ]);

    expect(llmService.validateWritingExample).not.toHaveBeenCalled();
    expect(usersService.update).not.toHaveBeenCalled();
  });

  it("caps LLM validation attempts per run for a large rejected batch", async () => {
    usersService.findOne.mockResolvedValue({ toneSettings: { rules: [] } });
    // Every candidate is rejected by the LLM.
    llmService.validateWritingExample.mockResolvedValue(null);

    await service.learnFromSentEmailBodies(
      "user-1",
      Array.from({ length: 50 }, () => humanBody),
    );

    // Bounded — not one call per email.
    expect(llmService.validateWritingExample).toHaveBeenCalledTimes(8);
  });

  it("skips LLM validation for snippets already covered by a stored example", async () => {
    // The stored example is the same text the snippet extractor will produce
    // from humanBody, so word overlap is ~100% and the pre-LLM dedup fires.
    usersService.findOne.mockResolvedValue({
      toneSettings: { rules: [`Example: ${humanBody}`] },
    });

    await service.learnFromSentEmailBodies("user-1", [humanBody]);

    expect(llmService.validateWritingExample).not.toHaveBeenCalled();
    expect(usersService.update).not.toHaveBeenCalled();
  });
});
