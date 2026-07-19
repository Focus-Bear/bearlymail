import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MILLISECONDS } from "../constants/time-constants";
import { AuditLog } from "../database/entities/audit-log.entity";
import { registerWorker } from "../queue/register-worker";

const RETENTION_DAYS = 90;
const BATCH_SIZE = 1000;

/**
 * SAQ Q52: nightly export of audit_logs rows older than RETENTION_DAYS to S3.
 *
 * Bucket lifecycle (defined in CDK) transitions objects to Glacier Flexible
 * Retrieval after 90 days in Standard. This processor only writes objects;
 * the transition is bucket-side.
 *
 * Order of operations per batch: PUT to S3 first, then DELETE from Postgres.
 * If PUT fails, the rows stay in Postgres and the next run retries them.
 * If DELETE fails after a successful PUT, the rows will be re-uploaded on
 * the next run — versioning is enabled on the bucket so this is non-lossy.
 */
@Injectable()
export class AuditArchiveProcessor implements OnModuleInit {
  private readonly logger = new Logger(AuditArchiveProcessor.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly s3: S3Client;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    configService: ConfigService,
  ) {
    this.bucket =
      configService.get<string>("AUDIT_LOG_ARCHIVE_BUCKET") ||
      process.env.AUDIT_LOG_ARCHIVE_BUCKET ||
      "";
    this.region =
      configService.get<string>("AWS_REGION") ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      "us-east-1";
    this.s3 = new S3Client({ region: this.region });
  }

  async onModuleInit() {
    // 03:30 UTC daily — off-peak for our user base.
    await this.boss.schedule(JOB_NAMES.AUDIT_LOG_ARCHIVE, "30 3 * * *");
    await registerWorker(this.boss, JOB_NAMES.AUDIT_LOG_ARCHIVE, async () => {
      await this.runArchive();
    });
  }

  async runArchive(): Promise<{ batches: number; rowsArchived: number }> {
    if (!this.bucket) {
      this.logger.warn(
        "AUDIT_LOG_ARCHIVE_BUCKET not configured – skipping audit log archival run",
      );
      return { batches: 0, rowsArchived: 0 };
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * MILLISECONDS.DAY);

    let batches = 0;
    let rowsArchived = 0;

    // Loop until no more rows older than the cutoff remain.
    for (;;) {
      // Use getRawMany() (NOT .find()) so TypeORM does NOT run the column
      // transformers. This is a cross-user batch: the per-user-encrypted columns
      // (metadata, ipAddress, userAgent) cannot be decrypted here (no per-user
      // key), and we must NOT lose them. Archiving the raw stored ciphertext
      // preserves the data faithfully (it stays encrypted at rest in S3 and can
      // be decrypted later with the owning user's key if ever required).
      const rows = await this.auditLogRepository
        .createQueryBuilder("a")
        .select([
          "a.id AS id",
          'a.userId AS "userId"',
          "a.action AS action",
          'a.targetType AS "targetType"',
          'a.targetId AS "targetId"',
          "a.metadata AS metadata",
          'a.ipAddress AS "ipAddress"',
          'a.userAgent AS "userAgent"',
          'a.createdAt AS "createdAt"',
        ])
        .where("a.createdAt < :cutoff", { cutoff })
        .orderBy("a.createdAt", "ASC")
        .limit(BATCH_SIZE)
        .getRawMany<RawAuditLogRow>();

      if (rows.length === 0) break;

      const key = this.buildObjectKey(new Date(rows[0].createdAt));
      const ndjson = rows
        .map((row) => JSON.stringify(this.serialiseRow(row)))
        .join("\n");

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: ndjson,
          ContentType: "application/x-ndjson",
        }),
      );

      const ids = rows.map((row) => row.id);
      await this.auditLogRepository.delete(ids);

      batches += 1;
      rowsArchived += rows.length;
      this.logger.log(
        `Archived ${rows.length} audit log row(s) to s3://${this.bucket}/${key}`,
      );

      // Defensive: if a batch came back smaller than BATCH_SIZE, no more rows.
      if (rows.length < BATCH_SIZE) break;
    }

    this.logger.log(
      `Audit log archival complete: ${rowsArchived} row(s) across ${batches} batch(es)`,
    );
    return { batches, rowsArchived };
  }

  private buildObjectKey(firstRowTimestamp: Date): string {
    const year = firstRowTimestamp.getUTCFullYear();
    const month = String(firstRowTimestamp.getUTCMonth() + 1).padStart(2, "0");
    const day = String(firstRowTimestamp.getUTCDate()).padStart(2, "0");
    const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `audit-logs/${year}/${month}/${day}/exported-${runStamp}.ndjson`;
  }

  private serialiseRow(row: RawAuditLogRow): Record<string, unknown> {
    return {
      id: row.id,
      userId: row.userId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      // metadata/ipAddress/userAgent are the raw stored values (ciphertext for
      // per-user-encrypted rows) — preserved as-is, never decrypted here.
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}

/** Raw (untransformed) audit_logs row as returned by getRawMany — encrypted columns stay as ciphertext. */
interface RawAuditLogRow {
  id: string;
  userId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | string;
}
