import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import PgBoss = require('pg-boss');
import { PriorityLearningService } from './priority-learning.service';

@Injectable()
export class PriorityLearningProcessor implements OnModuleInit {
  private readonly logger = new Logger(PriorityLearningProcessor.name);

  constructor(
    @Inject('PG_BOSS') private boss: PgBoss,
    private priorityLearningService: PriorityLearningService,
  ) {}

  async onModuleInit() {
    // Worker for learning from star selections
    await this.boss.work('learn-from-star', async (job) => {
      const { userId, emailId, starCount } = job.data as { userId: string; emailId: string; starCount: number };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Learning from star selection for email ${emailId}, starCount: ${starCount}`);
      
      try {
        await this.priorityLearningService.learnFromStarSelection(userId, emailId, starCount);
        this.logger.log(`[Worker ${workerId}] Completed learning for email ${emailId}`);
      } catch (error) {
        this.logger.error(`[Worker ${workerId}] Failed to learn from star selection for email ${emailId}`, error);
        // Don't throw - learning failures shouldn't block other operations
      }
    });
    
    this.logger.log('Priority learning processor initialized');
  }
}





