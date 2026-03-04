import { Body, Controller, Get, Put, Request, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BatchScheduleService } from "./batch-schedule.service";

@Controller("batch-schedule")
@UseGuards(JwtAuthGuard)
export class BatchScheduleController {
  constructor(private batchScheduleService: BatchScheduleService) {}

  /**
   * Get the current batch schedule for the user
   */
  @Get()
  async getSchedule(@Request() req) {
    const schedule = await this.batchScheduleService.getSchedule(
      req.user.userId,
    );
    if (!schedule) {
      // Return default schedule if none exists
      return {
        ...this.batchScheduleService.getDefaultSchedule(),
        userId: req.user.userId,
      };
    }
    return schedule;
  }

  /**
   * Update the batch schedule
   */
  @Put()
  async updateSchedule(
    @Request() req,
    @Body()
    body: {
      deliveryDays: number[];
      deliveryTimes: string[];
      timezone: string;
      isEnabled: boolean;
      urgentBypassSchedule: boolean;
    },
  ) {
    return this.batchScheduleService.upsertSchedule(req.user.userId, body);
  }
}
