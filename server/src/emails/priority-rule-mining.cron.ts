import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { PRIORITY_RULE_GATES } from "../constants/priority-rule.constants";
import { Email } from "../database/entities/email.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { registerWorker } from "../queue/register-worker";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/**
 * Periodic, path-independent priority-rule mining. Inline mining (in the single
 * and pgboss-batch refine paths) only fires for senders whose emails pass
 * through those paths; the Lambda/SQS prioritisation path scores threads
 * without notifying the app, so its senders would never trigger mining. This
 * sweep gathers senders with enough LLM-scored threads regardless of which path
 * scored them and (re)mines them. Mining itself is idempotent, so overlap with
 * inline mining is harmless.
 */
@Injectable()
export class PriorityRuleMiningCron implements OnModuleInit {
  private readonly logger = new Logger(PriorityRuleMiningCron.name);

  /** Cron: every 30 minutes. */
  private static readonly SCAN_CRON = "*/30 * * * *";

  /** Max distinct senders mined per cycle (most recently active first). */
  private static readonly MAX_SENDERS_PER_SCAN = 500;

  private static readonly WORKER_ID = "mining-cron";

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly priorityRulesService: PriorityRulesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.schedule(
      JOB_NAMES.MINE_PRIORITY_RULES,
      PriorityRuleMiningCron.SCAN_CRON,
    );
    await registerWorker(this.boss, JOB_NAMES.MINE_PRIORITY_RULES, async () => {
      await this.sweep();
    });
    this.logger.log("Priority-rule mining sweep registered (every 30 minutes)");
  }

  /**
   * Mine eligible senders across all users. Each user is wrapped in its own
   * encryption key so the representative email's sender can be decrypted to form
   * the rule pattern. Failures are isolated per sender.
   */
  async sweep(): Promise<void> {
    const candidates = await this.findCandidates();
    if (candidates.size === 0) {
      this.logger.debug("[PRIORITY-MINING] No candidate senders to mine");
      return;
    }

    let mined = 0;
    for (const [userId, hmacs] of candidates) {
      await this.userEncryptionService.withUserKey(userId, async () => {
        for (const hmac of hmacs) {
          mined += await this.mineSender(userId, hmac);
        }
      });
    }
    this.logger.log(
      `[PRIORITY-MINING] Swept ${candidates.size} user(s); attempted mining for ${mined} sender(s)`,
    );
  }

  private async mineSender(userId: string, hmac: string): Promise<number> {
    try {
      const email = await this.emailRepository.findOne({
        where: { userId, senderEmailHmac: hmac },
        order: { receivedAt: "DESC" },
      });
      if (!email) return 0;
      await this.priorityRulesService.mineAndUpsertRule(
        userId,
        email,
        buildRuleEmailMetadata(email),
        PriorityRuleMiningCron.WORKER_ID,
      );
      return 1;
    } catch (error) {
      this.logger.error(
        `[PRIORITY-MINING] Failed to mine sender for user ${userId}`,
        error,
      );
      return 0;
    }
  }

  /**
   * Returns userId → sender HMACs with enough LLM-scored (non-rule) threads to
   * be worth mining, most recently active first. Pure SQL over unencrypted
   * columns (senderEmailHmac, priorityScore, prioritySource).
   */
  private async findCandidates(): Promise<Map<string, string[]>> {
    const rows = await this.emailRepository
      .createQueryBuilder("email")
      .innerJoin("email_threads", "thread", "thread.id = email.emailThreadId")
      .select("email.userId", "userId")
      .addSelect("email.senderEmailHmac", "hmac")
      .where("email.senderEmailHmac IS NOT NULL")
      .andWhere("thread.priorityScore IS NOT NULL")
      .andWhere(
        "(thread.prioritySource IS NULL OR thread.prioritySource NOT IN ('rule', 'local'))",
      )
      .groupBy("email.userId")
      .addGroupBy("email.senderEmailHmac")
      .having("COUNT(DISTINCT thread.id) >= :min", {
        min: PRIORITY_RULE_GATES.MIN_SAMPLES,
      })
      .orderBy("MAX(thread.updatedAt)", "DESC")
      .limit(PriorityRuleMiningCron.MAX_SENDERS_PER_SCAN)
      .getRawMany<{ userId: string; hmac: string }>();

    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      const list = byUser.get(row.userId);
      if (list) {
        list.push(row.hmac);
      } else {
        byUser.set(row.userId, [row.hmac]);
      }
    }
    return byUser;
  }
}
