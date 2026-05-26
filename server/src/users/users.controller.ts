import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Logger,
  Post,
  Put,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import * as fs from "fs";
import * as path from "path";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { User } from "../database/entities/user.entity";
import { decryptUserEntityForApi } from "../encryption/entity-api-decrypt.util";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";
import { DataExportService } from "./data-export.service";
import { DataImportService, ImportOptions } from "./data-import.service";
import { UsersService } from "./users.service";

// Performance budgets for consent-status
// 200ms - should be very fast (just a user lookup)
const CONSENT_STATUS_BUDGET = 200;

class ConsentStatusPerformanceTracker {
  private startTime: number;
  private logger = new Logger("ConsentStatusPerformanceTracker");
  private logFile = path.join(LOGS_DIR, "performance.log");

  constructor() {
    this.startTime = Date.now();
    ensureLogsDirSync();
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

      // Development only. In production the container filesystem is read-only,
      // so the write throws ENOENT every time and the error log itself becomes
      // high-volume CloudWatch spam.
      if (isDevelopment) {
        try {
          fs.appendFileSync(this.logFile, logLine);
        } catch (err) {
          this.logger.error("Failed to write to performance log file:", err);
        }
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
    decryptUserEntityForApi(user);
    // Never return the raw Anthropic key — expose presence only.
    const {
      password: _password,
      anthropicApiKey: _anthropicApiKey,
      ...result
    } = user;
    return {
      ...result,
      hasAnthropicKey: !!user.anthropicApiKey,
    };
  }

  @Put("me")
  async updateProfile(@Request() req, @Body() updates: Partial<User>) {
    // Anthropic key must only be set via POST /llm/me/anthropic-key (validated + encrypted).
    // Strip it here so PUT /users/me cannot bypass that validation.
    const { anthropicApiKey: _stripped, ...safeUpdates } = updates as Record<
      string,
      unknown
    > & { anthropicApiKey?: unknown };
    const updated = await this.usersService.update(
      req.user.userId,
      safeUpdates as Partial<User>,
    );
    decryptUserEntityForApi(updated);
    return updated;
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
