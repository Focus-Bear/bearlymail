import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SchedulingPreferencesService } from "./scheduling-preferences.service";
import { UpdateSchedulingPreferencesDto } from "./update-scheduling-preferences.dto";

@Controller("scheduling-preferences")
@UseGuards(JwtAuthGuard)
export class SchedulingPreferencesController {
  constructor(
    private readonly schedulingPreferencesService: SchedulingPreferencesService,
  ) {}

  @Get()
  async getPreferences(@Request() req) {
    return this.schedulingPreferencesService.getPreferences(req.user.userId);
  }

  @Put()
  async updatePreferences(
    @Request() req,
    @Body() body: UpdateSchedulingPreferencesDto,
  ) {
    const current = await this.schedulingPreferencesService.getPreferences(
      req.user.userId,
    );
    const effectiveStart =
      body.availabilityStartHour ?? current.availabilityStartHour;
    const effectiveEnd =
      body.availabilityEndHour ?? current.availabilityEndHour;

    if (effectiveStart >= effectiveEnd) {
      throw new BadRequestException(
        "availabilityStartHour must be less than availabilityEndHour",
      );
    }
    return this.schedulingPreferencesService.upsertPreferences(
      req.user.userId,
      body,
    );
  }
}
