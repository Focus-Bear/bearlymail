import { Injectable } from "@nestjs/common";

import { REPLY_DRAFT_SOURCES } from "../constants/domain-types";
import { MCP_DRAFTS, MCP_SERVER } from "../constants/mcp-server.constants";
import { Email } from "../database/entities/email.entity";
import { ReplyDraft } from "../database/entities/reply-draft.entity";
import { AssistantDraftFields, DraftsService } from "../drafts/drafts.service";
import { EmailsService } from "../emails/emails.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { resolveFrontendBaseUrl } from "../utils/frontend-base-url.util";
import {
  addressListChange,
  joinAddresses,
  optionalUuid,
  parseDraftAttachments,
  requiredUuid,
} from "./mcp-draft-args";
import { toSendableHtmlBody } from "./mcp-send-body.helpers";
import {
  McpToolInputError,
  optionalEmailList,
  optionalInteger,
  requiredString,
  ToolArgs,
} from "./mcp-tool-args";

const DRAFT_KINDS = { REPLY: "reply", NEW: "new" } as const;

const NOTHING_SENT_NOTE =
  "Saved as a draft in BearlyMail. Nothing was sent: the user reviews and sends it from BearlyMail.";

const DRAFT_FIELD_KEYS = [
  "to",
  "cc",
  "bcc",
  "subject",
  "body",
  "attachments",
] as const;

function composeDraftUrl(draftId: string): string {
  const params = new URLSearchParams({
    [MCP_DRAFTS.COMPOSE_DRAFT_PARAM]: draftId,
  });
  return `${resolveFrontendBaseUrl()}${MCP_DRAFTS.COMPOSE_PATH}?${params}`;
}

function emailDetailUrl(emailId: string): string {
  return `${resolveFrontendBaseUrl()}${MCP_DRAFTS.EMAIL_DETAIL_PATH}/${encodeURIComponent(emailId)}`;
}

function optionalSubject(args: ToolArgs): string | undefined {
  return args.subject === undefined || args.subject === null
    ? undefined
    : requiredString(args, "subject", MCP_SERVER.MAX_SUBJECT_LENGTH);
}

function optionalBody(args: ToolArgs): string | undefined {
  return args.body === undefined || args.body === null
    ? undefined
    : toSendableHtmlBody(
        requiredString(args, "body", MCP_SERVER.MAX_SEND_BODY_LENGTH),
      );
}

function draftView(draft: ReplyDraft, url: string | null) {
  return {
    draftId: draft.id,
    kind: draft.emailThreadId ? DRAFT_KINDS.REPLY : DRAFT_KINDS.NEW,
    url,
    threadId: draft.emailThreadId,
    to: draft.recipients,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    attachments: (draft.attachments ?? []).map(
      (attachment) => attachment.filename,
    ),
    note: NOTHING_SENT_NOTE,
  };
}

/**
 * The MCP draft tools. Drafts are stored where the web app keeps its own
 * (reply_drafts), so a reply draft opens in the thread's reply composer and a
 * new message opens in Compose; nothing is ever sent without the user. An
 * assistant may only change or delete drafts it wrote itself and the user
 * hasn't edited since, so it can never overwrite the user's own writing.
 */
@Injectable()
export class McpDraftToolsService {
  constructor(
    private readonly draftsService: DraftsService,
    private readonly emailsService: EmailsService,
  ) {}

  async createDraft(userId: string, args: ToolArgs) {
    const replyToEmailId = optionalUuid(args, "replyToEmailId");
    const body = toSendableHtmlBody(
      requiredString(args, "body", MCP_SERVER.MAX_SEND_BODY_LENGTH),
    );
    const fields = {
      content: body,
      subject: optionalSubject(args) ?? null,
      cc: joinAddresses(optionalEmailList(args, "cc")),
      bcc: joinAddresses(optionalEmailList(args, "bcc")),
      attachments: parseDraftAttachments(args) ?? null,
    };
    const to = optionalEmailList(args, "to");

    return replyToEmailId
      ? this.createReplyDraft(userId, replyToEmailId, to, fields)
      : this.createNewMessageDraft(userId, to, fields);
  }

  async updateDraft(userId: string, args: ToolArgs) {
    const draft = await this.findAssistantDraft(userId, args);
    const changes = this.parseDraftChanges(args);
    const updated = await this.draftsService.updateAssistantDraft(
      draft,
      changes,
    );
    return draftView(updated, await this.draftUrl(userId, updated));
  }

  async listDrafts(userId: string, args: ToolArgs) {
    const limit =
      optionalInteger(args, "limit", 1, MCP_DRAFTS.MAX_LIST_LIMIT) ??
      MCP_SERVER.DEFAULT_LIST_LIMIT;
    const drafts = await this.draftsService.listDraftSummaries(userId, limit);
    const [withAttachments, urls] = await Promise.all([
      this.draftsService.findDraftIdsWithAttachments(
        userId,
        drafts.map((draft) => draft.id),
      ),
      Promise.all(drafts.map((draft) => this.draftUrl(userId, draft))),
    ]);
    return {
      drafts: drafts.map((draft, index) => ({
        draftId: draft.id,
        kind: draft.emailThreadId ? DRAFT_KINDS.REPLY : DRAFT_KINDS.NEW,
        url: urls[index],
        threadId: draft.emailThreadId,
        to: draft.recipients,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: draft.subject,
        body: cleanEmailContent(null, draft.content, MCP_SERVER.MAX_BODY_CHARS),
        hasAttachments: withAttachments.has(draft.id),
        writtenBy: draft.source,
        isEditableByAssistant: draft.source === REPLY_DRAFT_SOURCES.ASSISTANT,
        updatedAt: draft.updatedAt,
      })),
    };
  }

  async deleteDraft(userId: string, args: ToolArgs) {
    const draft = await this.findAssistantDraft(userId, args);
    await this.draftsService.deleteDraftById(userId, draft.id);
    return { draftId: draft.id, deleted: true };
  }

  private async createReplyDraft(
    userId: string,
    replyToEmailId: string,
    to: string[] | undefined,
    fields: Omit<AssistantDraftFields, "recipients">,
  ) {
    const email = await this.emailsService.getEmailById(userId, replyToEmailId);
    if (!email) {
      throw new McpToolInputError(`No email found with id ${replyToEmailId}`);
    }
    await this.assertThreadHasNoDraft(userId, email.threadId);
    const draft = await this.draftsService.createAssistantDraft(
      userId,
      email.threadId,
      {
        ...fields,
        // Who the reply composer would address by default, as send_reply does.
        recipients: joinAddresses(to) ?? (email.replyTo || email.from),
      },
    );
    return draftView(draft, emailDetailUrl(email.id));
  }

  private async createNewMessageDraft(
    userId: string,
    to: string[] | undefined,
    fields: Omit<AssistantDraftFields, "recipients">,
  ) {
    if (!to) {
      throw new McpToolInputError(
        "`to` needs at least one email address for a new message (or pass `replyToEmailId` to draft a reply)",
      );
    }
    if (!fields.subject) {
      throw new McpToolInputError("`subject` is required for a new message");
    }
    const draft = await this.draftsService.createAssistantDraft(userId, null, {
      ...fields,
      recipients: joinAddresses(to),
    });
    return draftView(draft, composeDraftUrl(draft.id));
  }

  /** BearlyMail keeps one reply draft per thread and never overwrites one. */
  private async assertThreadHasNoDraft(
    userId: string,
    threadId: string,
  ): Promise<void> {
    const existing = await this.draftsService.getDraftByThread(
      userId,
      threadId,
    );
    if (!existing) return;
    if (existing.source === REPLY_DRAFT_SOURCES.ASSISTANT) {
      throw new McpToolInputError(
        `This thread already has a draft you prepared (draftId ${existing.id}). Call update_draft with that draftId to change it.`,
      );
    }
    throw new McpToolInputError(
      "The user already has a reply draft on this thread, and BearlyMail keeps one per thread. Ask the user before replacing it; nothing was saved.",
    );
  }

  private async findAssistantDraft(
    userId: string,
    args: ToolArgs,
  ): Promise<ReplyDraft> {
    const draftId = requiredUuid(args, "draftId");
    const draft = await this.draftsService.getDraftById(userId, draftId);
    if (!draft) {
      throw new McpToolInputError(`No draft found with id ${draftId}`);
    }
    if (draft.source !== REPLY_DRAFT_SOURCES.ASSISTANT) {
      throw new McpToolInputError(
        "This draft was written or edited by the user, so it can't be changed or deleted through this connection.",
      );
    }
    return draft;
  }

  private parseDraftChanges(args: ToolArgs): Partial<AssistantDraftFields> {
    if (!DRAFT_FIELD_KEYS.some((key) => args[key] !== undefined)) {
      throw new McpToolInputError(
        `Pass at least one of ${DRAFT_FIELD_KEYS.join(", ")} to change`,
      );
    }
    const changes: Partial<AssistantDraftFields> = {
      content: optionalBody(args),
      subject: optionalSubject(args),
      recipients: addressListChange(args, "to"),
      cc: addressListChange(args, "cc"),
      bcc: addressListChange(args, "bcc"),
      attachments: parseDraftAttachments(args),
    };
    if (changes.attachments?.length === 0) {
      changes.attachments = null;
    }
    if (changes.recipients === null) {
      throw new McpToolInputError(
        "`to` needs at least one email address; omit it to keep the current recipients",
      );
    }
    return Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
  }

  private async draftUrl(
    userId: string,
    draft: ReplyDraft,
  ): Promise<string | null> {
    if (!draft.emailThreadId) return composeDraftUrl(draft.id);
    const latest = await this.latestThreadEmail(userId, draft.emailThreadId);
    return latest ? emailDetailUrl(latest.id) : null;
  }

  private async latestThreadEmail(
    userId: string,
    threadId: string,
  ): Promise<Email | undefined> {
    const [latest] = await this.emailsService.getThreadEmails(
      userId,
      threadId,
      { order: "DESC", limit: 1 },
    );
    return latest;
  }
}
