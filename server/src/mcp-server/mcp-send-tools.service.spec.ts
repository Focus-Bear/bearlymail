import { Repository } from "typeorm";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import { PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import { AuditLog } from "../database/entities/audit-log.entity";
import { EmailSendQueueService } from "../email-send-queue/email-send-queue.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { McpSendToolsService } from "./mcp-send-tools.service";
import { McpCallContext } from "./mcp-server.types";
import { McpToolInputError } from "./mcp-tool-args";

const EMAIL_ID = "22222222-2222-4222-8222-222222222222";
const CONTEXT: McpCallContext = {
  principal: {
    userId: "user-1",
    tokenId: "token-1",
    scopes: [PAT_SCOPES.MAIL_SEND],
  },
  ipAddress: "203.0.113.9",
  userAgent: "claude-code",
};
const QUEUED = { sendId: "send-1", status: "queued" as const };

describe("McpSendToolsService", () => {
  let emailsService: { getEmailById: jest.Mock };
  let providerManager: { getPrimaryProvider: jest.Mock };
  let sendQueue: { queueReply: jest.Mock; queueNewEmail: jest.Mock };
  let savedAudits: Record<string, unknown>[];
  let auditLogs: { count: jest.Mock; create: jest.Mock; save: jest.Mock };
  let lockQuery: jest.Mock;
  let auditLogRepository: { manager: { transaction: jest.Mock } };
  let service: McpSendToolsService;

  beforeEach(() => {
    emailsService = {
      getEmailById: jest.fn().mockResolvedValue({ id: EMAIL_ID }),
    };
    providerManager = { getPrimaryProvider: jest.fn().mockResolvedValue({}) };
    sendQueue = {
      queueReply: jest.fn().mockResolvedValue(QUEUED),
      queueNewEmail: jest.fn().mockResolvedValue(QUEUED),
    };
    savedAudits = [];
    auditLogs = {
      count: jest.fn(async () => savedAudits.length),
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => {
        savedAudits.push(row);
        return row;
      }),
    };
    lockQuery = jest.fn().mockResolvedValue([]);
    // Runs one transaction at a time, as the advisory lock does.
    let lockHeld: Promise<unknown> = Promise.resolve();
    auditLogRepository = {
      manager: {
        transaction: jest.fn((work: (manager: unknown) => Promise<unknown>) => {
          const run = lockHeld.then(() =>
            work({ query: lockQuery, getRepository: () => auditLogs }),
          );
          lockHeld = run.catch(() => undefined);
          return run;
        }),
      },
    };
    service = new McpSendToolsService(
      emailsService as unknown as EmailsService,
      providerManager as unknown as EmailProviderManager,
      sendQueue as unknown as EmailSendQueueService,
      auditLogRepository as unknown as Repository<AuditLog>,
    );
  });

  describe("sendReply", () => {
    it("queues the reply with tracking and a follow-up window in hours", async () => {
      const result = await service.sendReply(CONTEXT, {
        emailId: EMAIL_ID,
        body: "Sounds good — see you Thursday.",
        cc: ["boss@example.com"],
        trackOpens: true,
        followUpInDays: 3,
      });

      expect(sendQueue.queueReply).toHaveBeenCalledWith("user-1", EMAIL_ID, {
        body: "<p>Sounds good — see you Thursday.</p>",
        recipients: undefined,
        cc: "boss@example.com",
        bcc: undefined,
        isForward: false,
        keepInAction: false,
        expectedReplyHours: 72,
        trackOpens: true,
      });
      expect(result).toMatchObject({
        status: "queued",
        sendId: "send-1",
        trackOpens: true,
        followUpInDays: 3,
      });
    });

    it("audits the send with the token id but not the message content", async () => {
      await service.sendReply(CONTEXT, {
        emailId: EMAIL_ID,
        body: "secret plans",
      });
      expect(savedAudits).toEqual([
        expect.objectContaining({
          userId: "user-1",
          action: MCP_SERVER.AUDIT_ACTIONS.SEND_REPLY,
          targetId: "send-1",
          ipAddress: "203.0.113.9",
          metadata: expect.objectContaining({ tokenId: "token-1" }),
        }),
      ]);
      expect(JSON.stringify(savedAudits[0])).not.toContain("secret plans");
    });

    it("takes the user's lock before counting", async () => {
      await service.sendReply(CONTEXT, { emailId: EMAIL_ID, body: "hi" });

      expect(lockQuery).toHaveBeenCalledWith(
        expect.stringContaining("pg_advisory_xact_lock"),
        ["mcp-send:user-1"],
      );
      expect(lockQuery.mock.invocationCallOrder[0]).toBeLessThan(
        auditLogs.count.mock.invocationCallOrder[0],
      );
    });

    it("doesn't report success when the send can't be audited", async () => {
      auditLogs.save.mockRejectedValue(new Error("audit table down"));

      await expect(
        service.sendReply(CONTEXT, { emailId: EMAIL_ID, body: "hi" }),
      ).rejects.toThrow("audit table down");
    });

    it("sends nothing when the lock or count fails", async () => {
      auditLogs.count.mockRejectedValue(new Error("database down"));

      await expect(
        service.sendReply(CONTEXT, { emailId: EMAIL_ID, body: "hi" }),
      ).rejects.toThrow("database down");
      expect(sendQueue.queueReply).not.toHaveBeenCalled();
    });

    it("leaves tracking and follow-up to the account defaults when omitted", async () => {
      const result = await service.sendReply(CONTEXT, {
        emailId: EMAIL_ID,
        body: "ok",
      });
      expect(sendQueue.queueReply.mock.calls[0][2]).toMatchObject({
        expectedReplyHours: undefined,
        trackOpens: undefined,
      });
      expect(result).toMatchObject({
        trackOpens: "account default",
        followUpInDays: null,
      });
    });

    it("rejects an email the user doesn't own", async () => {
      emailsService.getEmailById.mockResolvedValue(null);
      await expect(
        service.sendReply(CONTEXT, { emailId: EMAIL_ID, body: "hi" }),
      ).rejects.toBeInstanceOf(McpToolInputError);
      expect(sendQueue.queueReply).not.toHaveBeenCalled();
    });

    it.each([
      [{ emailId: "not-a-uuid", body: "hi" }],
      [{ emailId: EMAIL_ID, body: "  " }],
      [{ emailId: EMAIL_ID, body: "hi", cc: ["not an address"] }],
      [{ emailId: EMAIL_ID, body: "hi", followUpInDays: 0 }],
      [{ emailId: EMAIL_ID, body: "hi", followUpInDays: 2.5 }],
      [{ emailId: EMAIL_ID, body: "hi", trackOpens: "yes" }],
    ])("rejects invalid arguments %j", async (args) => {
      await expect(service.sendReply(CONTEXT, args)).rejects.toBeInstanceOf(
        McpToolInputError,
      );
      expect(sendQueue.queueReply).not.toHaveBeenCalled();
    });

    it("stops at the hourly send cap", async () => {
      auditLogs.count.mockResolvedValue(MCP_SERVER.SEND_LIMIT_PER_HOUR);
      await expect(
        service.sendReply(CONTEXT, { emailId: EMAIL_ID, body: "hi" }),
      ).rejects.toThrow(/Send limit reached/);
      expect(sendQueue.queueReply).not.toHaveBeenCalled();
    });
  });

  describe("sendEmail", () => {
    it("sends a multi-paragraph plain-text body as HTML paragraphs", async () => {
      await service.sendEmail(CONTEXT, {
        to: ["ana@example.com"],
        subject: "Hola",
        body: "Buen día:\n\nPrimer párrafo.\n\n¿Le interesa?\n¿Es usted?\n\nSaludos,\nAndrea",
      });
      expect(sendQueue.queueNewEmail).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          body:
            "<p>Buen día:</p><p>Primer párrafo.</p>" +
            "<p>¿Le interesa?<br>¿Es usted?</p><p>Saludos,<br>Andrea</p>",
        }),
      );
    });
    it("queues a new email with recipient objects", async () => {
      await service.sendEmail(CONTEXT, {
        to: ["ana@example.com", "bo@example.com"],
        subject: "Quarterly numbers",
        body: "Attached below.",
        followUpInDays: 7,
        trackOpens: false,
      });
      expect(sendQueue.queueNewEmail).toHaveBeenCalledWith("user-1", {
        to: [{ email: "ana@example.com" }, { email: "bo@example.com" }],
        cc: undefined,
        bcc: undefined,
        subject: "Quarterly numbers",
        body: "<p>Attached below.</p>",
        expectedReplyHours: 168,
        trackOpens: false,
      });
      expect(savedAudits).toEqual([
        expect.objectContaining({
          action: MCP_SERVER.AUDIT_ACTIONS.SEND_EMAIL,
        }),
      ]);
    });

    it("holds the cap when many sends arrive at once", async () => {
      const attempts = Array.from(
        { length: MCP_SERVER.SEND_LIMIT_PER_HOUR + 10 },
        () =>
          service.sendEmail(CONTEXT, {
            to: ["a@example.com"],
            subject: "s",
            body: "b",
          }),
      );

      const results = await Promise.allSettled(attempts);

      expect(sendQueue.queueNewEmail).toHaveBeenCalledTimes(
        MCP_SERVER.SEND_LIMIT_PER_HOUR,
      );
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(10);
    });

    it("requires at least one recipient", async () => {
      await expect(
        service.sendEmail(CONTEXT, { to: [], subject: "s", body: "b" }),
      ).rejects.toThrow(/at least one/);
    });

    it("explains when no mailbox is connected", async () => {
      providerManager.getPrimaryProvider.mockResolvedValue(null);
      await expect(
        service.sendEmail(CONTEXT, {
          to: ["a@example.com"],
          subject: "s",
          body: "b",
        }),
      ).rejects.toThrow(/no email account connected/);
      expect(sendQueue.queueNewEmail).not.toHaveBeenCalled();
    });
  });
});
