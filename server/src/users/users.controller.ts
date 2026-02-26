import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  UseGuards,
  Request,
  Body,
  BadRequestException,
  Logger,
  Res,
  Header,
} from "@nestjs/common";
import { Response } from "express";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { User } from "../database/entities/user.entity";
import { DataExportService } from "./data-export.service";
import { DataImportService, ImportOptions } from "./data-import.service";
import * as fs from "fs";
import * as path from "path";

// Performance budgets for consent-status
// 200ms - should be very fast (just a user lookup)
const CONSENT_STATUS_BUDGET = 200;

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

  constructor(
    private readonly usersService: UsersService,
    private readonly dataExportService: DataExportService,
    private readonly dataImportService: DataImportService,
  ) {}

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
    const { password: _password, ...result } = user;
    return result;
  }

  @Put("me")
  async updateProfile(@Request() req, @Body() updates: Partial<User>) {
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

  @Delete("me")
  async deleteAccount(
    @Request() req,
    @Body() body: { confirmationText: string },
  ) {
    const expectedConfirmation = "delete all my data";
    if (body.confirmationText !== expectedConfirmation) {
      throw new BadRequestException(
        `Please type "${expectedConfirmation}" to confirm account deletion`,
      );
    }

    await this.usersService.deleteAccount(req.user.userId);
    return { success: true, message: "Account deleted successfully" };
  }

  @Get("me/export")
  @Header("Content-Type", "application/json")
  @Header(
    "Content-Disposition",
    'attachment; filename="bearlymail-export.json"',
  )
  async exportData(@Request() req, @Res() res: Response) {
    const exportData = await this.dataExportService.exportUserData(
      req.user.userId,
    );
    res.send(JSON.stringify(exportData, null, 2));
  }

  @Post("me/import")
  async importData(
    @Request() req,
    @Body() body: { importPayload: unknown; options?: Partial<ImportOptions> },
  ) {
    if (!body.importPayload) {
      throw new BadRequestException("Missing import data");
    }

    const result = await this.dataImportService.importUserData(
      req.user.userId,
      body.importPayload,
      body.options,
    );

    return result;
  }
}
