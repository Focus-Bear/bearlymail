import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import * as path from "path";

import { BYTE_CONVERSIONS } from "../constants/service-constants";
import { SECONDS_PER_MINUTE } from "../constants/time-constants";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_UPLOAD_MB = 5;
/** Maximum screenshot upload size: 5 MB */
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * BYTE_CONVERSIONS.MB;

/** How long (minutes) a screenshot presigned PUT URL remains valid. */
const PRESIGN_EXPIRY_MINUTES = 5;

@Injectable()
export class FeedbackScreenshotsService {
  private readonly logger = new Logger(FeedbackScreenshotsService.name);
  private s3: S3Client;
  private bucket: string;

  constructor() {
    const region =
      process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
    this.bucket = process.env.FEEDBACK_SCREENSHOTS_BUCKET || "";

    this.s3 = new S3Client({ region });

    if (!this.bucket) {
      this.logger.warn(
        "FEEDBACK_SCREENSHOTS_BUCKET not configured – screenshot uploads will fail",
      );
    }
  }

  async createPresignedPutUrl(filename?: string, contentType = "image/png") {
    // Validate content type to prevent misuse of presigned URLs for arbitrary uploads
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(
        `Unsupported content type "${contentType}". Allowed types: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
      );
    }

    const ext = filename ? path.extname(filename) : ".png";
    const key = `feedback/${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ACL: "private",
      // Note: ContentLengthRange enforcement requires a bucket policy or POST
      // presigned URLs. For PUT presigned URLs, clients must honour maxBytes;
      // add a bucket policy for server-side enforcement if needed.
    });

    const url = await getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_EXPIRY_MINUTES * SECONDS_PER_MINUTE,
    });

    return { key, url, maxBytes: MAX_UPLOAD_BYTES };
  }

  /**
   * Delete a previously uploaded screenshot from S3/R2.
   * Called when the parent feedback entry is deleted so orphaned objects are cleaned up.
   */
  async deleteScreenshot(key: string): Promise<void> {
    if (!this.bucket) {
      this.logger.warn(
        "FEEDBACK_SCREENSHOTS_BUCKET not configured – skipping screenshot delete",
      );
      return;
    }

    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      // Log but do not re-throw: the DB row is already being deleted; a
      // failed S3 delete should not block the API response.
      this.logger.error(`Failed to delete screenshot key="${key}"`, err);
    }
  }
}
