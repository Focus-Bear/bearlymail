import {
  Controller,
  Get,
  Put,
  Post,
  UseGuards,
  Request,
  Body,
  Logger,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import * as fs from "fs";
import * as path from "path";

// Performance budgets for consent-status
const CONSENT_STATUS_BUDGET = 200; // 200ms - should be very fast (just a user lookup)

class ConsentStatusPerformanceTracker {
  private startTime: number;
  private logger = new Logger("ConsentStatusPerformanceTracker");
  private static logsDir = path.join(process.cwd(), "logs");
  private logFile = path.join(
    ConsentStatusPerformanceTracker.logsDir,
    "performance.log",
  );

  constructor() {
    this.startTime = Date.now();
    if (!fs.existsSync(ConsentStatusPerformanceTracker.logsDir)) {
      fs.mkdirSync(ConsentStatusPerformanceTracker.logsDir, {
        recursive: true,
      });
    }
  }

  finish(): void {
    const duration = Date.now() - this.startTime;
    if (duration > CONSENT_STATUS_BUDGET) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: "consent-status",
        duration,
        budget: CONSENT_STATUS_BUDGET,
        exceeded: true,
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;
      this.logger.warn(
        `⚠️ PERF ISSUE: consent-status took ${duration}ms (budget: ${CONSENT_STATUS_BUDGET}ms)`,
      );

      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch (err) {
        this.logger.error("Failed to write to performance log file:", err);
      }
    }
  }
}

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get("consent-status")
  async getConsentStatus(@Request() req) {
    const perf = new ConsentStatusPerformanceTracker();

    try {
      const result = await this.usersService.getConsentStatus(req.user.userId);
      perf.finish();
      return result;
    } catch (error) {
      perf.finish();
      throw error;
    }
  }

  @Get("me")
  async getProfile(@Request() req) {
    const user = await this.usersService.findOne(req.user.userId);
    const { password, ...result } = user;
    return result;
  }

  @Put("me")
  async updateProfile(@Request() req, @Body() updates: any) {
    return this.usersService.update(req.user.userId, updates);
  }

  @Post("accept-consent")
  async acceptConsent(
    @Request() req,
    @Body() body: { termsAccepted: boolean; privacyAccepted: boolean },
  ) {
    return this.usersService.acceptConsent(
      req.user.userId,
      body.termsAccepted,
      body.privacyAccepted,
    );
  }

  @Put("tour-complete")
  async markTourComplete(@Request() req) {
    return this.usersService.update(req.user.userId, { hasSeenTour: true });
  }
}
