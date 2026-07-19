import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";

const mockContextRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockLlmService = {
  extractQAndA: jest.fn(),
};

const mockPiiRedactionService = {
  redactPII: jest.fn((value: string) => value),
  areContextValuesSimilar: jest.fn().mockReturnValue(false),
};

describe("ContextQaExtractionService", () => {
  let service: ContextQaExtractionService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: no existing Q&A in DB
    mockContextRepository.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextQaExtractionService,
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockContextRepository,
        },
        { provide: LLMService, useValue: mockLlmService },
        {
          provide: ContextPiiRedactionService,
          useValue: mockPiiRedactionService,
        },
      ],
    }).compile();

    service = module.get<ContextQaExtractionService>(
      ContextQaExtractionService,
    );
  });

  it("saves new Q&A pairs with Source.UNAPPROVED", async () => {
    mockLlmService.extractQAndA.mockResolvedValue([
      {
        question: "What is your return policy?",
        answer: "30 days no questions asked.",
        frequency: 5,
      },
    ]);

    const createdContext = {
      userId: "user1",
      contextKey: ContextKey.Q_AND_A,
      contextValue:
        "Q: What is your return policy? | A: 30 days no questions asked.",
      source: Source.UNAPPROVED,
    };
    mockContextRepository.create.mockReturnValue(createdContext);
    mockContextRepository.save.mockResolvedValue(createdContext);

    await service.extractQAndAFromSentEmails("user1", [
      mockPartial({
        subject: "Re: Return",
        body: "30 days no questions asked.",
        htmlBody: null,
        receivedAt: new Date(),
      }),
    ]);

    expect(mockContextRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: Source.UNAPPROVED }),
    );
  });

  it("does not save Q&A pairs with frequency below the minimum", async () => {
    mockLlmService.extractQAndA.mockResolvedValue([
      { question: "Rare question?", answer: "Rare answer.", frequency: 1 },
    ]);

    await service.extractQAndAFromSentEmails("user1", [
      mockPartial({
        subject: "Test",
        body: "Rare answer.",
        htmlBody: null,
        receivedAt: new Date(),
      }),
    ]);

    expect(mockContextRepository.create).not.toHaveBeenCalled();
  });

  it("saves a Q&A pair that appears exactly twice (at the minimum frequency)", async () => {
    mockLlmService.extractQAndA.mockResolvedValue([
      {
        question: "When will you send the update?",
        answer: "By Friday.",
        frequency: 2,
      },
    ]);
    const createdContext = mockPartial<UserContext>({
      userId: "user1",
      contextKey: ContextKey.Q_AND_A,
      contextValue: "Q: When will you send the update? | A: By Friday.",
      source: Source.UNAPPROVED,
    });
    mockContextRepository.create.mockReturnValue(createdContext);
    mockContextRepository.save.mockResolvedValue(createdContext);

    await service.extractQAndAFromSentEmails("user1", [
      mockPartial({
        subject: "Re: update",
        body: "By Friday.",
        htmlBody: null,
        receivedAt: new Date(),
      }),
    ]);

    expect(mockContextRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: Source.UNAPPROVED }),
    );
  });

  it("deduplicates Q&A against existing entries without using findOne on encrypted column", async () => {
    // Simulate an existing Q&A already stored (plaintext — as returned after decryption)
    const existingQA = mockPartial<UserContext>({
      contextId: "existing-qa-id",
      userId: "user1",
      contextKey: ContextKey.Q_AND_A,
      contextValue: "Q: What is your timezone? | A: UTC+8",
      source: Source.UNAPPROVED,
      lastModified: new Date("2024-01-01"),
    });
    mockContextRepository.find.mockResolvedValue([existingQA]);

    mockLlmService.extractQAndA.mockResolvedValue([
      // Same Q&A as existing — should be deduped (update existing, not create)
      { question: "What is your timezone?", answer: "UTC+8", frequency: 5 },
    ]);

    mockContextRepository.save.mockResolvedValue(existingQA);

    await service.extractQAndAFromSentEmails("user1", [
      mockPartial({
        subject: "Re: timezone",
        body: "UTC+8",
        htmlBody: null,
        receivedAt: new Date(),
      }),
    ]);

    // Should NOT call findOne (the broken path)
    expect(mockContextRepository.findOne).not.toHaveBeenCalled();
    // Should NOT create a new entry (it's a duplicate)
    expect(mockContextRepository.create).not.toHaveBeenCalled();
    // Should update the existing entity's lastModified
    expect(mockContextRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: "existing-qa-id" }),
    );
  });

  it("uses repository.find() instead of createQueryBuilder to load existing Q&As", async () => {
    // Return at least one result so the service proceeds to load existing Q&As
    mockLlmService.extractQAndA.mockResolvedValue([
      { question: "Any question?", answer: "Any answer.", frequency: 5 },
    ]);
    const createdContext = mockPartial<UserContext>({
      userId: "user1",
      contextKey: ContextKey.Q_AND_A,
      contextValue: "Q: Any question? | A: Any answer.",
      source: Source.UNAPPROVED,
    });
    mockContextRepository.create.mockReturnValue(createdContext);
    mockContextRepository.save.mockResolvedValue(createdContext);

    await service.extractQAndAFromSentEmails("user1", [
      mockPartial({
        subject: "Test",
        body: "body",
        htmlBody: null,
        receivedAt: new Date(),
      }),
    ]);

    // Should use find() — not createQueryBuilder
    expect(mockContextRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contextKey: ContextKey.Q_AND_A }),
      }),
    );
  });
});
