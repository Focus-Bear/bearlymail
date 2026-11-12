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
import {
  UPDATABLE_PROFILE_FIELDS,
  UpdateProfileDto,
} from "./dto/update-profile.dto";
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
    const result = withoutUserSecrets(user);
    return {
      ...result,
      gmailAccessIssue: resolveGmailAccessIssue(user),
      missingGooglePermissions: findMissingGooglePermissionGroups(
        user.googleGrantedScopes,
      ),
    };
  }

  @Put("me")
  async updateProfile(@Request() req, @Body() updates: UpdateProfileDto) {
    // The DTO makes the validation pipe reject anything else; the explicit pick
    // keeps that true even if the pipe is bypassed. AI keys, the Focus Bear
    // token and every privilege/identity column are never writable here.
    const updated = await this.usersService.update(
      req.user.userId,
      pickUpdatableProfileFields(updates),
    );
    decryptUserEntityForApi(updated);
    return withoutUserSecrets(updated);
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

    const { stillSnoozedThreads } = await this.usersService.deleteAccount(
      req.user.userId,
    );
    return {
      success: true,
      message: "Account deleted successfully",
      stillSnoozedThreads,
    };
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

const FOCUS_BEAR_TOKEN_FIELD: keyof User = "focusBearApiToken";

const USER_SECRET_FIELDS: ReadonlySet<string> = new Set([
  ...USER_AI_PROVIDER_DESCRIPTORS.map(({ column }) => column),
  "aiKeyRejections",
  FOCUS_BEAR_TOKEN_FIELD,
  "password",
  "passwordSetupToken",
  "passwordSetupTokenExpiresAt",
  "passwordResetToken",
  "passwordResetExpires",
  "totpSecret",
  "encryptedDataKey",
]);

/**
 * Credentials the client only needs to know exist (Settings shows "connected").
 * They come back as a fixed mask so `!!user.githubToken` keeps working.
 */
const MASKED_USER_FIELDS: readonly (keyof User)[] = [
  "githubToken",
  "googleCalendarAccessToken",
  "googleCalendarRefreshToken",
];
export const MASKED_SECRET_VALUE = "********";

/**
 * Secrets never travel to the client: AI keys, the Focus Bear token, password
 * and reset/setup tokens, the TOTP seed and the wrapped data key are dropped;
 * OAuth and GitHub tokens are masked. Settings reads masked AI keys from
 * GET /llm/me/ai-keys and the Focus Bear connection from its own endpoint.
 */
function withoutUserSecrets(user: Partial<User>): Partial<User> {
  const safe = Object.fromEntries(
    Object.entries(user).filter(([field]) => !USER_SECRET_FIELDS.has(field)),
  ) as Record<string, unknown>;
  for (const field of MASKED_USER_FIELDS) {
    if (safe[field]) safe[field] = MASKED_SECRET_VALUE;
  }
  return safe as Partial<User>;
}

function pickUpdatableProfileFields(updates: UpdateProfileDto): Partial<User> {
  const picked: Record<string, unknown> = {};
  for (const field of UPDATABLE_PROFILE_FIELDS) {
    if (updates?.[field] !== undefined) picked[field] = updates[field];
  }
  return picked as Partial<User>;
}
