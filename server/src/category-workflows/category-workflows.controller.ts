import {
  Body,
  Controller,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CategoryWorkflowsService } from "./category-workflows.service";
import {
  ArchiveAllInCategoryDto,
  ArchiveAllResult,
  SuggestionResponseDto,
} from "./category-workflows.types";

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

/**
 * REST API backing the category "archive all" → auto-archive-workflow
 * suggestion flow.
 */
@Controller("category-workflows")
@UseGuards(JwtAuthGuard)
export class CategoryWorkflowsController {
  constructor(
    private readonly categoryWorkflowsService: CategoryWorkflowsService,
  ) {}

  /**
   * Archive every email in a category "archive all", and report whether the
   * user should be offered an auto-archive workflow for that category.
   */
  @Post("archive-all")
  async archiveAll(
    @Request() req: AuthenticatedRequest,
    @Body() body: ArchiveAllInCategoryDto,
  ): Promise<ArchiveAllResult> {
    return this.categoryWorkflowsService.archiveAllInCategory(
      req.user.userId,
      body.emailIds,
    );
  }

  /**
   * Record the user's response to the auto-archive suggestion so we stop
   * prompting: "accepted" (they created the workflow) or "dismissed".
   */
  @Post(":categoryId/suggestion-response")
  async respondToSuggestion(
    @Request() req: AuthenticatedRequest,
    @Param("categoryId") categoryId: string,
    @Body() body: SuggestionResponseDto,
  ): Promise<{ ok: true }> {
    await this.categoryWorkflowsService.respondToSuggestion(
      req.user.userId,
      categoryId,
      body.response,
    );
    return { ok: true };
  }
}
