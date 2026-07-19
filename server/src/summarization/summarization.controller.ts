import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { validatePatterns } from "./pattern-matcher";
import {
  SummarizationRule,
  SummarizationService,
} from "./summarization.service";

@Controller("summarize")
@UseGuards(JwtAuthGuard, AiCapacityGuard)
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
    @Body()
    rule: {
      whenToUse: string;
      howToSummarize: string;
      fromPatterns?: string[];
      subjectPatterns?: string[];
      priority?: number;
    },
  ) {
    const patternErrors = [
      ...validatePatterns(rule.fromPatterns ?? []),
      ...validatePatterns(rule.subjectPatterns ?? []),
    ];
    if (patternErrors.length > 0) {
      throw new BadRequestException(patternErrors.join("; "));
    }
    return this.summarizationService.createSummarizationRule(
      req.user.userId,
      rule,
    );
  }

  @Put("rules/:id")
  async updateRule(
    @Request() req,
    @Param("id") id: string,
    @Body()
    updates: {
      whenToUse?: string;
      howToSummarize?: string;
      fromPatterns?: string[];
      subjectPatterns?: string[];
      priority?: number;
    },
  ) {
    const patternErrors = [
      ...validatePatterns(updates.fromPatterns ?? []),
      ...validatePatterns(updates.subjectPatterns ?? []),
    ];
    if (patternErrors.length > 0) {
      throw new BadRequestException(patternErrors.join("; "));
    }
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

    // Persist the full-thread summary to the DB so subsequent page loads show
    // the refreshed version. Fire-and-forget — the response is already correct.
    this.summarizationService
      .persistSummaryForThread(
        req.user.userId,
        result.threadId,
        result.emailThreadId,
        result.summary,
      )
      .catch(() => {
        // Non-critical: response already contains the correct summary
      });

    return {
      summary: result.summary,
      phishingSignal: result.phishingSignal ?? null,
      summaryDebug: result.summaryDebug,
    };
  }
}
