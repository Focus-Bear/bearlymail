import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DealNotesService } from "./deal-notes.service";
import { DealsService } from "./deals.service";
import { DealNoteContentDto } from "./dto/deal-note-content.dto";

@Controller("deals")
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(
    private readonly dealsService: DealsService,
    private readonly dealNotesService: DealNotesService,
  ) {}

  @Get("kanban")
  async getKanbanBoard(@Request() req) {
    return this.dealsService.getKanbanBoard(req.user.userId);
  }

  @Get("stages")
  async getStages(@Request() req) {
    return this.dealsService.getStages(req.user.userId);
  }

  @Post("stages")
  async createStage(
    @Request() req,
    @Body()
    body: { name: string; color?: string; isWon?: boolean; isLost?: boolean },
  ) {
    return this.dealsService.createStage(req.user.userId, body);
  }

  @Put("stages/:id")
  async updateStage(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      color?: string;
      sortOrder?: number;
      isWon?: boolean;
      isLost?: boolean;
    },
  ) {
    return this.dealsService.updateStage(req.user.userId, id, body);
  }

  @Delete("stages/:id")
  async deleteStage(@Request() req, @Param("id") id: string) {
    await this.dealsService.deleteStage(req.user.userId, id);
    return { success: true };
  }

  @Put("stages/reorder")
  async reorderStages(@Request() req, @Body() body: { stageIds: string[] }) {
    return this.dealsService.reorderStages(req.user.userId, body.stageIds);
  }

  @Get()
  async getDeals(@Request() req) {
    return this.dealsService.getDeals(req.user.userId);
  }

  @Get("by-contact/:contactId")
  async getDealsForContact(
    @Request() req,
    @Param("contactId") contactId: string,
  ) {
    return this.dealsService.getDealsForContact(req.user.userId, contactId);
  }

  @Get("by-email/:email")
  async getDealsForContactByEmail(
    @Request() req,
    @Param("email") email: string,
  ) {
    return this.dealsService.getDealsForContactByEmail(req.user.userId, email);
  }

  @Get(":id/notes")
  async getDealNotes(@Request() req, @Param("id", ParseUUIDPipe) id: string) {
    return this.dealNotesService.listNotes(req.user.userId, id);
  }

  @Post(":id/notes")
  async addDealNote(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: DealNoteContentDto,
  ) {
    return this.dealNotesService.addNote(req.user.userId, id, body.content);
  }

  @Put(":id/notes/:noteId")
  async updateDealNote(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("noteId", ParseUUIDPipe) noteId: string,
    @Body() body: DealNoteContentDto,
  ) {
    return this.dealNotesService.updateNote(
      req.user.userId,
      id,
      noteId,
      body.content,
    );
  }

  @Delete(":id/notes/:noteId")
  async deleteDealNote(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("noteId", ParseUUIDPipe) noteId: string,
  ) {
    await this.dealNotesService.deleteNote(req.user.userId, id, noteId);
    return { success: true };
  }

  @Get(":id")
  async getDeal(@Request() req, @Param("id") id: string) {
    return this.dealsService.getDeal(req.user.userId, id);
  }

  @Post()
  async createDeal(
    @Request() req,
    @Body()
    body: {
      title: string;
      details?: string;
      value?: number;
      currency?: string;
      stageId?: string;
      contactId?: string;
      expectedCloseDate?: string;
    },
  ) {
    return this.dealsService.createDeal(req.user.userId, body);
  }

  @Put(":id")
  async updateDeal(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      title?: string;
      details?: string;
      value?: number;
      currency?: string;
      stageId?: string;
      contactId?: string;
      expectedCloseDate?: string;
      sortOrder?: number;
    },
  ) {
    return this.dealsService.updateDeal(req.user.userId, id, body);
  }

  @Put(":id/move")
  async moveDeal(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { stageId: string; sortOrder?: number },
  ) {
    return this.dealsService.moveDeal(
      req.user.userId,
      id,
      body.stageId,
      body.sortOrder,
    );
  }

  @Delete(":id")
  async deleteDeal(@Request() req, @Param("id") id: string) {
    await this.dealsService.deleteDeal(req.user.userId, id);
    return { success: true };
  }
}
