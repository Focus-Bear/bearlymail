import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import {
  EMAIL_EXPORT_STATUS,
  EmailExportStatus,
} from "../constants/domain-statuses";
import { EMAIL_EXPORT } from "../constants/email-export-constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { EmailExport } from "../database/entities/email-export.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { getJobPriority } from "../queue/job-priorities";
import {
  EmailExportService,
  MIN_PASSWORD_LENGTH,
} from "./email-export.service";
import { EmailExportStorageService } from "./email-export-storage.service";

/** Job payload for the EXPORT_EMAILS queue. The password is encrypted, never plaintext. */
export interface ExportEmailsJobData {
  userId: string;
  exportId: string;
  /** ZIP password, encrypted under the user's key (decrypted in the worker). */
  encryptedPassword: string;
}

export interface EmailExportStatusDto {
  id: string;
  status: EmailExportStatus;
  emailCount: number | null;
  fileSize: number | null;
  error: string | null;
  /** Short-lived presigned S3 URL, present only when `status === "completed"`. */
  downloadUrl?: string;
  createdAt: Date;
  expiresAt: Date | null;
}

/**
 * Orchestrates async bulk email export: enqueues the build job, runs it in the
 * worker, and reports status (with a presigned download URL) to the polling client.
 *
 * The heavy "fetch every email, decrypt, JSON, zip" work is intentionally off the
 * HTTP request path — done synchronously it exceeded the 60s ALB idle timeout and
 * returned a 504 for large mailboxes (#2024).
 */
@Injectable()
export class EmailExportJobService {
  private readonly logger = new Logger(EmailExportJobService.name);

  constructor(
    @InjectRepository(EmailExport)
    private readonly exportRepository: Repository<EmailExport>,
    private readonly exportService: EmailExportService,
    private readonly storage: EmailExportStorageService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  /**
   * Validates the password, records a pending export, and enqueues the build job.
   * Must run inside the user's encryption-key context (the HTTP interceptor sets
   * it) so the password can be encrypted under the same key the worker will use.
   */
  async requestExport(
    userId: string,
    password: string,
  ): Promise<{ exportId: string }> {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Export password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const encryptedPassword = EncryptionHelper.encrypt(password);
    if (!encryptedPassword) {
      throw new BadRequestException("Unable to secure the export password");
    }

    const record = this.exportRepository.create({
      userId,
      status: EMAIL_EXPORT_STATUS.PENDING,
    });
    await this.exportRepository.save(record);

    const payload: ExportEmailsJobData = {
      userId,
      exportId: record.id,
      encryptedPassword,
    };

    await this.boss.send(JOB_NAMES.EXPORT_EMAILS, payload, {
      priority: getJobPriority(JOB_NAMES.EXPORT_EMAILS, true),
      retryLimit: EMAIL_EXPORT.JOB_RETRY_LIMIT,
      retryDelay: EMAIL_EXPORT.JOB_RETRY_DELAY_SECONDS,
      expireInSeconds: EMAIL_EXPORT.JOB_EXPIRE_SECONDS,
    });

    this.logger.log(`Enqueued email export ${record.id} for user ${userId}`);
    return { exportId: record.id };
  }

  /**
   * Builds the ZIP and uploads it to S3. Invoked by the worker inside
   * `withUserKey(userId, ...)` so TypeORM transformers and the password decrypt
   * under the user's key. Throws on failure (after recording it) so PgBoss retries.
   */
  async runExport(jobData: ExportEmailsJobData): Promise<void> {
    const { userId, exportId, encryptedPassword } = jobData;

    await this.exportRepository.update(
      { id: exportId },
      { status: EMAIL_EXPORT_STATUS.RUNNING, errorMessage: null },
    );

    try {
      const password = EncryptionHelper.decrypt(encryptedPassword);
      if (!password) {
        throw new Error("Failed to decrypt export password");
      }

      // Fully streamed: DB batches → JSON → zip → S3 multipart upload. Nothing
      // is accumulated, so memory stays bounded no matter how big the mailbox.
      const key = `exports/${userId}/${exportId}.zip`;
      const { archive, recordCount } =
        this.exportService.buildEncryptedZipStream(userId, password);
      const { bytes } = await this.storage.uploadStream(key, archive);

      const emailCount = recordCount();
      const expiresAt = new Date(Date.now() + EMAIL_EXPORT.TTL_MS);

      await this.exportRepository.update(
        { id: exportId },
        {
          status: EMAIL_EXPORT_STATUS.COMPLETED,
          s3Key: key,
          fileSize: bytes,
          emailCount,
          expiresAt,
        },
      );

      this.logger.log(
        `Completed email export ${exportId} for user ${userId}: ${emailCount} emails, ${bytes} bytes`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.exportRepository.update(
        { id: exportId },
        { status: EMAIL_EXPORT_STATUS.FAILED, errorMessage: message },
      );
      this.logger.error(
        `Failed email export ${exportId} for user ${userId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Returns the export's status for the polling client. Scoped to `userId` so a
   * user can never read another user's export. A presigned download URL is
   * minted only when the export is complete.
   */
  async getStatus(
    userId: string,
    exportId: string,
  ): Promise<EmailExportStatusDto> {
    const record = await this.exportRepository.findOne({
      where: { id: exportId, userId },
    });
    if (!record) {
      throw new NotFoundException("Export not found");
    }

    let downloadUrl: string | undefined;
    const isExpired = !!record.expiresAt && record.expiresAt < new Date();
    if (
      record.status === EMAIL_EXPORT_STATUS.COMPLETED &&
      record.s3Key &&
      !isExpired
    ) {
      downloadUrl = await this.storage.getPresignedUrl(record.s3Key);
    }

    return {
      id: record.id,
      status: record.status,
      emailCount: record.emailCount,
      fileSize: record.fileSize,
      error: record.errorMessage,
      downloadUrl,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
  }
}
