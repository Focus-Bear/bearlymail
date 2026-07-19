import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { LocalModelUsageService } from "./local-model-usage.service";

/** Parse an optional date query param; throw 400 on a provided-but-invalid value. */
function parseDateParam(
  value: string | undefined,
  field: string,
): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${field}: "${value}"`);
  }
  return date;
}

@Controller("admin/local-model-usage")
@UseGuards(JwtAuthGuard, AdminGuard)
export class LocalModelUsageController {
  constructor(
    private readonly localModelUsageService: LocalModelUsageService,
  ) {}

  /**
   * Admin-wide priority/category source split (local model vs LLM vs rule) over
   * the given window. Defaults to the last 7 days when no dates are supplied.
   */
  @Get()
  async getUsage(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const usage = await this.localModelUsageService.getUsage({
      startDate: parseDateParam(startDate, "startDate"),
      endDate: parseDateParam(endDate, "endDate"),
    });
    return { ...usage, timestamp: new Date().toISOString() };
  }
}
