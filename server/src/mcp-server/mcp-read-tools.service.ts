import { Injectable } from "@nestjs/common";
import { isUUID } from "class-validator";

import { AskAiToolService } from "../ask-ai/ask-ai-tools.service";
import { MCP_INBOX_MODES, MCP_SERVER } from "../constants/mcp-server.constants";
import { Email } from "../database/entities/email.entity";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { OpenTrackingSummary } from "../email-tracking/email-tracking.types";
import { EmailTrackingSummaryService } from "../email-tracking/email-tracking-summary.service";
import { EmailsService } from "../emails/emails.service";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import {
  McpToolInputError,
  optionalEnum,
  optionalInteger,
  requiredString,
  ToolArgs,
} from "./mcp-tool-args";

const PRIORITY_MIN = 0;
const PRIORITY_MAX = 100;
const SEARCH_RESULTS_MAX = 20;
const UUID_MAX_LENGTH = 36;

/** Extra columns the raw inbox query adds to each Email row. */
type InboxEmail = Email & {
  priorityScore?: number | null;
  starCount?: number;
  category?: string | null;
};

type TrackedEmail = Email & { openTracking?: OpenTrackingSummary };

function toInboxItem(email: InboxEmail) {
  return {
    emailId: email.id,
    threadId: email.threadId,
    from: email.from,
    fromName: email.fromName,
    subject: email.subject,
    summary: email.summary,
    receivedAt: email.receivedAt,
    priorityScore: email.priorityScore ?? null,
    starCount: email.starCount ?? 0,
    category: email.category ?? null,
    isRead: email.isRead,
  };
}

function toThreadMessage(email: TrackedEmail) {
  return {
    emailId: email.id,
    from: email.from,
    fromName: email.fromName,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
    receivedAt: email.receivedAt,
    summary: email.summary,
    body: cleanEmailContent(
      email.body,
      email.htmlBody,
      MCP_SERVER.MAX_BODY_CHARS,
    ),
    attachments: (email.attachments ?? []).map(
      (attachment) => attachment.filename,
    ),
    phishingConfidence: email.phishingConfidence,
    openTracking: email.openTracking ?? null,
  };
}

function isFollowUpDue(followUp: FollowUp, now: Date): boolean {
  return (
    followUp.status === FollowUpStatus.FOLLOW_UP_DUE ||
    followUp.followUpDueAt.getTime() <= now.getTime()
  );
}

function toFollowUpView(followUp: FollowUp, now: Date) {
  return {
    followUpDueAt: followUp.followUpDueAt,
    followUpDays: followUp.followUpDays,
    isDue: isFollowUpDue(followUp, now),
  };
}

/** The read-only MCP tools: inbox listing, thread reading, search, follow-ups. */
@Injectable()
export class McpReadToolsService {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly trackingSummaryService: EmailTrackingSummaryService,
    private readonly followUpsService: FollowUpsService,
    private readonly askAiToolService: AskAiToolService,
  ) {}

  async listImportantEmails(userId: string, args: ToolArgs) {
    const mode = optionalEnum(args, "mode", MCP_INBOX_MODES) ?? "triage";
    const minPriority = optionalInteger(
      args,
      "minPriority",
      PRIORITY_MIN,
      PRIORITY_MAX,
    );
    const limit =
      optionalInteger(args, "limit", 1, MCP_SERVER.MAX_LIST_LIMIT) ??
      MCP_SERVER.DEFAULT_LIST_LIMIT;

    const { emails, total, hasMore } = await this.emailsService.getInbox(
      userId,
      false,
      mode,
      minPriority === undefined ? undefined : { minPriority },
      { offset: 0, limit },
    );
    return {
      mode,
      total,
      hasMore,
      emails: (emails as InboxEmail[]).map(toInboxItem),
    };
  }

  async getThread(userId: string, args: ToolArgs, now: Date = new Date()) {
    const email = await this.findOwnedEmail(userId, args);
    const newestFirst = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { order: "DESC", limit: MCP_SERVER.MAX_THREAD_EMAILS },
    );
    const [messages, followUp] = await Promise.all([
      this.trackingSummaryService.annotateThreadEmails(
        userId,
        newestFirst.reverse(),
      ),
      this.followUpsService.findActiveFollowUpByThread(userId, email.threadId),
    ]);
    return {
      threadId: email.threadId,
      subject: email.subject,
      messages: messages.map(toThreadMessage),
      followUp: followUp ? toFollowUpView(followUp, now) : null,
    };
  }

  /** Returns the search tool's JSON as-is (it may be truncated mid-object). */
  async searchEmails(userId: string, args: ToolArgs): Promise<string> {
    if (typeof args.query !== "string") {
      throw new McpToolInputError("`query` must be a string (it may be empty)");
    }
    if (args.from !== undefined && typeof args.from !== "string") {
      throw new McpToolInputError("`from` must be a string");
    }
    const limit = optionalInteger(args, "limit", 1, SEARCH_RESULTS_MAX);
    const { resultJson } = await this.askAiToolService.executeTool(
      userId,
      { kind: "search_emails" },
      { query: args.query, from: args.from, limit },
    );
    return resultJson;
  }

  async listFollowUps(userId: string, now: Date = new Date()) {
    const [awaiting, due] = await Promise.all([
      this.followUpsService.getAwaitingReplyFollowUps(userId),
      this.followUpsService.getDueFollowUps(userId),
    ]);
    const followUps = [
      ...new Map([...awaiting, ...due].map((row) => [row.id, row])).values(),
    ]
      .sort(
        (left, right) =>
          left.followUpDueAt.getTime() - right.followUpDueAt.getTime(),
      )
      .slice(0, MCP_SERVER.MAX_LIST_LIMIT);

    const threadIds = followUps.map((followUp) => followUp.threadId);
    const [openTrackingByThread, latestEmailIds] = await Promise.all([
      this.trackingSummaryService.getLatestSummariesByThread(userId, threadIds),
      Promise.all(
        threadIds.map((threadId) => this.latestEmailId(userId, threadId)),
      ),
    ]);

    return {
      followUps: followUps.map((followUp, index) => ({
        emailId: latestEmailIds[index],
        threadId: followUp.threadId,
        subject: followUp.subject,
        waitingSince: followUp.lastMyReplyAt ?? followUp.createdAt,
        ...toFollowUpView(followUp, now),
        openTracking: openTrackingByThread.get(followUp.threadId) ?? null,
      })),
    };
  }

  private async findOwnedEmail(userId: string, args: ToolArgs): Promise<Email> {
    const emailId = requiredString(args, "emailId", UUID_MAX_LENGTH);
    if (!isUUID(emailId)) {
      throw new McpToolInputError("`emailId` must be a BearlyMail email id");
    }
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new McpToolInputError(`No email found with id ${emailId}`);
    }
    return email;
  }

  private async latestEmailId(
    userId: string,
    threadId: string,
  ): Promise<string | null> {
    const [latest] = await this.emailsService.getThreadEmails(
      userId,
      threadId,
      { order: "DESC", limit: 1 },
    );
    return latest?.id ?? null;
  }
}
