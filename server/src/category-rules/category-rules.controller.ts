import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Request,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { CategoryRulesService } from "./category-rules.service";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";
import { DraftRuleFromEmailDto } from "./dto/draft-rule-from-email.dto";
import { PatchCategoryRuleDto } from "./dto/patch-category-rule.dto";
import { SuggestCategoryRulesDto } from "./dto/suggest-category-rules.dto";

@Controller("category-rules")
@UseGuards(JwtAuthGuard)
export class CategoryRulesController {
  constructor(private readonly categoryRulesService: CategoryRulesService) {}

  /**
   * List all category rules for the authenticated user.
   * GET /category-rules
   */
  @Get()
  async listRules(@Request() req) {
    return this.categoryRulesService.listRules(req.user.userId);
  }

  /**
   * Create a user-defined composite rule (sender + subject + body OR phrases).
   * POST /category-rules
   */
  @Post()
  async createRule(
    @Request() req,
    @Body() body: CreateCompositeCategoryRuleDto,
  ) {
    return this.categoryRulesService.createCompositeRule(req.user.userId, body);
  }

  /**
   * Suggest composite rules based on the user's email history.
   * Senders must have >= SUGGEST_MIN_THREAD_COUNT distinct threads to appear.
   * The client shows the suggestions for user confirmation; nothing is persisted
   * until the user accepts and the normal POST /category-rules is called.
   *
   * POST /category-rules/suggest
   */
  @Post("suggest")
  @UseGuards(AiCapacityGuard)
  async suggestRules(@Request() req, @Body() body: SuggestCategoryRulesDto) {
    return this.categoryRulesService.suggestCategoryRules(
      req.user.userId,
      body,
    );
  }

  /**
   * Draft a single composite rule from a specific email, for the category the
   * user believes the thread should have had. Reuses the LLM authoring +
   * exclusion-derivation pipeline but does NOT persist — the client shows the
   * draft for review and saves it via POST /category-rules.
   *
   * POST /category-rules/draft-from-email
   */
  @Post("draft-from-email")
  @UseGuards(AiCapacityGuard)
  async draftFromEmail(@Request() req, @Body() body: DraftRuleFromEmailDto) {
    const draft = await this.categoryRulesService.draftCompositeRuleFromEmailId(
      req.user.userId,
      body.emailId,
      body.categoryName,
    );
    if (!draft) {
      throw new UnprocessableEntityException(
        "Could not draft a rule from this email",
      );
    }
    return draft;
  }

  /**
   * Update a rule (enable/disable, rename, or replace composite match criteria).
   * PATCH /category-rules/:id
   */
  @Patch(":id")
  async patchRule(
    @Request() req,
    @Param("id") id: string,
    @Body() body: PatchCategoryRuleDto,
  ) {
    const rule = await this.categoryRulesService.updateCategoryRule(
      req.user.userId,
      id,
      body,
    );
    if (!rule) {
      throw new NotFoundException("Category rule not found");
    }
    return rule;
  }

  /**
   * Delete a rule permanently.
   * DELETE /category-rules/:id
   */
  @Delete(":id")
  async deleteRule(@Request() req, @Param("id") id: string) {
    const deleted = await this.categoryRulesService.deleteRule(
      req.user.userId,
      id,
    );
    if (!deleted) {
      throw new NotFoundException("Category rule not found");
    }
    return { success: true };
  }
}
