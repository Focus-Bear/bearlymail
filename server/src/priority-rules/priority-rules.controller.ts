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
import { PriorityRulesService } from "./priority-rules.service";
import type { UpsertPriorityRuleInput } from "./priority-rules.types";

/**
 * Inspect and manage deterministic priority rules. Lists both auto-mined and
 * user-created rules, and supports manual create / edit / enable-disable /
 * delete. Editing a mined rule converts it to user-managed so the miner stops
 * overwriting it.
 */
@Controller("priority-rules")
@UseGuards(JwtAuthGuard)
export class PriorityRulesController {
  constructor(private readonly priorityRulesService: PriorityRulesService) {}

  /** GET /priority-rules — list the authenticated user's priority rules. */
  @Get()
  async listRules(@Request() req) {
    return this.priorityRulesService.listRules(req.user.userId);
  }

  /** POST /priority-rules — create a user-managed rule. */
  @Post()
  async createRule(@Request() req, @Body() body: UpsertPriorityRuleInput) {
    return this.priorityRulesService.createRule(req.user.userId, body);
  }

  /** PATCH /priority-rules/:id — edit band/senders/phrases and/or toggle enabled. */
  @Patch(":id")
  async updateRule(
    @Request() req,
    @Param("id") id: string,
    @Body() body: UpsertPriorityRuleInput,
  ) {
    const updated = await this.priorityRulesService.updateRule(
      req.user.userId,
      id,
      body,
    );
    if (!updated) {
      throw new NotFoundException("Priority rule not found");
    }
    return updated;
  }

  /** DELETE /priority-rules/:id — delete a rule. */
  @Delete(":id")
  async deleteRule(@Request() req, @Param("id") id: string) {
    const deleted = await this.priorityRulesService.deleteRule(
      req.user.userId,
      id,
    );
    if (!deleted) {
      throw new NotFoundException("Priority rule not found");
    }
    return { id, deleted: true };
  }
}
