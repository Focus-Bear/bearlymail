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
  createQueryBuilder: jest.fn(),
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

    const mockQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockContextRepository.createQueryBuilder.mockReturnValue(mockQb);

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

    mockContextRepository.findOne.mockResolvedValue(null);
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

  it("does not save Q&A pairs with frequency below 3", async () => {
    mockLlmService.extractQAndA.mockResolvedValue([
      { question: "Rare question?", answer: "Rare answer.", frequency: 2 },
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
});
