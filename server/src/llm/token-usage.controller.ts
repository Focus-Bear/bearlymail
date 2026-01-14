import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { TokenUsageService } from "./token-usage.service";

@Controller("admin/token-usage")
@UseGuards(JwtAuthGuard, AdminGuard)
export class TokenUsageController {
  constructor(private tokenUsageService: TokenUsageService) {}

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
}
