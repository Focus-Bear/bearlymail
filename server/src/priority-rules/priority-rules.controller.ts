import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PriorityRulesService } from "./priority-rules.service";

/**
 * Inspect/manage learned deterministic priority rules. Read-only listing plus a
 * manual enable/disable toggle — rules are created by the miner, not here.
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

  /** PATCH /priority-rules/:id — enable/disable a rule. */
  @Patch(":id")
  async setEnabled(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { isEnabled: boolean },
  ) {
    const updated = await this.priorityRulesService.setEnabled(
      req.user.userId,
      id,
      body.isEnabled,
    );
    if (!updated) {
      throw new NotFoundException("Priority rule not found");
    }
    return { id, isEnabled: body.isEnabled };
  }
}
