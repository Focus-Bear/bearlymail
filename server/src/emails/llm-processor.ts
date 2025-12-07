import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as os from 'os';
import PgBoss = require('pg-boss');
import { Email } from '../database/entities/email.entity';
import { EmailsService } from './emails.service';
import { PriorityService } from '../priority/priority.service';
import { SummarizationService } from '../summarization/summarization.service';
import { LLMService } from '../llm/llm.service';
import { cleanEmailContent } from '../llm/email-content-cleaner';

@Injectable()
export class LLMProcessor implements OnModuleInit {
  private readonly logger = new Logger(LLMProcessor.name);
  private readonly priorityConcurrency: number;
  private readonly summaryConcurrency: number;

  constructor(
    @Inject('PG_BOSS') private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private emailsService: EmailsService,
    private priorityService: PriorityService,
    private summarizationService: SummarizationService,
    private llmService: LLMService,
    private configService: ConfigService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For LLM jobs (I/O bound), we can use more workers than CPU cores
    // Default to 2x CPU cores, but allow override via env vars
    const defaultConcurrency = Math.max(4, cpuCores * 2);
    
    this.priorityConcurrency = parseInt(
      this.configService.get<string>('LLM_PRIORITY_CONCURRENCY') || String(defaultConcurrency), 
      10
    );
    this.summaryConcurrency = parseInt(
      this.configService.get<string>('LLM_SUMMARY_CONCURRENCY') || String(defaultConcurrency), 
      10
    );
    
    this.logger.log(`CPU cores: ${cpuCores}, LLM worker concurrency: priority=${this.priorityConcurrency}, summary=${this.summaryConcurrency}`);
  }

  async onModuleInit() {
    // Worker for LLM priority refinement - process multiple jobs in parallel
    // teamSize determines how many concurrent workers process jobs from this queue
    this.logger.log(`Starting priority refinement worker with concurrency: ${this.priorityConcurrency}`);
    await this.boss.work('refine-priority', { teamSize: this.priorityConcurrency } as any, async (job) => {
      const { userId, emailId } = job.data as { userId: string; emailId: string };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Starting LLM priority refinement for email ${emailId}`);
      
      try {
        const email = await this.emailsService.getEmailById(userId, emailId);
        if (!email) {
          this.logger.warn(`Email ${emailId} not found`);
          return;
        }

        // Skip if priority already exists and is not a default/placeholder value
        if (email.priorityScore && email.priorityScore !== 50 && !email.isProcessingPriority) {
          this.logger.log(`[Worker ${workerId}] Skipping priority refinement for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}...) - already has priority: ${email.priorityScore}`);
          return;
        }

        // OPTIMIZED: Prepare all data in parallel before LLM call
        // This allows the worker to do other work while waiting for LLM
        const [userEmails, contexts] = await Promise.all([
          // Fetch user email history for avgTimeToReply
          this.emailRepository.find({
            where: { userId },
            take: 50,
            order: { receivedAt: 'DESC' },
          }),
          // Fetch user contexts for basic score calculation
          this.priorityService.getUserContexts(userId),
        ]);

        const avgTimeToReply = userEmails.length > 0
          ? userEmails
              .filter((e) => e.timeToReply)
              .reduce((sum, e) => sum + (e.timeToReply || 0), 0) / userEmails.filter((e) => e.timeToReply).length
          : undefined;

        // Calculate basic score (synchronous, fast)
        const basicScore = this.priorityService.calculateBasicPriorityScore(email, contexts);

        this.logger.log(`[Worker ${workerId}] Analyzing priority for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}..., subject: ${email.subject?.substring(0, 50)}...)`);
        
        // Clean email body: strip HTML, remove signatures, limit to 2000 chars
        const cleanedBody = cleanEmailContent(email.body, email.htmlBody, 2000);
        
        // LLM call - this is the I/O bound operation that blocks the worker
        // The teamSize concurrency setting allows multiple workers to process different emails in parallel
        const llmResult = await this.llmService.analyzePriority(
          {
            from: email.from || '',
            fromName: email.fromName,
            senderJobTitle: email.senderJobTitle,
            subject: email.subject || '',
            body: cleanedBody,
          },
          {
            averageTimeToReply: avgTimeToReply,
          },
          undefined, // provider - use default
          userId, // pass userId to use user's API key if available
        );
        
        // Combine LLM score with basic score
        const llmScore = llmResult.score;
        const combinedScore = (basicScore * 0.3) + (llmScore * 0.7);

        // Update email with refined score first (so explanation generation has the correct score)
        await this.emailRepository.update(
          { id: emailId },
          {
            priorityScore: Math.max(0, Math.min(100, combinedScore)),
            isUrgent: llmResult.isUrgent || email.isUrgent,
            isProcessingPriority: false,
          }
        );

        // Generate and save priority explanation (precompute it)
        // Refresh email to get updated priorityScore for explanation generation
        const updatedEmail = await this.emailsService.getEmailById(userId, emailId);
        if (updatedEmail) {
          const priorityExplanation = await this.emailsService.getPriorityExplanation(userId, emailId);
          // Save the explanation (this will also compute it if not already computed)
          await this.emailRepository.update(
            { id: emailId },
            { priorityExplanation: priorityExplanation }
          );
        }

        this.logger.log(`[Worker ${workerId}] Refined priority for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}...): ${combinedScore}`);
      } catch (error) {
        this.logger.error(`[Worker ${workerId}] Failed to refine priority for email ${emailId}`, error);
        // Mark as not processing so it can be retried
        await this.emailRepository.update(
          { id: emailId },
          { isProcessingPriority: false }
        );
      }
    });

    // Worker for summary generation - process multiple jobs in parallel
    this.logger.log(`Starting summary generation worker with concurrency: ${this.summaryConcurrency}`);
    await this.boss.work('generate-summary', { teamSize: this.summaryConcurrency } as any, async (job) => {
      const { userId, emailId } = job.data as { userId: string; emailId: string };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Starting summary generation for email ${emailId}`);
      
      try {
        const email = await this.emailsService.getEmailById(userId, emailId);
        if (!email) {
          this.logger.warn(`Email ${emailId} not found for summary generation`);
          return;
        }

        // Skip if summary already exists
        if (email.summary && email.summary.trim() !== '' && !email.isProcessingSummary) {
          this.logger.log(`[Worker ${workerId}] Skipping summary generation for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}...) - already has summary`);
          return;
        }

        this.logger.log(`[Worker ${workerId}] Generating thread summary for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}..., subject: ${email.subject?.substring(0, 50)}...)`);
        
        // Generate thread summary (uses last 3 messages)
        const summary = await this.summarizationService.summarizeEmail(
          userId,
          emailId,
          { type: 'tldr' },
        );

        // Update all emails in the thread with the same summary (thread-level summary)
        const threadEmails = await this.emailsService.getThreadEmails(userId, email.threadId);
        const emailIds = threadEmails.map(e => e.id);
        
        await this.emailRepository.update(
          { id: In(emailIds) }, // Update all emails in thread
          {
            summary,
            isProcessingSummary: false,
          }
        );

        this.logger.log(`[Worker ${workerId}] Generated thread summary for thread ${email.threadId?.substring(0, 8)}... (${threadEmails.length} emails updated)`);
      } catch (error) {
        this.logger.error(`[Worker ${workerId}] Failed to generate summary for email ${emailId}`, error);
        // Mark as not processing
        await this.emailRepository.update(
          { id: emailId },
          { isProcessingSummary: false }
        );
      }
    });
  }
}

