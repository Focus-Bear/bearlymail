import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import PgBoss = require('pg-boss');
import { ScanAnalysisService } from './scan-analysis.service';

@Injectable()
export class ScanAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ScanAnalysisProcessor.name);

  constructor(
    @Inject('PG_BOSS') private boss: PgBoss,
    private readonly scanAnalysisService: ScanAnalysisService,
  ) {}

  async onModuleInit() {
    // Worker for analyzing scan results after scan completes
    this.logger.log('Registering analyze-scan-results worker');
    await this.boss.work('analyze-scan-results', async (job) => {
      const { userId } = job.data as { userId: string };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Starting analysis of scan results for user ${userId}`);
      try {
        await this.scanAnalysisService.analyzeScanResults(userId);
        this.logger.log(`[Worker ${workerId}] Completed analysis for user ${userId}`);
      } catch (error) {
        this.logger.error(`[Worker ${workerId}] Failed to analyze scan results for user ${userId}:`, error);
        throw error; // Re-throw to allow retry
      }
    });
    this.logger.log('analyze-scan-results worker registered successfully');
  }
}





