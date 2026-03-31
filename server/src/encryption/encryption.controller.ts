import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SECONDS } from "../constants/time-constants";
import { EncryptionHelper } from "./encryption.helper";
import { encryptionKeyProvider } from "./encryption-key-provider";

const ADMIN_DECRYPT_FIELD_MAX_CHARS = 50_000;
const CIPHERTEXT_PREVIEW_CHARS = 80;

export interface AdminDecryptEmailFieldResult {
  field: string;
  ciphertextPreview: string | null;
  decrypted: string | null;
  error: string | null;
}

export interface AdminDecryptEmailResponse {
  serverKeyPrefix: string;
  fields: AdminDecryptEmailFieldResult[];
}

@Controller("admin/encryption")
@UseGuards(JwtAuthGuard, AdminGuard)
export class EncryptionController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get("status")
  async getEncryptionStatus(): Promise<{
    initialized: boolean;
    keyFingerprint: string;
    sampleDecryptResult: "success" | "failure" | "no-data";
    failureMessage: string | null;
    uptime: string;
  }> {
    const fingerprint = encryptionKeyProvider.getFingerprint();
    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeFormatted = formatUptime(uptimeSeconds);

    let sampleDecryptResult: "success" | "failure" | "no-data" = "no-data";
    let failureMessage: string | null = null;

    try {
      const result = (await this.dataSource.query(
        `SELECT subject FROM emails WHERE subject IS NOT NULL LIMIT 1`,
      )) as { subject: string }[];

      if (result.length === 0) {
        sampleDecryptResult = "no-data";
      } else {
        try {
          EncryptionHelper.decrypt(result[0].subject);
          sampleDecryptResult = "success";
        } catch (err) {
          sampleDecryptResult = "failure";
          failureMessage = err instanceof Error ? err.message : String(err);
        }
      }
    } catch (err) {
      sampleDecryptResult = "failure";
      failureMessage = `Database query failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    return {
      initialized: true,
      keyFingerprint: fingerprint,
      sampleDecryptResult,
      failureMessage,
      uptime: uptimeFormatted,
    };
  }

  /**
   * Load ciphertext columns for an email row and attempt decryption with the server key
   * or an optional alternate passphrase (same scrypt derivation as ENCRYPTION_KEY).
   */
  @Post("decrypt-email-preview")
  async decryptEmailPreview(
    @Body() body: { emailId?: string; encryptionKey?: string },
  ): Promise<AdminDecryptEmailResponse> {
    const emailId = body.emailId?.trim();
    if (!emailId) {
      throw new BadRequestException("emailId is required");
    }

    const optionalKey = body.encryptionKey?.trim();
    const envKey = process.env.ENCRYPTION_KEY ?? "";
    const serverKeyPrefix = envKey.slice(0, 10);

    const rows = (await this.dataSource.query(
      `SELECT subject, body, "htmlBody", "from", summary
       FROM emails WHERE id = $1 LIMIT 1`,
      [emailId],
    )) as Array<{
      subject: string | null;
      body: string | null;
      htmlBody: string | null;
      from: string | null;
      summary: string | null;
    }>;

    if (!rows.length) {
      throw new NotFoundException(`No email found with id ${emailId}`);
    }

    const row = rows[0];
    const fieldNames = [
      "subject",
      "body",
      "htmlBody",
      "from",
      "summary",
    ] as const;

    const fields: AdminDecryptEmailFieldResult[] = [];

    for (const field of fieldNames) {
      const raw = row[field];
      if (raw == null || raw === "") {
        fields.push({
          field,
          ciphertextPreview: null,
          decrypted: null,
          error: null,
        });
        continue;
      }

      const ciphertextPreview =
        raw.length <= CIPHERTEXT_PREVIEW_CHARS
          ? raw
          : `${raw.slice(0, CIPHERTEXT_PREVIEW_CHARS)}…`;

      try {
        let decrypted: string | null;
        if (optionalKey) {
          decrypted = EncryptionHelper.decryptWithKeyString(raw, optionalKey);
        } else {
          decrypted = EncryptionHelper.decrypt(raw);
        }

        if (
          decrypted != null &&
          decrypted.length > ADMIN_DECRYPT_FIELD_MAX_CHARS
        ) {
          decrypted = `${decrypted.slice(
            0,
            ADMIN_DECRYPT_FIELD_MAX_CHARS,
          )}\n…[truncated by server]`;
        }

        fields.push({
          field,
          ciphertextPreview,
          decrypted,
          error: null,
        });
      } catch (err) {
        fields.push({
          field,
          ciphertextPreview,
          decrypted: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { serverKeyPrefix, fields };
  }
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / SECONDS.HOUR);
  const minutes = Math.floor((seconds % SECONDS.HOUR) / SECONDS.MINUTE);
  const secs = seconds % SECONDS.MINUTE;
  return `${hours}h ${minutes}m ${secs}s`;
}
