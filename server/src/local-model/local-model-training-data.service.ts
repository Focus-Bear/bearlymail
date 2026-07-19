import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  EmailExportService,
  ExportEmailRecord,
} from "../emails/email-export.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";

/** Don't bother training (or even uploading) for users with too little history —
 * the time-split + per-category support gates need a reasonable number of
 * labelled threads to produce anything useful. */
const MIN_RECORDS_TO_EXPORT = 100;

const TRAINING_DATA_PREFIX = "training-data/";

export interface TrainingDataExportResult {
  userId: string;
  recordCount: number;
  uploaded: boolean;
  reason?: string;
}

/**
 * The data-feed for the local-model training loop: writes each user's
 * label-rich export to `s3://<LOCAL_MODELS_BUCKET>/training-data/<userId>.json`,
 * where the weekly Fargate trainer (version-matched image) reads it to produce
 * `models/<userId>.joblib`.
 *
 * Reuses {@link EmailExportService} so the JSON exactly matches what `train.py`
 * expects (same ExportEmailRecord shape, with the category/priority labels added
 * in #2416). Runs under the user's encryption key so the records decrypt.
 *
 * Plaintext JSON is written (not the password-protected export ZIP): the bucket
 * is private, SSE, TLS-only and in-account, and the trainer needs to read it.
 */
@Injectable()
export class LocalModelTrainingDataService {
  private readonly logger = new Logger(LocalModelTrainingDataService.name);
  private readonly s3: S3Client;
  private readonly bucket: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly exportService: EmailExportService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {
    const region =
      this.configService.get<string>("AWS_REGION") || "ap-southeast-2";
    this.s3 = new S3Client({ region });
    this.bucket = this.configService.get<string>("LOCAL_MODELS_BUCKET");
  }

  isConfigured(): boolean {
    return !!this.bucket;
  }

  /**
   * Exports one user's training data to S3. Returns a result describing what
   * happened; never throws for an empty/small mailbox (those are skipped).
   */
  async exportUserTrainingData(
    userId: string,
  ): Promise<TrainingDataExportResult> {
    if (!this.bucket) {
      return { userId, recordCount: 0, uploaded: false, reason: "no_bucket" };
    }

    const records = await this.userEncryptionService.withUserKey(userId, () =>
      this.collectRecords(userId),
    );

    if (records.length < MIN_RECORDS_TO_EXPORT) {
      return {
        userId,
        recordCount: records.length,
        uploaded: false,
        reason: "too_few_records",
      };
    }

    // No ACL: the bucket blocks all public access and (per CDK defaults) uses
    // BucketOwnerEnforced, which disables ACLs — passing one would fail the PUT.
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `${TRAINING_DATA_PREFIX}${userId}.json`,
        Body: JSON.stringify(records),
        ContentType: "application/json",
      }),
    );
    this.logger.log(
      `Exported ${records.length} training records for user ${userId}`,
    );
    return { userId, recordCount: records.length, uploaded: true };
  }

  /** Collect the capped, label-rich records the trainer consumes. */
  private async collectRecords(userId: string): Promise<ExportEmailRecord[]> {
    const records: ExportEmailRecord[] = [];
    // trainingGate: clean the labels (drop bot-updates fallback + rare categories,
    // weight user corrections) so the model trains on trustworthy classes only.
    for await (const record of this.exportService.streamExportableRecords(
      userId,
      { trainingGate: true },
    )) {
      records.push(record);
    }
    return records;
  }
}
