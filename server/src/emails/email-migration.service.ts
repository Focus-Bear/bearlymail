import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { CategoryKeyBackfillService } from "../category-keys/category-key-backfill.service";
import { CategoryDedupService } from "./category-dedup.service";

/**
 * Handles one-time data migration and repair tasks that run on startup.
 *
 * Note: repairEncryptedCategoryNames() and backfillCategoryIds() have been
 * removed as part of the denormalized category column removal (fixes #1293).
 * The category and needsCategoryRepair / needsCategoryIdBackfill columns no
 * longer exist on email_threads. Migration 1787000000000 dropped them.
 */
@Injectable()
export class EmailMigrationService implements OnModuleInit {
  private readonly logger = new Logger(EmailMigrationService.name);

  constructor(
    private categoryDedupService: CategoryDedupService,
    private categoryKeyBackfillService: CategoryKeyBackfillService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Deduplicate EMAIL_CATEGORY rows flagged by migration 1786000000000
    // (fix #1258). Runs once on startup; no-ops when all flags are cleared.
    // Logic lives in CategoryDedupService.
    try {
      await this.categoryDedupService.deduplicateCategoryNames();
    } catch (err) {
      this.logger.error("deduplicateCategoryNames failed on startup", err);
    }
    try {
      await this.categoryKeyBackfillService.backfillMissingCategoryKeys();
    } catch (err) {
      this.logger.error("backfillMissingCategoryKeys failed on startup", err);
    }
  }
}
