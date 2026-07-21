import { Test, TestingModule } from "@nestjs/testing";

import { LLMCoreService } from "../llm/llm-core.service";
import { LLM_OP_VERIFY_DISTRACTION_PHRASE } from "../llm/llm-operations";
import { TriageService } from "./triage.service";

describe("TriageService", () => {
  let service: TriageService;
  let generateText: jest.Mock;

  const USER_ID = "user-123";

  beforeEach(async () => {
    generateText = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriageService,
        { provide: LLMCoreService, useValue: { generateText } },
      ],
    }).compile();

    service = module.get(TriageService);
  });

  describe("verifyDistractionPhrase", () => {
    it("returns true when the LLM reports the phrase verified", async () => {
      generateText.mockResolvedValue('{"verified": true}');

      const result = await service.verifyDistractionPhrase(
        "please distract me with new emails even though I have existing emails",
        USER_ID,
      );

      expect(result).toBe(true);
      expect(generateText).toHaveBeenCalledTimes(1);
      const [request, , userId] = generateText.mock.calls[0];
      expect(request.operation).toBe(LLM_OP_VERIFY_DISTRACTION_PHRASE);
      expect(request.jsonMode).toBe(true);
      // The rendered prompt must include both the transcript and target phrase.
      expect(request.prompt).toContain("distract me with new emails");
      expect(userId).toBe(USER_ID);
    });

    it("returns false when the LLM reports not verified", async () => {
      generateText.mockResolvedValue('{"verified": false}');

      const result = await service.verifyDistractionPhrase(
        "what is the weather today",
        USER_ID,
      );

      expect(result).toBe(false);
    });

    it("tolerates markdown-fenced JSON in the reply", async () => {
      generateText.mockResolvedValue('```json\n{"verified": true}\n```');

      const result = await service.verifyDistractionPhrase(
        "distract me please",
        USER_ID,
      );

      expect(result).toBe(true);
    });

    it("short-circuits to false on an empty transcript without calling the LLM", async () => {
      const result = await service.verifyDistractionPhrase("   ", USER_ID);

      expect(result).toBe(false);
      expect(generateText).not.toHaveBeenCalled();
    });

    it("returns false when the LLM call throws", async () => {
      generateText.mockRejectedValue(new Error("LLM down"));

      const result = await service.verifyDistractionPhrase(
        "distract me with new emails",
        USER_ID,
      );

      expect(result).toBe(false);
    });

    it("returns false when the reply has no JSON object", async () => {
      generateText.mockResolvedValue("I am not sure about that");

      const result = await service.verifyDistractionPhrase(
        "distract me with new emails",
        USER_ID,
      );

      expect(result).toBe(false);
    });
  });
});
