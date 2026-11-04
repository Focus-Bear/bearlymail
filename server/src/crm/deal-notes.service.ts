import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Deal } from "../database/entities/deal.entity";
import { DealNote } from "../database/entities/deal-note.entity";

export interface DealNoteResponse {
  id: string;
  dealId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

function toDealNoteResponse(note: DealNote): DealNoteResponse {
  return {
    id: note.id,
    dealId: note.dealId,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

/**
 * Notes on a deal. Every operation is scoped to the calling user: a deal or
 * note belonging to someone else is reported as not found, never revealed.
 */
@Injectable()
export class DealNotesService {
  constructor(
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    @InjectRepository(DealNote)
    private readonly dealNoteRepository: Repository<DealNote>,
  ) {}

  async listNotes(userId: string, dealId: string): Promise<DealNoteResponse[]> {
    await this.assertDealOwned(userId, dealId);
    const notes = await this.dealNoteRepository.find({
      where: { dealId, userId },
      order: { createdAt: "DESC" },
    });
    return notes.map(toDealNoteResponse);
  }

  async addNote(
    userId: string,
    dealId: string,
    content: string,
  ): Promise<DealNoteResponse> {
    await this.assertDealOwned(userId, dealId);
    const note = await this.dealNoteRepository.save(
      this.dealNoteRepository.create({ dealId, userId, content }),
    );
    return toDealNoteResponse(note);
  }

  async updateNote(
    userId: string,
    dealId: string,
    noteId: string,
    content: string,
  ): Promise<DealNoteResponse> {
    const note = await this.findOwnedNote(userId, dealId, noteId);
    note.content = content;
    return toDealNoteResponse(await this.dealNoteRepository.save(note));
  }

  async deleteNote(
    userId: string,
    dealId: string,
    noteId: string,
  ): Promise<void> {
    const note = await this.findOwnedNote(userId, dealId, noteId);
    await this.dealNoteRepository.remove(note);
  }

  private async assertDealOwned(userId: string, dealId: string): Promise<void> {
    const isOwned = await this.dealRepository.exists({
      where: { id: dealId, userId },
    });
    if (!isOwned) throw new NotFoundException(ERROR_MESSAGES.DEAL_NOT_FOUND);
  }

  private async findOwnedNote(
    userId: string,
    dealId: string,
    noteId: string,
  ): Promise<DealNote> {
    const note = await this.dealNoteRepository.findOne({
      where: { id: noteId, dealId, userId },
    });
    if (!note) throw new NotFoundException(ERROR_MESSAGES.DEAL_NOTE_NOT_FOUND);
    return note;
  }
}
