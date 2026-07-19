import { Controller, Get, Post, Request, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post("scan")
  async startScan(@Request() req) {
    return this.onboardingService.startHistoricalScan(req.user.userId);
  }

  @Get("scan-progress")
  @SkipThrottle()
  async getScanProgress(@Request() req) {
    return this.onboardingService.getScanProgress(req.user.userId);
  }

  @Get("status")
  async getOnboardingStatus(@Request() req) {
    return this.onboardingService.getOnboardingStatus(req.user.userId);
  }

  @Post("complete")
  async completeOnboarding(@Request() req) {
    return this.onboardingService.completeOnboarding(req.user.userId);
  }

  @Get("email-import-progress")
  @SkipThrottle()
  async getEmailImportProgress(@Request() req) {
    return this.onboardingService.getEmailImportProgress(req.user.userId);
  }
}
