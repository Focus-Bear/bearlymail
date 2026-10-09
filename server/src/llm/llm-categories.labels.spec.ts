import { Test } from "@nestjs/testing";

import { LLMCategoriesService } from "./llm-categories.service";
import { LLMCoreService } from "./llm-core.service";
import { LLM_OP_IDENTIFY_CUSTOM_LABELS } from "./llm-operations";

describe("custom-label prompt loading", () => {
  it("sends the registered template and actual labels instead of the prompt ID", async () => {
    const generateText = jest.fn().mockResolvedValue('{"custom_labels":[]}');
    const module = await Test.createTestingModule({
      providers: [
        LLMCategoriesService,
        { provide: LLMCoreService, useValue: { generateText } },
      ],
    }).compile();
    const service = module.get(LLMCategoriesService);

    await service.identifyCustomLabels(["Project Alpha", "INBOX"]);

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Project Alpha, INBOX"),
        operation: LLM_OP_IDENTIFY_CUSTOM_LABELS,
      }),
      undefined,
      undefined,
    );
    expect(generateText.mock.calls[0][0].prompt).toContain(
      "SYSTEM LABELS TO IGNORE",
    );
    expect(generateText.mock.calls[0][0].prompt).not.toContain("{{labels}}");
    await module.close();
  });
});
