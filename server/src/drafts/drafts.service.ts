import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ReplyDraft } from "../database/entities/reply-draft.entity";

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

    if (existing) {
      existing.content = content;
      existing.replyMode = replyMode;
      existing.recipients = recipients || null;
      return this.draftRepository.save(existing);
    }

    const draft = this.draftRepository.create({
      userId,
      emailThreadId: threadId,
      content,
      replyMode,
      recipients: recipients || null,
    });

    return this.draftRepository.save(draft);
  }

  async deleteDraft(userId: string, threadId: string): Promise<void> {
    await this.draftRepository.delete({ userId, emailThreadId: threadId });
  }

  async deleteDraftById(userId: string, draftId: string): Promise<void> {
    await this.draftRepository.delete({ id: draftId, userId });
  }
}
