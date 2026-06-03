import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { AdminGuard } from "../auth/admin.guard";
import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DebugConfig } from "../database/entities/debug-config.entity";
import { DebugService } from "../debug/debug.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailDebugAdminController } from "./email-debug-admin.controller";
import { EmailDebugCategoryService } from "./email-debug-category.service";
import { EmailDebugPhishingService } from "./email-debug-phishing.service";
import { EmailDebugRawColumnsService } from "./email-debug-raw-columns.service";
import { EmailFollowUpService } from "./email-follow-up.service";
import { EmailInboxTraceService } from "./email-inbox-trace.service";
import { EmailsService } from "./emails.service";

function makeDebugService(): jest.Mocked<DebugService> {
  return {
    getAllConfigs: jest.fn(),
    updateDebugConfig: jest.fn().mockResolvedValue(undefined),
    getRedundancySummary: jest.fn().mockResolvedValue([]),
    queryData: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    deleteFeatureData: jest.fn().mockResolvedValue(0),
    isEnabled: jest.fn().mockResolvedValue(false),
    log: jest.fn().mockResolvedValue(undefined),
    logBatch: jest.fn().mockResolvedValue(undefined),
    setEnabled: jest.fn().mockResolvedValue(undefined),
    setRetentionDays: jest.fn().mockResolvedValue(undefined),
    cleanupExpiredData: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<DebugService>;
}

describe("EmailDebugAdminController — debug config/data endpoints", () => {
  let controller: EmailDebugAdminController;
  let debugService: jest.Mocked<DebugService>;

  beforeEach(async () => {
    debugService = makeDebugService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailDebugAdminController],
      providers: [
        { provide: DebugService, useValue: debugService },
        { provide: EmailsService, useValue: {} },
        { provide: EmailAdminService, useValue: {} },
        {
          provide: EmailDebugRawColumnsService,
          useValue: { getRawColumns: jest.fn() },
        },
        { provide: "PG_BOSS", useValue: {} },
        {
          provide: GoogleAccountsService,
          useValue: { hasConnectedGmail: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: Office365AccountsService,
          useValue: {
            hasConnectedOffice365: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: ZohoAccountsService,
          useValue: { hasConnectedZoho: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: UsersService,
          useValue: { findOneWithTokens: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: EmailInboxTraceService,
          useValue: { traceCategoryFetch: jest.fn() },
        },
        {
          provide: EmailFollowUpService,
          useValue: { getFollowUpDebugInfo: jest.fn() },
        },
        {
          provide: EmailDebugCategoryService,
          useValue: { listEmailCategoryContexts: jest.fn() },
        },
        {
          provide: EmailDebugPhishingService,
          useValue: { getPhishingDebugInfo: jest.fn() },
        },
      ],
    })
      // Override guards so unit tests don't need a full auth setup
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailProviderRequiredGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EmailDebugAdminController>(
      EmailDebugAdminController,
    );
  });

  // ─── Guards are applied ───────────────────────────────────────────────────────

  it("has JwtAuthGuard applied at controller level", () => {
    const guards = Reflect.getMetadata(
      "__guards__",
      EmailDebugAdminController,
    ) as unknown[];
    const guardNames = guards.map((guard: unknown) =>
      typeof guard === "function"
        ? (guard as { name: string }).name
        : String(guard),
    );
    expect(guardNames).toContain("JwtAuthGuard");
  });

  it("has EmailProviderRequiredGuard applied at controller level", () => {
    const guards = Reflect.getMetadata(
      "__guards__",
      EmailDebugAdminController,
    ) as unknown[];
    const guardNames = guards.map((guard: unknown) =>
      typeof guard === "function"
        ? (guard as { name: string }).name
        : String(guard),
    );
    expect(guardNames).toContain("EmailProviderRequiredGuard");
  });

  // ─── PATCH admin/debug/configs/:feature ──────────────────────────────────────

  describe("updateDebugConfig()", () => {
    it("returns the updated config when feature exists", async () => {
      const feature = "priority_analysis_tracking";
      const mockConfig: Partial<DebugConfig> = {
        feature,
        enabled: true,
        retentionDays: 7,
      };
      debugService.getAllConfigs.mockResolvedValue([mockConfig as DebugConfig]);

      const result = await controller.updateDebugConfig(feature, {
        enabled: true,
      });

      expect(debugService.updateDebugConfig).toHaveBeenCalledWith(feature, {
        enabled: true,
        retentionDays: undefined,
      });
      expect(result).toEqual(mockConfig);
    });

    it("throws NotFoundException when feature does not exist in configs", async () => {
      debugService.getAllConfigs.mockResolvedValue([]);

      await expect(
        controller.updateDebugConfig("nonexistent_feature", { enabled: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET admin/debug/data/:feature ───────────────────────────────────────────

  describe("getDebugData()", () => {
    it("passes valid parsed limit and offset to the service", async () => {
      await controller.getDebugData("priority_analysis_tracking", "10", "20");
      expect(debugService.queryData).toHaveBeenCalledWith(
        "priority_analysis_tracking",
        { limit: 10, offset: 20, userId: undefined },
      );
    });

    it("throws BadRequestException for non-numeric limit", async () => {
      await expect(
        controller.getDebugData("priority_analysis_tracking", "abc"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for non-numeric offset", async () => {
      await expect(
        controller.getDebugData("priority_analysis_tracking", undefined, "xyz"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── GET admin/debug/data/:feature/summary ───────────────────────────────────

  describe("getDebugDataSummary()", () => {
    it("delegates to debugService.getRedundancySummary()", async () => {
      const mockRows = [{ threadId: "t1", analysisCount: "3" }];
      debugService.getRedundancySummary.mockResolvedValue(mockRows);

      const result = await controller.getDebugDataSummary(
        "priority_analysis_tracking",
      );

      expect(debugService.getRedundancySummary).toHaveBeenCalledWith(
        "priority_analysis_tracking",
      );
      expect(result).toBe(mockRows);
    });
  });
});
