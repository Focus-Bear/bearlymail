import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsSelect, In, IsNull, Not, Repository } from "typeorm";

import { REPLY_DRAFT_SOURCES } from "../constants/domain-types";
import { ReplyDraft } from "../database/entities/reply-draft.entity";

/** The fields an AI assistant writes on a draft it prepares. */
export type AssistantDraftFields = Pick<
  ReplyDraft,
  "content" | "recipients" | "subject" | "cc" | "bcc" | "attachments"
>;

/** Every column except the attachments, which can be megabytes per draft. */
const DRAFT_SUMMARY_COLUMNS: FindOptionsSelect<ReplyDraft> = {
  id: true,
  userId: true,
  emailThreadId: true,
  content: true,
  replyMode: true,
  recipients: true,
  subject: true,
  cc: true,
  bcc: true,
  source: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class DraftsService {
  constructor(
    @InjectRepository(ReplyDraft)
    private draftRepository: Repository<ReplyDraft>,
  ) {}

  async getDraftByThread(
    userId: string,
    threadId: string,
  ): Promise<ReplyDraft | null> {
    return this.draftRepository.findOne({
      where: { userId, emailThreadId: threadId },
    });
  }

  async saveDraft(
    userId: string,
    threadId: string,
    content: string,
    replyMode: "reply" | "replyAll" = "reply",
    recipients?: string,
  ): Promise<ReplyDraft> {
    const existing = await this.getDraftByThread(userId, threadId);

    // The user has now written (or edited) this draft themselves, so it no longer
    // counts as an unseen auto-responder draft.
    if (existing) {
      existing.content = content;
      existing.replyMode = replyMode;
      existing.recipients = recipients || null;
      existing.source = REPLY_DRAFT_SOURCES.USER;
      return this.draftRepository.save(existing);
    }

    const draft = this.draftRepository.create({
      userId,
      emailThreadId: threadId,
      content,
      replyMode,
      recipients: recipients || null,
      source: REPLY_DRAFT_SOURCES.USER,
    });

    return this.draftRepository.save(draft);
  }

  async getDraftById(
    userId: string,
    draftId: string,
  ): Promise<ReplyDraft | null> {
    return this.draftRepository.findOne({ where: { id: draftId, userId } });
  }

  /**
   * Saves a draft an AI assistant prepared: a reply when `emailThreadId` is
   * set, otherwise a new message. Never sends anything.
   */
  async createAssistantDraft(
    userId: string,
    emailThreadId: string | null,
    fields: AssistantDraftFields,
  ): Promise<ReplyDraft> {
    return this.draftRepository.save(
      this.draftRepository.create({
        userId,
        emailThreadId,
        replyMode: "reply",
        source: REPLY_DRAFT_SOURCES.ASSISTANT,
        ...fields,
      }),
    );
  }

  async updateAssistantDraft(
    draft: ReplyDraft,
    changes: Partial<AssistantDraftFields>,
  ): Promise<ReplyDraft> {
    return this.draftRepository.save(Object.assign(draft, changes));
  }

  /** Newest first, without attachment contents. */
  async listDraftSummaries(
    userId: string,
    limit: number,
  ): Promise<ReplyDraft[]> {
    return this.draftRepository.find({
      select: DRAFT_SUMMARY_COLUMNS,
      where: { userId },
      order: { updatedAt: "DESC" },
      take: limit,
    });
  }

  /** Which of these drafts carry attachments, without loading them. */
  async findDraftIdsWithAttachments(
    userId: string,
    draftIds: string[],
  ): Promise<Set<string>> {
    if (!draftIds.length) return new Set();
    const rows = await this.draftRepository.find({
      select: { id: true },
      where: { userId, id: In(draftIds), attachments: Not(IsNull()) },
    });
    return new Set(rows.map((row) => row.id));
  }

  async deleteDraft(userId: string, threadId: string): Promise<void> {
    await this.draftRepository.delete({ userId, emailThreadId: threadId });
  }

  async deleteDraftById(userId: string, draftId: string): Promise<void> {
    await this.draftRepository.delete({ id: draftId, userId });
  }
}
