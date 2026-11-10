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
import { findMissingGooglePermissionGroups } from "../constants/google-oauth-scopes";
import { USER_AI_PROVIDER_DESCRIPTORS } from "../constants/user-ai-providers.constants";
import { User } from "../database/entities/user.entity";
import { decryptUserEntityForApi } from "../encryption/entity-api-decrypt.util";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";
import { DataExportService } from "./data-export.service";
import { DataImportService, ImportOptions } from "./data-import.service";
import { resolveGmailAccessIssue } from "./gmail-access-issue";
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
    const { password: _password, ...result } = withoutUserAiKeys(user);
    return {
      ...result,
      gmailAccessIssue: resolveGmailAccessIssue(user),
      missingGooglePermissions: findMissingGooglePermissionGroups(
        user.googleGrantedScopes,
      ),
    };
  }

  @Put("me")
  async updateProfile(@Request() req, @Body() updates: Partial<User>) {
    // AI keys are only set via POST /llm/me/ai-keys/:provider, which validates
    // them, so PUT /users/me cannot write them — nor ever return them.
    const updated = await this.usersService.update(
      req.user.userId,
      withoutUserAiKeys(updates),
    );
    decryptUserEntityForApi(updated);
    return withoutUserAiKeys(updated);
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

const USER_AI_KEY_FIELDS: ReadonlySet<string> = new Set([
  ...USER_AI_PROVIDER_DESCRIPTORS.map(({ column }) => column),
  "aiKeyRejections",
]);

/**
 * The user's own AI keys never travel to the client, in either direction:
 * Settings reads masked values from GET /llm/me/ai-keys instead.
 */
function withoutUserAiKeys(user: Partial<User>): Partial<User> {
  return Object.fromEntries(
    Object.entries(user).filter(([field]) => !USER_AI_KEY_FIELDS.has(field)),
  ) as Partial<User>;
}
