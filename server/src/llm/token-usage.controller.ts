import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TokenUsageService } from "./token-usage.service";

@Controller("admin/token-usage")
@UseGuards(JwtAuthGuard, AdminGuard)
export class TokenUsageController {
  constructor(private tokenUsageService: TokenUsageService) {}

  /**
   * Get captured prompt examples (longest prompt per operation)
   */
  @Get("examples")
  getPromptExamples() {
    const examples = this.tokenUsageService.getPromptExamples();
    return { examples, timestamp: new Date().toISOString() };
  }

  /**
   * Reset all captured prompt examples
   */
  @Post("examples/reset")
  async resetPromptExamples() {
    await this.tokenUsageService.resetPromptExamples();
    return {
      success: true,
      message: "Prompt examples reset",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get aggregated token usage by operation
   */
  @Get()
  async getUsageByOperation(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("userId") userId?: string,
    @Query("provider") provider?: string,
  ) {
    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
      provider,
    };

    const usage = await this.tokenUsageService.getUsageByOperation(options);
    return { usage, timestamp: new Date().toISOString() };
  }

  /**
   * Get total usage summary
   */
  @Get("summary")
  async getUsageSummary(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("userId") userId?: string,
    @Query("provider") provider?: string,
  ) {
    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
      provider,
    };

    const summary = await this.tokenUsageService.getUsageSummary(options);
    return { summary, timestamp: new Date().toISOString() };
  }

  /**
   * Get daily usage breakdown
   */
  @Get("daily")
  async getDailyUsage(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("userId") userId?: string,
    @Query("provider") provider?: string,
  ) {
    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
      provider,
    };

    const daily = await this.tokenUsageService.getDailyUsage(options);
    return { daily, timestamp: new Date().toISOString() };
  }

  /**
   * Get top 10 users by total token consumption
   */
  @Get("by-user")
  async getUsageByUser(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("provider") provider?: string,
  ) {
    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      provider,
    };

    const users = await this.tokenUsageService.getUsageByUser(options);
    return { users, timestamp: new Date().toISOString() };
  }

  /**
   * Get duplicate summarization report.
   * Identifies emails that have been summarized multiple times.
   */
  @Get("duplicate-summarizations")
  async getDuplicateSummarizationReport(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("userId") userId?: string,
  ) {
    const options = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
    };

    const report =
      await this.tokenUsageService.getDuplicateSummarizationReport(options);
    return { ...report, timestamp: new Date().toISOString() };
  }

  /**
   * Get duplicate LLM-call report: prompt-content hashes that recurred across
   * calls (same system+user prompt run more than once), with the call sites and
   * operations responsible. Requires the `llm_call_fingerprint` debug feature to
   * have been enabled; returns [] otherwise.
   */
  @Get("duplicate-calls")
  async getDuplicateCalls(
    @Query("days") days?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedDays = days ? parseInt(days, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const duplicates = await this.tokenUsageService.findDuplicateLlmCalls(
      parsedDays && parsedDays > 0 ? parsedDays : undefined,
      parsedLimit && parsedLimit > 0 ? parsedLimit : undefined,
    );
    return { duplicates, timestamp: new Date().toISOString() };
  }
}
