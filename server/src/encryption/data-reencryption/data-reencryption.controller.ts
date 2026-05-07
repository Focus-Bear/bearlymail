import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import PgBoss from "pg-boss";
import { IsNull, Not, Repository } from "typeorm";

import { AdminGuard } from "../../auth/admin.guard";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { User } from "../../database/entities/user.entity";
import { JobPriority } from "../../queue/job-priorities";
import { ReencryptUserDataJobData } from "./data-reencryption.processor";
import { DataReencryptionService } from "./data-reencryption.service";

class ReencryptOneUserDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsOptional()
  dryRun?: boolean;
}

class StartReencryptionDto {
  @IsOptional()
  dryRun?: boolean;
}

@Controller("admin/reencryption")
@UseGuards(JwtAuthGuard, AdminGuard)
export class DataReencryptionController {
  private readonly logger = new Logger(DataReencryptionController.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly service: DataReencryptionService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Per-user state and aggregate progress.
   */
  @Get("status")
  async status() {
    const [migrated, pending, total] = await Promise.all([
      this.userRepository.count({
        where: { dataReencryptedAt: Not(IsNull()) },
      }),
      this.userRepository.count({ where: { dataReencryptedAt: IsNull() } }),
      this.userRepository.count(),
    ]);

    return {
      migratedUsers: migrated,
      pendingUsers: pending,
      totalUsers: total,
      tablesInScope: this.service.getTables().map((table) => table.tableName),
    };
  }

  /**
   * Enqueue a re-encryption job for every user that has not yet been migrated.
   * Idempotent — already-migrated users are skipped at job time.
   */
  @Post("start")
  async startAll(@Body() body: StartReencryptionDto = {}) {
    const dryRun = body.dryRun ?? false;
    const users = await this.userRepository
      .createQueryBuilder("u")
      .select(["u.id"])
      .where(dryRun ? "1=1" : "u.dataReencryptedAt IS NULL")
      .getMany();

    for (const user of users) {
      await this.enqueue(user.id, dryRun);
    }

    this.logger.log(
      `Enqueued ${users.length} re-encryption jobs${dryRun ? " (dry run)" : ""}`,
    );
    return { enqueued: users.length, dryRun };
  }

  /**
   * Enqueue a re-encryption job for one specific user. Useful for testing or
   * spot-fixing.
   */
  @Post("user")
  async startOne(@Body() body: ReencryptOneUserDto) {
    const dryRun = body.dryRun ?? false;
    await this.enqueue(body.userId, dryRun);
    return { enqueued: 1, userId: body.userId, dryRun };
  }

  /**
   * Synchronous dry-run for the calling admin's own data — useful for verifying
   * decryption works end-to-end before kicking off the full job. Returns a
   * per-table breakdown.
   */
  @Post("dry-run-self")
  async dryRunSelf(@Req() request: { user?: { userId?: string } }) {
    const userId = request?.user?.userId;
    if (!userId) {
      throw new Error("Could not resolve current user from request");
    }
    return this.service.reencryptUser(userId, { dryRun: true });
  }

  private async enqueue(userId: string, dryRun: boolean): Promise<void> {
    const jobData: ReencryptUserDataJobData = { userId, dryRun };
    await this.boss.send(JOB_NAMES.REENCRYPT_USER_DATA, jobData, {
      priority: JobPriority.VERY_LOW,
    });
  }
}
