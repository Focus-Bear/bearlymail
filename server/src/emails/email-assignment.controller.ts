import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Request,
  UseGuards,
} from "@nestjs/common";

import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AssignThreadDto } from "./dto/assign-thread.dto";
import { EmailAssignmentService } from "./email-assignment.service";

@Controller("emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class EmailAssignmentController {
  constructor(
    private readonly emailAssignmentService: EmailAssignmentService,
  ) {}

  // ─── Thread Assignment (Batch B — #1112) ─────────────────────────────────────

  /**
   * Assign a thread to an org member.
   * PATCH /emails/threads/:threadId/assign
   *
   * Caller must be an active org member.
   * Regular members may only self-assign; admins/owners may assign to anyone.
   */
  @Patch("threads/:threadId/assign")
  async assignThread(
    @Request() req,
    @Param("threadId", new ParseUUIDPipe()) threadId: string,
    @Body() dto: AssignThreadDto,
  ) {
    return this.emailAssignmentService.assignThread(
      req.user.userId,
      threadId,
      dto.assigneeUserId,
    );
  }

  /**
   * Unassign a thread (clear assigneeId).
   * DELETE /emails/threads/:threadId/assign
   *
   * Any active org member may unassign any thread in their org.
   */
  @Delete("threads/:threadId/assign")
  @HttpCode(HttpStatus.OK)
  async unassignThread(
    @Request() req,
    @Param("threadId", new ParseUUIDPipe()) threadId: string,
  ) {
    return this.emailAssignmentService.unassignThread(
      req.user.userId,
      threadId,
    );
  }

  /**
   * List all threads assigned to a given user within the caller's org.
   * GET /emails/assigned/:userId
   *
   * Caller must be an active org member; target must be in the same org.
   */
  @Get("assigned/:userId")
  async getThreadsAssignedToUser(
    @Request() req,
    @Param("userId", new ParseUUIDPipe()) targetUserId: string,
  ) {
    return this.emailAssignmentService.listThreadsAssignedToUser(
      req.user.userId,
      targetUserId,
    );
  }
}
