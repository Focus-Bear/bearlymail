import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { Email } from "../database/entities/email.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import type { ExtractedQaCluster } from "../llm/qa-extraction-response";
import { mockPartial } from "../test/helpers/mock-utils";
import {
  buildFixtureInboundMessages,
  buildFixtureSentReplies,
  QA_FIXTURE_THREADS,
  QA_FIXTURE_USER_EMAIL,
} from "../test/helpers/qa-mailbox.fixtures";
import { SentEmailData } from "./context-gmail-data.service";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";

const USER_ID = "user1";
const PAIR_HEADER_PATTERN = /\[(\d+)\] Asked by: [^\n]+\nSubject: ([^\n]+)/g;

const mockContextRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((value: Partial<UserContext>) => value),
  save: jest.fn((value: Partial<UserContext>) => Promise.resolve(value)),
};

const mockEmailRepository = { find: jest.fn() };
const mockAutoResponseLogRepository = { find: jest.fn() };

const mockLlmService = { extractQAndA: jest.fn() };

const mockPiiRedactionService = {
  redactPII: jest.fn((value: string) => value),
  areContextValuesSimilar: jest.fn().mockReturnValue(false),
};

function fixtureSentEmails(): SentEmailData[] {
  return buildFixtureSentReplies().map((reply, index) => ({
    id: `sent-${index}`,
    ...reply,
  }));
}

function fixtureInboundEmails(): Email[] {
  return buildFixtureInboundMessages().map((message) =>
    mockPartial<Email>({ ...message, userId: USER_ID, htmlBody: "" }),
  );
}

/** Maps "Subject" → pair id from the text the model was shown. */
function pairIdsBySubject(pairsText: string): Map<string, number> {
  return new Map(
    [...pairsText.matchAll(PAIR_HEADER_PATTERN)].map((match) => [
      match[2],
      Number(match[1]),
    ]),
  );
}

/** Has the mocked model propose clusters built from the pairs it was given. */
function respondWith(
  buildClusters: (idOf: (subject: string) => number) => ExtractedQaCluster[],
): void {
  mockLlmService.extractQAndA.mockImplementation((pairsText: string) => {
    const ids = pairIdsBySubject(pairsText);
    return Promise.resolve(
      buildClusters((subject) => ids.get(subject) ?? Number.NaN),
    );
  });
}

const WEEKEND_QUESTION = "Are you open on weekends?";
const WEEKEND_ANSWER =
  "Yes, we're open Saturdays 9am to 3pm. You can book online at https://sunnypaws.example/book.";

function weekendCluster(idOf: (subject: string) => number): ExtractedQaCluster {
  return {
    question: WEEKEND_QUESTION,
    answer: WEEKEND_ANSWER,
    pairIds: [idOf("Saturday grooming?"), idOf("Weekend hours")],
    confidence: 0.93,
  };
}

describe("ContextQaExtractionService", () => {
  let service: ContextQaExtractionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockContextRepository.find.mockResolvedValue([]);
    mockEmailRepository.find.mockResolvedValue(fixtureInboundEmails());
    mockAutoResponseLogRepository.find.mockResolvedValue([
      { emailThreadId: `db-${QA_FIXTURE_THREADS.HOURS_GRACE_AUTO_REPLIED}` },
    ]);
    mockLlmService.extractQAndA.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextQaExtractionService,
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockContextRepository,
        },
        { provide: getRepositoryToken(Email), useValue: mockEmailRepository },
        {
          provide: getRepositoryToken(AutoResponseLog),
          useValue: mockAutoResponseLogRepository,
        },
        { provide: LLMService, useValue: mockLlmService },
        {
          provide: ContextPiiRedactionService,
          useValue: mockPiiRedactionService,
        },
      ],
    }).compile();

    service = module.get(ContextQaExtractionService);
  });

  const run = () =>
    service.extractQAndAFromSentEmails(
      USER_ID,
      fixtureSentEmails(),
      QA_FIXTURE_USER_EMAIL,
    );

  it("shows the model each question next to the user's reply, without machine mail or addresses", async () => {
    await run();

    const pairsText = mockLlmService.extractQAndA.mock.calls[0][0] as string;
    expect(pairsText).toContain("appointments on Saturdays");
    expect(pairsText).toContain("User's reply: Hi Alice, yes");
    expect(pairsText).not.toContain("winter");
    expect(pairsText).not.toContain("order confirmation #4411");
    expect(pairsText).not.toContain("Supplier catch-up");
    expect(pairsText).not.toContain("Opening hours");
    expect(pairsText).not.toMatch(/@example\.(com|org|net)/);
  });

  it("saves a question two different people asked, grounded in the user's replies", async () => {
    respondWith((idOf) => [weekendCluster(idOf)]);

    await run();

    expect(mockContextRepository.create).toHaveBeenCalledTimes(1);
    expect(mockContextRepository.create).toHaveBeenCalledWith({
      userId: USER_ID,
      contextKey: ContextKey.Q_AND_A,
      contextValue: `Q: ${WEEKEND_QUESTION} | A: ${WEEKEND_ANSWER}`,
      source: Source.UNAPPROVED,
      explanation: "Asked by 2 different people in your recent emails",
    });
  });

  it("does not save one person's repeated question, a one-off, or an invented answer", async () => {
    respondWith((idOf) => [
      {
        question: "Is there parking nearby?",
        answer: "Yes, there's free two-hour parking out front on Elm Street.",
        pairIds: [idOf("Parking"), idOf("Parking again")],
        confidence: 0.95,
      },
      {
        question: "How much is a full groom for a large dog?",
        answer: "A full groom for a large dog is $95.",
        pairIds: [idOf("Price for a big dog")],
        confidence: 0.9,
      },
      {
        ...weekendCluster(idOf),
        answer: "Yes, every Saturday and Sunday from 8am to 5pm.",
      },
    ]);

    await run();

    expect(mockContextRepository.create).not.toHaveBeenCalled();
  });

  it("skips the model entirely when fewer than two people asked anything", async () => {
    const onlyDanAndANewsletter = new Set<string>([
      QA_FIXTURE_THREADS.PARKING_DAN_1,
      QA_FIXTURE_THREADS.PARKING_DAN_2,
      QA_FIXTURE_THREADS.NEWSLETTER,
    ]);
    mockEmailRepository.find.mockResolvedValue(
      fixtureInboundEmails().filter((email) =>
        onlyDanAndANewsletter.has(email.threadId),
      ),
    );

    await run();

    expect(mockLlmService.extractQAndA).not.toHaveBeenCalled();
  });

  it("does nothing without sent emails", async () => {
    await service.extractQAndAFromSentEmails(
      USER_ID,
      [],
      QA_FIXTURE_USER_EMAIL,
    );

    expect(mockEmailRepository.find).not.toHaveBeenCalled();
    expect(mockLlmService.extractQAndA).not.toHaveBeenCalled();
  });

  it("updates an existing identical Q&A instead of creating a duplicate, without findOne on the encrypted column", async () => {
    const existingQA = mockPartial<UserContext>({
      contextId: "existing-qa-id",
      userId: USER_ID,
      contextKey: ContextKey.Q_AND_A,
      contextValue: `Q: ${WEEKEND_QUESTION} | A: ${WEEKEND_ANSWER}`,
      source: Source.UNAPPROVED,
      lastModified: new Date("2026-01-01"),
    });
    mockContextRepository.find.mockResolvedValue([existingQA]);
    respondWith((idOf) => [weekendCluster(idOf)]);

    await run();

    expect(mockContextRepository.find).toHaveBeenCalledWith({
      where: { userId: USER_ID, contextKey: ContextKey.Q_AND_A },
    });
    expect(mockContextRepository.findOne).not.toHaveBeenCalled();
    expect(mockContextRepository.create).not.toHaveBeenCalled();
    expect(mockContextRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ contextId: "existing-qa-id" }),
    );
  });
});
