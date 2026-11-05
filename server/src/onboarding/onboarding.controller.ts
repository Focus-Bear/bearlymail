import { Controller, Get, Post, Request, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CategorisationProgressService } from "./categorisation-progress.service";
import { CategoryCountsService } from "./category-counts.service";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly categorisationProgressService: CategorisationProgressService,
    private readonly categoryCountsService: CategoryCountsService,
  ) {}

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

  @Get("categorisation-progress")
  @SkipThrottle()
  async getCategorisationProgress(@Request() req) {
    return this.categorisationProgressService.getProgress(req.user.userId);
  }

  /** Live per-category counts while onboarding re-sorts the inbox. */
  @Get("category-counts")
  @SkipThrottle()
  async getCategoryCounts(@Request() req) {
    return this.categoryCountsService.getCategoryCounts(req.user.userId);
  }
}
