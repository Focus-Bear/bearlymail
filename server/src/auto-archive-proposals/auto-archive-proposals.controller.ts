import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AutoArchiveProposalsProcessor } from "./auto-archive-proposals.processor";
import { AutoArchiveProposalsService } from "./auto-archive-proposals.service";
import {
  ApproveProposalDto,
  AutoArchiveProposalView,
  ProposalKeywordsDto,
  ProposalPreviewResult,
} from "./auto-archive-proposals.types";

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

/**
 * Suggested auto-archive rules: list, re-simulate with edited keywords,
 * approve (creates a normal archive workflow) or dismiss (remembered).
 */
@Controller("auto-archive-proposals")
@UseGuards(JwtAuthGuard)
export class AutoArchiveProposalsController {
  constructor(
    private readonly proposalsService: AutoArchiveProposalsService,
    private readonly proposalsProcessor: AutoArchiveProposalsProcessor,
  ) {}

  @Get()
  async list(
    @Request() req: AuthenticatedRequest,
  ): Promise<AutoArchiveProposalView[]> {
    return this.proposalsService.listPending(req.user.userId);
  }

  /** Queue a full re-analysis now (otherwise it runs daily in the background). */
  @Post("scan")
  async scan(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ queued: boolean }> {
    const jobId = await this.proposalsProcessor.enqueueUser(req.user.userId, {
      forceFull: true,
      userTriggered: true,
    });
    return { queued: jobId !== null };
  }

  @Post(":id/preview")
  async preview(
    @Request() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() keywords: ProposalKeywordsDto,
  ): Promise<ProposalPreviewResult> {
    return this.proposalsService.preview(req.user.userId, id, keywords);
  }

  @Post(":id/approve")
  async approve(
    @Request() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ApproveProposalDto,
  ): Promise<AutoArchiveProposalView> {
    return this.proposalsService.approve(req.user.userId, id, body);
  }

  @Post(":id/dismiss")
  async dismiss(
    @Request() req: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<AutoArchiveProposalView> {
    return this.proposalsService.dismiss(req.user.userId, id);
  }
}
