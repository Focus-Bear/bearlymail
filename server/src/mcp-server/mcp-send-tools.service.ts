import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { isUUID } from "class-validator";
import { In, MoreThan, Repository } from "typeorm";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import { HOURS_PER_DAY } from "../constants/time-constants";
import { AuditLog } from "../database/entities/audit-log.entity";
import { EmailSendQueueService } from "../email-send-queue/email-send-queue.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { McpCallContext } from "./mcp-server.types";
import {
  McpToolInputError,
  optionalBoolean,
  optionalEmailList,
  optionalInteger,
  requiredString,
  ToolArgs,
} from "./mcp-tool-args";

const UUID_MAX_LENGTH = 36;
const MCP_SEND_AUDIT_ACTIONS = Object.values(MCP_SERVER.AUDIT_ACTIONS);

interface QueuedSend {
  sendId: string;
  status: string;
}

interface SendOptions {
  trackOpens?: boolean;
  followUpInDays?: number;
}

function parseSendOptions(args: ToolArgs): SendOptions {
  return {
    trackOpens: optionalBoolean(args, "trackOpens"),
    followUpInDays: optionalInteger(
      args,
      "followUpInDays",
      1,
      MCP_SERVER.MAX_FOLLOW_UP_DAYS,
    ),
  };
}

function expectedReplyHours(options: SendOptions): number | undefined {
  return options.followUpInDays
    ? options.followUpInDays * HOURS_PER_DAY
    : undefined;
}

function queuedResult(queued: QueuedSend, options: SendOptions) {
  return {
    status: queued.status,
    sendId: queued.sendId,
    trackOpens: options.trackOpens ?? "account default",
    followUpInDays: options.followUpInDays ?? null,
    note: "Queued: BearlyMail sends it in the background within a few seconds.",
  };
}

/**
 * The MCP tools that send mail. Both go through the same background send
 * queue as the web app, so signatures, open tracking, follow-up reminders and
 * failure retries behave identically. Every send is audited, and the audit
 * trail doubles as the per-user hourly send cap: it is checked and written
 * under one lock, so sends arriving together can't all pass it, and a send
 * that can't be counted doesn't report success.
 */
@Injectable()
export class McpSendToolsService {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly emailSendQueueService: EmailSendQueueService,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async sendReply(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const emailId = requiredString(args, "emailId", UUID_MAX_LENGTH);
    if (!isUUID(emailId)) {
      throw new McpToolInputError("`emailId` must be a BearlyMail email id");
    }
    const body = requiredString(args, "body", MCP_SERVER.MAX_SEND_BODY_LENGTH);
    const to = optionalEmailList(args, "to");
    const cc = optionalEmailList(args, "cc");
    const bcc = optionalEmailList(args, "bcc");
    const options = parseSendOptions(args);

    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new McpToolInputError(`No email found with id ${emailId}`);
    }

    const queued = await this.sendWithinLimit(
      context,
      MCP_SERVER.AUDIT_ACTIONS.SEND_REPLY,
      {
        repliedToEmailId: emailId,
        recipientCount:
          (to?.length ?? 0) + (cc?.length ?? 0) + (bcc?.length ?? 0),
      },
      () =>
        this.emailSendQueueService.queueReply(userId, emailId, {
          body,
          recipients: to?.join(", "),
          cc: cc?.join(", "),
          bcc: bcc?.join(", "),
          isForward: false,
          keepInAction: false,
          expectedReplyHours: expectedReplyHours(options),
          trackOpens: options.trackOpens,
        }),
    );
    return queuedResult(queued, options);
  }

  async sendEmail(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const to = optionalEmailList(args, "to");
    if (!to) {
      throw new McpToolInputError("`to` needs at least one email address");
    }
    const cc = optionalEmailList(args, "cc");
    const bcc = optionalEmailList(args, "bcc");
    const subject = requiredString(
      args,
      "subject",
      MCP_SERVER.MAX_SUBJECT_LENGTH,
    );
    const body = requiredString(args, "body", MCP_SERVER.MAX_SEND_BODY_LENGTH);
    const options = parseSendOptions(args);

    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new McpToolInputError(
        "The user has no email account connected to BearlyMail",
      );
    }

    const toRecipients = (addresses: string[] | undefined) =>
      addresses?.map((email) => ({ email }));
    const queued = await this.sendWithinLimit(
      context,
      MCP_SERVER.AUDIT_ACTIONS.SEND_EMAIL,
      { recipientCount: to.length + (cc?.length ?? 0) + (bcc?.length ?? 0) },
      () =>
        this.emailSendQueueService.queueNewEmail(userId, {
          to: toRecipients(to) ?? [],
          cc: toRecipients(cc),
          bcc: toRecipients(bcc),
          subject,
          body,
          expectedReplyHours: expectedReplyHours(options),
          trackOpens: options.trackOpens,
        }),
    );
    return queuedResult(queued, options);
  }

  /**
   * Holds a per-user lock while it counts, queues and audits, so the count
   * always includes every send before it. The lock is released with the
   * transaction, and works across web tasks because it lives in Postgres.
   */
  private sendWithinLimit(
    context: McpCallContext,
    action: string,
    metadata: Record<string, unknown>,
    queueSend: () => Promise<QueuedSend>,
  ): Promise<QueuedSend> {
    const { userId, tokenId } = context.principal;
    return this.auditLogRepository.manager.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${MCP_SERVER.SEND_LOCK_PREFIX}${userId}`,
      ]);
      const auditLogs = manager.getRepository(AuditLog);
      const sentInWindow = await auditLogs.count({
        where: {
          userId,
          action: In(MCP_SEND_AUDIT_ACTIONS),
          createdAt: MoreThan(
            new Date(Date.now() - MCP_SERVER.SEND_LIMIT_WINDOW_MS),
          ),
        },
      });
      if (sentInWindow >= MCP_SERVER.SEND_LIMIT_PER_HOUR) {
        throw new McpToolInputError(
          `Send limit reached: at most ${MCP_SERVER.SEND_LIMIT_PER_HOUR} messages per hour can be sent through this connection. Try again later.`,
        );
      }

      const queued = await queueSend();
      await auditLogs.save(
        auditLogs.create({
          userId,
          action,
          targetType: MCP_SERVER.AUDIT_TARGET_TYPE,
          targetId: queued.sendId,
          metadata: { tokenId, ...metadata },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        }),
      );
      return queued;
    });
  }
}
