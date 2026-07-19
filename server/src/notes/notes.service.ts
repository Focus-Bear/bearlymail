import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { PrivateNote } from "../database/entities/private-note.entity";

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(PrivateNote)
    private noteRepository: Repository<PrivateNote>,
  ) {}

  async getNoteByThread(
    userId: string,
    threadId: string,
  ): Promise<PrivateNote | null> {
    return this.noteRepository.findOne({
      where: { userId, emailThreadId: threadId },
      order: { createdAt: "DESC" },
    });
  }

  async createOrUpdateNote(
    userId: string,
    threadId: string,
    content: string,
  ): Promise<PrivateNote> {
    const existing = await this.getNoteByThread(userId, threadId);

    if (existing) {
      existing.content = content;
      return this.noteRepository.save(existing);
    }

    const note = this.noteRepository.create({
      userId,
      emailThreadId: threadId,
      content,
    });

    return this.noteRepository.save(note);
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    await this.noteRepository.delete({ noteId, userId });
  }

  async getAllNotes(userId: string): Promise<PrivateNote[]> {
    return this.noteRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }
}
