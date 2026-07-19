import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { StructuralError } from "../errors/structural-error";
import { registerWorker } from "../queue/register-worker";
import { WorkflowContext } from "./types/workflow.types";
import { WorkflowExecutionService } from "./workflow-execution.service";
import { WorkflowsService } from "./workflows.service";

interface EvaluateWorkflowsJobData {
  userId: string;
  emailThreadId: string;
}

const MAX_BODY_CHARS = 4000;

/** Priority score thresholds — mirror the scoring rubric in priority.utils.ts */
const PRIORITY_THRESHOLD_VERY_HIGH = 80;
const PRIORITY_THRESHOLD_HIGH = 60;
const PRIORITY_THRESHOLD_MEDIUM = 40;
const PRIORITY_THRESHOLD_LOW = 20;

/**
 * PgBoss job worker for the EVALUATE_WORKFLOWS job.
 *
 * Queued from EmailLifecycleService after email save.
 * Starts after a 60s delay to allow summary/priority to complete.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Injectable()
export class WorkflowProcessor implements OnModuleInit {
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepo: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly threadRepo: Repository<EmailThread>,
    private readonly workflowsService: WorkflowsService,
    private readonly executionService: WorkflowExecutionService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await registerWorker(
      this.boss,
      JOB_NAMES.EVALUATE_WORKFLOWS,
      { teamConcurrency: 5, teamSize: 1 },
      async (job) => {
        const { userId, emailThreadId } = job.data as EvaluateWorkflowsJobData;
        this.logger.debug(
          `Processing evaluate-workflows job for thread ${emailThreadId}`,
        );

        try {
          // processWorkflows reads encrypted Email + EmailThread columns
          // (from, subject, body, summary, categoryId etc.) and the
          // execution service may write encrypted draft replies. Wrap
          // with the user's KMS key so decrypts/encrypts use the same
          // envelope the HTTP path uses.
          return await this.userEncryptionService.withUserKey(userId, () =>
            this.processWorkflows(userId, emailThreadId),
          );
        } catch (error) {
          if (StructuralError.isStructuralError(error)) {
            this.logger.error(
              `[STRUCTURAL ERROR - NO RETRY] evaluate-workflows failed for thread ${emailThreadId}: ${(error as Error).message}`,
            );
            return {
              error: "StructuralError",
              message: (error as Error).message,
            };
          }
          this.logger.error(
            `Failed to evaluate workflows for thread ${emailThreadId}`,
            error,
          );
          throw error;
        }
      },
    );
    this.logger.log("Workflow processor initialized");
  }

  /** Map numeric priorityScore to WorkflowPriorityLevel string */
  private mapPriorityScore(score: number | null): string {
    if (score === null) return "medium";
    if (score >= PRIORITY_THRESHOLD_VERY_HIGH) return "veryHigh";
    if (score >= PRIORITY_THRESHOLD_HIGH) return "high";
    if (score >= PRIORITY_THRESHOLD_MEDIUM) return "medium";
    if (score >= PRIORITY_THRESHOLD_LOW) return "low";
    return "veryLow";
  }

  // ── Private processing ────────────────────────────────────────────────────────

  private async processWorkflows(
    userId: string,
    emailThreadId: string,
  ): Promise<unknown> {
    // Load the latest email in the thread (most recent message)
    const email = await this.emailRepo.findOne({
      where: { emailThreadId, userId },
      order: { receivedAt: "DESC" },
    });
    if (!email) {
      this.logger.warn(
        `No email found for thread ${emailThreadId} — skipping workflow evaluation`,
      );
      return { skipped: true, reason: "no_email" };
    }

    // Load thread for category / priority
    const thread = await this.threadRepo.findOne({
      where: { id: emailThreadId },
    });

    // Verify summary is available; if not, the job will retry
    if (!email.summary) {
      this.logger.debug(
        `Summary not yet available for thread ${emailThreadId} — will retry`,
      );
      throw new Error("Summary not ready — retry");
    }

    const context: WorkflowContext = {
      userId,
      emailThreadId,
      from: email.from ?? "",
      fromName: email.fromName ?? "",
      subject: email.subject ?? "",
      date: email.receivedAt ?? new Date(),
      summary: email.summary ?? "",
      body: (email.body ?? "").slice(0, MAX_BODY_CHARS),
      category: thread?.categoryId ?? "",
      priority: thread ? this.mapPriorityScore(thread.priorityScore) : "",
    };

    // Find matching rule (deterministic conditions only at this stage)
    const rule = await this.workflowsService.findMatchingRule(userId, context);
    if (!rule) {
      this.logger.debug(`No workflow rule matched for thread ${emailThreadId}`);
      return { matched: false };
    }

    // Optional: evaluate NL condition
    const nlPassed =
      await this.executionService.evaluateNaturalLanguageCondition(
        rule,
        context,
      );
    if (!nlPassed) {
      this.logger.debug(
        `NL condition failed for rule ${rule.id} on thread ${emailThreadId}`,
      );
      return { matched: false, reason: "nl_condition_failed" };
    }

    // Execute the matched workflow
    const result = await this.executionService.execute(rule, context);
    this.logger.log(
      `Workflow "${rule.name}" executed for thread ${emailThreadId}: ${result.status}`,
    );
    return result;
  }
}
