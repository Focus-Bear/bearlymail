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
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { LLMService } from "../llm/llm.service";
import { mockPartial } from "../test/helpers/mock-utils";
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
    toneSettings: mockPartial({ rules: [] }),
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
        {
          // withUserKey runs the callback directly (per-user key context is
          // exercised in user-encryption.service.spec); here we just pass through.
          provide: UserEncryptionService,
          useValue: {
            withUserKey: jest.fn((_userId: string, fn: () => unknown) => fn()),
          },
        },
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
    const generateFn = processor.generateReplySuggestions.bind(processor);

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

    // Repository should have been queried for thread messages (DESC for recency, take: 5).
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
      expect.any(Object),
      undefined,
      "user-1",
      expect.arrayContaining([
        expect.objectContaining({ from: "sarah@example.com" }),
        expect.objectContaining({ from: "alex@example.com" }),
      ]),
    );
  });

  it("should use follow-up window of 10 when building follow-up context", async () => {
    const buildFollowUpCtx = processor.buildFollowUpContext.bind(processor);

    // Mock 10-message thread: sarah sent last (the one we're following up on)
    const tenMessages: Partial<Email>[] = [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `email-${i}`,
        emailThreadId: "thread-1",
        userId: "user-1",
        from: i % 2 === 0 ? "alex@example.com" : "sarah@example.com",
        fromName: i % 2 === 0 ? "Alex" : "Sarah Chen",
        body: `Message ${i}`,
        receivedAt: new Date(
          `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        ),
      })),
      {
        id: "email-8",
        emailThreadId: "thread-1",
        userId: "user-1",
        from: "sarah@example.com",
        fromName: "Sarah Chen",
        body: "Please send the updated report.",
        receivedAt: new Date("2026-01-09T10:00:00Z"),
      },
      {
        id: "email-9",
        emailThreadId: "thread-1",
        userId: "user-1",
        from: "alex@example.com",
        fromName: "Alex",
        body: "Will do, sending today.",
        receivedAt: new Date("2026-01-10T10:00:00Z"),
      },
    ];

    mockEmailRepository.find.mockResolvedValue(tenMessages);

    const ctx = await buildFollowUpCtx(
      "thread-1",
      "user-1",
      "alex@example.com",
    );

    // Should fetch with window of 10
    expect(mockEmailRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailThreadId: "thread-1", userId: "user-1" },
        order: { receivedAt: "ASC" },
        take: 10,
      }),
    );

    // recipientName comes from last other-party email (sarah@example.com)
    expect(ctx.recipientName).toBe("Sarah Chen");

    // lastOtherPartyMessage should be Sarah's last email body
    expect(ctx.lastOtherPartyMessage).toBe("Please send the updated report.");

    // userLastMessage should be Alex's last email body
    expect(ctx.userLastMessage).toBe("Will do, sending today.");
  });

  it("should use daysSinceLastEmail based on other party's last email, not user's own", async () => {
    const buildFollowUpCtx = processor.buildFollowUpContext.bind(processor);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    const followUpThread: Partial<Email>[] = [
      {
        id: "e1",
        emailThreadId: "thread-2",
        userId: "user-1",
        from: "sarah@example.com",
        fromName: "Sarah",
        body: "Any update?",
        receivedAt: threeDaysAgo,
      },
      {
        id: "e2",
        emailThreadId: "thread-2",
        userId: "user-1",
        from: "alex@example.com",
        fromName: "Alex",
        body: "Working on it.",
        receivedAt: yesterday,
      },
    ];

    mockEmailRepository.find.mockResolvedValue(followUpThread);

    const ctx = await buildFollowUpCtx(
      "thread-2",
      "user-1",
      "alex@example.com",
    );

    // Days should be ~3 (based on Sarah's email), not ~1 (based on Alex's email)
    expect(ctx.daysSinceLastEmail).toBeGreaterThanOrEqual(2);
    expect(ctx.daysSinceLastEmail).toBeLessThanOrEqual(4);
  });

  it("should pass lastOtherPartyMessage and userLastMessage to generateFollowUpDraft", async () => {
    const generateFn = processor.generateReplySuggestions.bind(processor);

    const followUpThread: Partial<Email>[] = [
      {
        id: "e1",
        emailThreadId: "thread-1",
        userId: "user-1",
        from: "sarah@example.com",
        fromName: "Sarah Chen",
        body: "Did you get my last message?",
        receivedAt: new Date("2026-01-10T10:00:00Z"),
      },
      {
        id: "e2",
        emailThreadId: "thread-1",
        userId: "user-1",
        from: "alex@example.com",
        fromName: "Alex",
        body: "Yes, working on it now.",
        receivedAt: new Date("2026-01-11T09:00:00Z"),
      },
    ];

    mockEmailRepository.find.mockResolvedValue(followUpThread);

    const replyContext = {
      userEmail: "alex@example.com",
      userSentLast: true,
      userContext: {
        tone: "professional",
        userName: "Alex",
        userJobTitle: "Engineer",
        emailExamples: [],
        calendarLink: null,
      },
      emailExamples: [],
    };

    const userEmail: Partial<Email> = {
      ...latestEmail,
      from: "alex@example.com",
    };

    await generateFn("worker-1", "thread-1", "user-1", replyContext, userEmail);

    expect(mockLLMService.generateFollowUpDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lastOtherPartyMessage: expect.stringContaining(
          "Did you get my last message?",
        ),
        userLastMessage: expect.stringContaining("Yes, working on it now."),
      }),
    );
  });
});
