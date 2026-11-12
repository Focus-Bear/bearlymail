import { AskAiToolService } from "../ask-ai/ask-ai-tools.service";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { EmailTrackingSummaryService } from "../email-tracking/email-tracking-summary.service";
import { EmailsService } from "../emails/emails.service";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { McpReadToolsService } from "./mcp-read-tools.service";
import { McpToolInputError } from "./mcp-tool-args";

const USER_ID = "user-1";
const EMAIL_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-11-04T12:00:00Z");

function followUp(overrides: Partial<FollowUp>): FollowUp {
  return {
    id: "fu-1",
    threadId: "thread-1",
    subject: "Proposal",
    status: FollowUpStatus.AWAITING_REPLY,
    followUpDueAt: new Date("2026-11-10T00:00:00Z"),
    followUpDays: 3,
    lastMyReplyAt: new Date("2026-11-01T00:00:00Z"),
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  } as FollowUp;
}

describe("McpReadToolsService", () => {
  let emailsService: {
    getInbox: jest.Mock;
    getEmailById: jest.Mock;
    getThreadEmails: jest.Mock;
  };
  let tracking: {
    annotateThreadEmails: jest.Mock;
    getLatestSummariesByThread: jest.Mock;
  };
  let followUps: {
    findActiveFollowUpByThread: jest.Mock;
    getAwaitingReplyFollowUps: jest.Mock;
    getDueFollowUps: jest.Mock;
  };
  let askAi: { executeTool: jest.Mock };
  let service: McpReadToolsService;

  beforeEach(() => {
    emailsService = {
      getInbox: jest
        .fn()
        .mockResolvedValue({ emails: [], total: 0, hasMore: false }),
      getEmailById: jest.fn(),
      getThreadEmails: jest.fn().mockResolvedValue([]),
    };
    tracking = {
      annotateThreadEmails: jest.fn(async (_userId, emails) => emails),
      getLatestSummariesByThread: jest.fn().mockResolvedValue(new Map()),
    };
    followUps = {
      findActiveFollowUpByThread: jest.fn().mockResolvedValue(null),
      getAwaitingReplyFollowUps: jest.fn().mockResolvedValue([]),
      getDueFollowUps: jest.fn().mockResolvedValue([]),
    };
    askAi = {
      executeTool: jest.fn().mockResolvedValue({ resultJson: '{"count":1}' }),
    };
    service = new McpReadToolsService(
      emailsService as unknown as EmailsService,
      tracking as unknown as EmailTrackingSummaryService,
      followUps as unknown as FollowUpsService,
      askAi as unknown as AskAiToolService,
    );
  });

  describe("listImportantEmails", () => {
    it("defaults to triage and maps inbox rows to compact items", async () => {
      emailsService.getInbox.mockResolvedValue({
        emails: [
          {
            id: EMAIL_ID,
            threadId: "t1",
            from: "ceo@example.com",
            fromName: "CEO",
            subject: "Board deck",
            summary: "Needs your numbers by Friday",
            receivedAt: NOW,
            isRead: false,
            priorityScore: 91,
            starCount: 0,
            category: "Work",
            body: "full body that should not be listed",
          },
        ],
        total: 1,
        hasMore: false,
      });

      const result = await service.listImportantEmails(USER_ID, {});

      expect(emailsService.getInbox).toHaveBeenCalledWith(
        USER_ID,
        false,
        "triage",
        undefined,
        {
          offset: 0,
          limit: 20,
        },
      );
      expect(result.emails).toEqual([
        expect.objectContaining({
          emailId: EMAIL_ID,
          priorityScore: 91,
          category: "Work",
        }),
      ]);
      expect(result.emails[0]).not.toHaveProperty("body");
    });

    it("passes mode, minPriority and limit through", async () => {
      await service.listImportantEmails(USER_ID, {
        mode: "action",
        minPriority: 70,
        limit: 5,
      });
      expect(emailsService.getInbox).toHaveBeenCalledWith(
        USER_ID,
        false,
        "action",
        { minPriority: 70 },
        {
          offset: 0,
          limit: 5,
        },
      );
    });

    it("rejects the blocked mode and out-of-range limits", async () => {
      await expect(
        service.listImportantEmails(USER_ID, { mode: "blocked" }),
      ).rejects.toBeInstanceOf(McpToolInputError);
      await expect(
        service.listImportantEmails(USER_ID, { limit: 500 }),
      ).rejects.toBeInstanceOf(McpToolInputError);
    });
  });

  describe("getThread", () => {
    it("returns messages oldest first with cleaned bodies and the pending follow-up", async () => {
      emailsService.getEmailById.mockResolvedValue({
        id: EMAIL_ID,
        threadId: "t1",
        subject: "Hi",
      });
      emailsService.getThreadEmails.mockResolvedValue([
        { id: "newer", body: "second", htmlBody: null, attachments: null },
        {
          id: "older",
          body: "first",
          htmlBody: null,
          attachments: [{ filename: "a.pdf" }],
        },
      ]);
      followUps.findActiveFollowUpByThread.mockResolvedValue(
        followUp({ followUpDueAt: new Date("2026-11-03T00:00:00Z") }),
      );

      const result = await service.getThread(
        USER_ID,
        { emailId: EMAIL_ID },
        NOW,
      );

      expect(result.messages.map((message) => message.emailId)).toEqual([
        "older",
        "newer",
      ]);
      expect(result.messages[0]).toMatchObject({
        body: "first",
        attachments: ["a.pdf"],
      });
      expect(result.followUp).toMatchObject({ isDue: true, followUpDays: 3 });
    });

    it("refuses ids that aren't the user's email", async () => {
      emailsService.getEmailById.mockResolvedValue(null);
      await expect(
        service.getThread(USER_ID, { emailId: EMAIL_ID }),
      ).rejects.toBeInstanceOf(McpToolInputError);
      await expect(
        service.getThread(USER_ID, { emailId: "1; DROP TABLE" }),
      ).rejects.toBeInstanceOf(McpToolInputError);
    });
  });

  it("delegates search to the Ask AI email search", async () => {
    await expect(
      service.searchEmails(USER_ID, { query: "invoice", from: "a@b.com" }),
    ).resolves.toBe('{"count":1}');
    expect(askAi.executeTool).toHaveBeenCalledWith(
      USER_ID,
      { kind: "search_emails" },
      { query: "invoice", from: "a@b.com", limit: undefined },
    );
  });

  it("merges awaiting and due follow-ups once each, soonest first, with open status", async () => {
    const later = followUp({
      id: "later",
      threadId: "t-later",
      followUpDueAt: new Date("2026-11-20T00:00:00Z"),
    });
    const due = followUp({
      id: "due",
      threadId: "t-due",
      status: FollowUpStatus.FOLLOW_UP_DUE,
      followUpDueAt: new Date("2026-11-02T00:00:00Z"),
    });
    followUps.getAwaitingReplyFollowUps.mockResolvedValue([later]);
    followUps.getDueFollowUps.mockResolvedValue([due, later]);
    emailsService.getThreadEmails.mockImplementation(
      async (_userId, threadId) => [{ id: `latest-in-${threadId}` }],
    );
    tracking.getLatestSummariesByThread.mockResolvedValue(
      new Map([["t-due", { openCount: 2 }]]),
    );

    const result = await service.listFollowUps(USER_ID, NOW);

    expect(result.followUps).toEqual([
      expect.objectContaining({
        emailId: "latest-in-t-due",
        isDue: true,
        openTracking: { openCount: 2 },
      }),
      expect.objectContaining({
        emailId: "latest-in-t-later",
        isDue: false,
        openTracking: null,
      }),
    ]);
  });
});
