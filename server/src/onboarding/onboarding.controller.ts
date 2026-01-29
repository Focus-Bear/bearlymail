import { Controller, Post, Get, UseGuards, Request } from "@nestjs/common";
import { OnboardingService } from "./onboarding.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post("scan")
  async startScan(@Request() req) {
    return this.onboardingService.startHistoricalScan(req.user.userId);
  }

  @Get("scan-progress")
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
  async getEmailImportProgress(@Request() req) {
    return this.onboardingService.getEmailImportProgress(req.user.userId);
  }
}
