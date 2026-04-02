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
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CategoryRulesService } from "./category-rules.service";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";
import { PatchCategoryRuleDto } from "./dto/patch-category-rule.dto";

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
