import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  SummarizationService,
  SummarizationRule,
} from "./summarization.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("summarize")
@UseGuards(JwtAuthGuard)
export class SummarizationController {
  constructor(private readonly summarizationService: SummarizationService) {}

  // Specific routes must come BEFORE parameterized routes to avoid conflicts
  @Get("rules")
  async getRules(@Request() req) {
    return this.summarizationService.getSummarizationRules(req.user.userId);
  }

  @Post("rules")
  async createRule(
    @Request() req,
    @Body() rule: { whenToUse: string; howToSummarize: string },
  ) {
    return this.summarizationService.createSummarizationRule(
      req.user.userId,
      rule,
    );
  }

  @Put("rules/:id")
  async updateRule(
    @Request() req,
    @Param("id") id: string,
    @Body() updates: { whenToUse?: string; howToSummarize?: string },
  ) {
    return this.summarizationService.updateSummarizationRule(
      req.user.userId,
      id,
      updates,
    );
  }

  @Delete("rules/:id")
  async deleteRule(@Request() req, @Param("id") id: string) {
    await this.summarizationService.deleteSummarizationRule(
      req.user.userId,
      id,
    );
    return { message: "Rule deleted" };
  }

  @Post("match-rule/:id")
  async matchRule(@Request() req, @Param("id") id: string) {
    const matchedRule = await this.summarizationService.matchRuleForEmail(
      req.user.userId,
      id,
    );
    return { rule: matchedRule };
  }

  // Parameterized route comes LAST to avoid matching "rules" as an ID
  @Post(":id")
  async summarizeEmail(
    @Request() req,
    @Param("id") id: string,
    @Body() rule: SummarizationRule & { provider?: "gemini" | "openai" },
  ) {
    const result = await this.summarizationService.summarizeEmailWithPhishing(
      req.user.userId,
      id,
      rule,
    );
    return {
      summary: result.summary,
      phishingSignal: result.phishingSignal ?? null,
    };
  }
}
