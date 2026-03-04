import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotesService } from "./notes.service";

@Controller("notes")
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get("thread/:threadId")
  async getNoteByThread(@Request() req, @Param("threadId") threadId: string) {
    return this.notesService.getNoteByThread(req.user.userId, threadId);
  }

  @Get()
  async getAllNotes(@Request() req) {
    return this.notesService.getAllNotes(req.user.userId);
  }

  @Post("thread/:threadId")
  async createOrUpdateNote(
    @Request() req,
    @Param("threadId") threadId: string,
    @Body() body: { content: string },
  ) {
    return this.notesService.createOrUpdateNote(
      req.user.userId,
      threadId,
      body.content,
    );
  }

  @Delete(":id")
  async deleteNote(@Request() req, @Param("id") id: string) {
    await this.notesService.deleteNote(req.user.userId, id);
    return { message: "Note deleted" };
  }
}
