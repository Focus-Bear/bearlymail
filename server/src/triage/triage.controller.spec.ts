import { Test, TestingModule } from "@nestjs/testing";

import { TriageController } from "./triage.controller";
import { TriageService } from "./triage.service";

describe("TriageController", () => {
  let controller: TriageController;
  let verifyDistractionPhrase: jest.Mock;

  const req = { user: { userId: "user-123" } };

  beforeEach(async () => {
    verifyDistractionPhrase = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TriageController],
      providers: [
        { provide: TriageService, useValue: { verifyDistractionPhrase } },
      ],
    }).compile();

    controller = module.get(TriageController);
  });

  it("returns { verified: true } when the service verifies the transcript", async () => {
    verifyDistractionPhrase.mockResolvedValue(true);

    const result = await controller.verifyDistractionPhrase(req, {
      transcript:
        "distract me with new emails even though I have existing ones",
    });

    expect(result).toEqual({ verified: true });
    expect(verifyDistractionPhrase).toHaveBeenCalledWith(
      "distract me with new emails even though I have existing ones",
      "user-123",
    );
  });

  it("returns { verified: false } when the service rejects the transcript", async () => {
    verifyDistractionPhrase.mockResolvedValue(false);

    const result = await controller.verifyDistractionPhrase(req, {
      transcript: "unrelated speech",
    });

    expect(result).toEqual({ verified: false });
  });
});
