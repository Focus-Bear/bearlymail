import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

import { BYTE_CONVERSIONS } from "../constants/service-constants";

// file-type is an ESM-only package; use a dynamic import so this CommonJS
// module can still consume it at runtime.
type FileTypeResult = { mime: string; ext: string } | undefined;

async function detectMimeType(buffer: Buffer): Promise<FileTypeResult> {
  // Dynamic import for ESM compatibility
  const { fileTypeFromBuffer } = await import("file-type");
  return fileTypeFromBuffer(buffer) as Promise<FileTypeResult>;
}

/** Accepted MIME types for screenshot uploads (magic-byte validated). */
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Map validated MIME → safe file extension. */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_UPLOAD_MB = 10;
/** Maximum screenshot upload size: 10 MB (per plan). */
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * BYTE_CONVERSIONS.MB;

/** Multer memory storage file limit exposed for controller config. */
export const MULTER_FILE_SIZE_LIMIT = MAX_UPLOAD_BYTES;

/** How long (seconds) a presigned GET URL remains valid for admin view (1 hour per plan). */
const PRESIGN_GET_EXPIRY_SECONDS = 3600;

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

  /**
   * Validate a screenshot buffer via magic-byte detection and upload it to S3.
   *
   * @param buffer   - Raw file bytes received from Multer memory storage.
   * @param userId   - Authenticated user ID (used in the S3 key path).
   * @returns The S3 key of the uploaded object.
   * @throws UnprocessableEntityException (HTTP 422) when MIME type is not accepted.
   * @throws BadRequestException when bucket is not configured.
   */
  async uploadScreenshot(buffer: Buffer, userId: string): Promise<string> {
    if (!this.bucket) {
      throw new BadRequestException(
        "Screenshot upload is not configured on this server.",
      );
    }

    // Magic-byte MIME detection — never trust client-supplied Content-Type.
    const detected = await detectMimeType(buffer);
    const mime = detected?.mime ?? "";

    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new UnprocessableEntityException(
        `Unsupported file type "${mime || "unknown"}". Accepted: image/jpeg, image/png, image/webp.`,
      );
    }

    // Derive extension from validated MIME — never from user-supplied filename.
    const ext = MIME_TO_EXT[mime];
    const key = `feedback/${userId}/${randomUUID()}-${Date.now()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        ACL: "private",
      }),
    );

    this.logger.log(`Uploaded feedback screenshot: key=${key}, mime=${mime}`);
    return key;
  }

  /**
   * Generate a presigned GET URL for admin access to a screenshot.
   * TTL is 1 hour (3600 s) per plan.
   *
   * Checks the GuardDuty Malware Protection scan tag before issuing a URL.
   * Objects tagged THREATS_FOUND are blocked; the Lambda remediation job
   * will delete them asynchronously.
   */
  async getPresignedGetUrl(key: string): Promise<string> {
    if (!this.bucket) {
      return "";
    }

    await this.assertCleanScanStatus(key);

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, {
      expiresIn: PRESIGN_GET_EXPIRY_SECONDS,
    });
  }

  /**
   * Read the GuardDuty Malware Protection scan tag from the S3 object.
   *
   * Fail-closed: access is only permitted when the tag is explicitly
   * `NO_THREATS_FOUND`. Every other outcome (tag absent, scan pending,
   * THREATS_FOUND, UNSUPPORTED, FAILED, or tag-read error) is treated as
   * unsafe and raises HTTP 422.
   */
  private async assertCleanScanStatus(key: string): Promise<void> {
    let scanStatus: string | undefined;
    try {
      const taggingResult = await this.s3.send(
        new GetObjectTaggingCommand({ Bucket: this.bucket, Key: key }),
      );
      scanStatus = taggingResult.TagSet?.find(
        (tag) => tag.Key === "GuardDutyMalwareScanStatus",
      )?.Value;
    } catch (err) {
      // Cannot read tags → fail-closed: deny access rather than assume safety.
      this.logger.error(
        `Could not read scan tags for key="${key}": ${(err as Error).message} — denying access (fail-closed)`,
      );
      throw new UnprocessableEntityException(
        "Unable to verify malware scan status. Access denied pending verification.",
      );
    }

    if (scanStatus === "THREATS_FOUND") {
      this.logger.error(
        `Blocked access to malware-flagged screenshot: key="${key}"`,
      );
      throw new UnprocessableEntityException(
        "This file was flagged as malicious and cannot be accessed.",
      );
    }

    if (scanStatus !== "NO_THREATS_FOUND") {
      // Tag absent (scan still pending), UNSUPPORTED, FAILED, or unknown value.
      // Fail-closed: do not issue a presigned URL until the scan confirms safety.
      const reason = scanStatus
        ? `scan status is "${scanStatus}"`
        : "scan tag is absent (scan may be pending)";
      this.logger.warn(
        `Blocking access to screenshot key="${key}" — ${reason} (fail-closed)`,
      );
      throw new UnprocessableEntityException(
        "File access is blocked pending malware scan completion.",
      );
    }
  }

  /**
   * Delete a previously uploaded screenshot from S3.
   * Called when the parent feedback entry is deleted so orphaned objects
   * are cleaned up.
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
