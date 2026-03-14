/**
 * Integration tests for SuggestedRepliesProcessor — thread context (#885)
 *
 * Verifies that when the other party sent the last email,
 * generateReplySuggestions() fetches prior thread messages and passes them
 * to LLMService.generateReplyOptions() so the LLM has full conversation context.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { Email } from "../database/entities/email.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { SuggestedRepliesProcessor } from "./suggested-replies.processor";
import { SuggestedRepliesService } from "./suggested-replies.service";

describe("SuggestedRepliesProcessor — thread context (#885)", () => {
  let processor: SuggestedRepliesProcessor;

  const mockUser: Partial<User> = {
    id: "user-1",
    email: "encrypted-email",
    displayName: "Alex",
    name: "Alex",
    jobTitle: "Engineer",
    toneSettings: { rules: [] } as any,
    calendarBookingUrl: null,
  };

  const latestEmail: Partial<Email> = {
    id: "email-latest",
    emailThreadId: "thread-1",
    userId: "user-1",
    from: "sarah@example.com",
    fromName: "Sarah Chen",
    subject: "Project notes",
    body: "Have you pushed the notes yet?",
    receivedAt: new Date("2026-01-12T10:00:00Z"),
  };

  const priorEmails: Partial<Email>[] = [
    {
      id: "email-1",
      emailThreadId: "thread-1",
      userId: "user-1",
      from: "sarah@example.com",
      fromName: "Sarah Chen",
      body: "Can you share the sprint notes?",
      receivedAt: new Date("2026-01-10T10:00:00Z"),
    },
    {
      id: "email-2",
      emailThreadId: "thread-1",
      userId: "user-1",
      from: "alex@example.com",
      fromName: "Alex",
      body: "Sure, I'll push by end of week.",
      receivedAt: new Date("2026-01-11T09:00:00Z"),
    },
    {
      id: "email-latest",
      emailThreadId: "thread-1",
      userId: "user-1",
      from: "sarah@example.com",
      fromName: "Sarah Chen",
      body: "Have you pushed the notes yet?",
      receivedAt: new Date("2026-01-12T10:00:00Z"),
    },
  ];

  let mockEmailRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
  };

  let mockLLMService: {
    generateReplyOptions: jest.Mock;
    generateFollowUpDraft: jest.Mock;
  };

  let mockUsersService: { findOne: jest.Mock };
  let mockSuggestedRepliesService: {
    markAsGenerating: jest.Mock;
    saveSuggestedReplies: jest.Mock;
    markAsNotGenerating: jest.Mock;
  };
  let mockCloudWatchService: { recordJobMetrics: jest.Mock };
  let mockBoss: { work: jest.Mock };

  beforeEach(async () => {
    mockEmailRepository = {
      findOne: jest.fn().mockResolvedValue(latestEmail),
      find: jest.fn().mockResolvedValue(priorEmails),
    };

    mockLLMService = {
      generateReplyOptions: jest.fn().mockResolvedValue([
        { label: "Agree", text: "Yes, pushed them." },
        { label: "Defer", text: "Still working on it." },
      ]),
      generateFollowUpDraft: jest.fn().mockResolvedValue("Follow up text"),
    };

    mockUsersService = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    mockSuggestedRepliesService = {
      markAsGenerating: jest.fn().mockResolvedValue(undefined),
      saveSuggestedReplies: jest.fn().mockResolvedValue(undefined),
      markAsNotGenerating: jest.fn().mockResolvedValue(undefined),
    };

    mockCloudWatchService = {
      recordJobMetrics: jest.fn().mockResolvedValue(undefined),
    };

    mockBoss = {
      work: jest.fn().mockResolvedValue(undefined),
    };

    // Stub EncryptionHelper to return a predictable email address
    jest.spyOn(EncryptionHelper, "decrypt").mockReturnValue("alex@example.com");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestedRepliesProcessor,
        { provide: "PG_BOSS", useValue: mockBoss },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        { provide: LLMService, useValue: mockLLMService },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: SuggestedRepliesService,
          useValue: mockSuggestedRepliesService,
        },
        { provide: CloudWatchService, useValue: mockCloudWatchService },
      ],
    }).compile();

    processor = module.get<SuggestedRepliesProcessor>(
      SuggestedRepliesProcessor,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should pass thread messages to generateReplyOptions when the other party sent the last email", async () => {
    // Access the private method via type cast for testing
    const generateFn = (processor as any).generateReplySuggestions.bind(
      processor,
    );

    const replyContext = {
      userEmail: "alex@example.com",
      userSentLast: false,
      userContext: {
        tone: "professional",
        userName: "Alex",
        userJobTitle: "Engineer",
        emailExamples: [],
        calendarLink: null,
      },
      emailExamples: [],
    };

    await generateFn(
      "worker-1",
      "thread-1",
      "user-1",
      replyContext,
      latestEmail,
    );

    // Repository should have been queried for thread messages.
    // Fetched newest-first (DESC) so `take: 5` captures the most recent messages,
    // then reversed to chronological order before being passed to the LLM prompt.
    expect(mockEmailRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailThreadId: "thread-1", userId: "user-1" },
        order: { receivedAt: "DESC" },
        take: 5,
      }),
    );

    // LLMService.generateReplyOptions should have been called with threadMessages
    expect(mockLLMService.generateReplyOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        from: latestEmail.from,
        subject: latestEmail.subject,
        body: latestEmail.body,
      }),
      // userContext
      expect.any(Object),
      undefined,
      "user-1",
      expect.arrayContaining([
        expect.objectContaining({ from: "sarah@example.com" }),
        expect.objectContaining({ from: "alex@example.com" }),
      ]),
    );
  });
});
