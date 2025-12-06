import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import PgBoss = require('pg-boss');
import { ContextService } from './context.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class ContextAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextAnalysisProcessor.name);

  constructor(
    @Inject('PG_BOSS') private boss: PgBoss,
    private contextService: ContextService,
    private usersService: UsersService,
  ) {}

  async onModuleInit() {
    // Worker for context analysis
    this.logger.log('Registering context-analysis worker');
    await this.boss.work('analyze-context', { teamSize: 1 } as any, async (job) => {
      const { userId } = job.data as { userId: string };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Starting context analysis for user ${userId}`);
      
      try {
        await this.contextService.analyzeAndLearnFromEmails(userId);
        this.logger.log(`[Worker ${workerId}] Completed context analysis for user ${userId}`);
      } catch (error: any) {
        this.logger.error(`[Worker ${workerId}] Failed context analysis for user ${userId}`, error);
        // Error state is already set by ContextService.analyzeAndLearnFromEmails
        // Just re-throw to mark job as failed
        throw error;
      }
    });
    
    this.logger.log('Context analysis worker registered successfully');
  }
}

