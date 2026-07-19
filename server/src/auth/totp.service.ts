import { Injectable, Logger } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import { MS_PER_SECOND } from "../constants/time-constants";
import { UsersService } from "../users/users.service";

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_DRIFT_STEPS = 1;
const TOTP_SECRET_BYTES = 20;
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_CHAR_BITS = 5;
const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
const CHAR_MASK = 31;
const OTP_MODULUS = 10 ** TOTP_DIGITS;
const HIGH_BIT_MASK = 0x7f;
const HMAC_OFFSET_MASK = 0x0f;
const BIT_SHIFT_24 = 24;
const BIT_SHIFT_16 = 16;
const UINT32_MAX_PLUS_ONE = 4294967296;
const TOTP_TIME_BUFFER_BYTES = 8;

function base32Encode(buffer: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << BYTE_BITS) | byte;
    bits += BYTE_BITS;
    while (bits >= BASE32_CHAR_BITS) {
      result += BASE32_CHARS[(value >>> (bits - BASE32_CHAR_BITS)) & CHAR_MASK];
      bits -= BASE32_CHAR_BITS;
    }
  }

  if (bits > 0) {
    result += BASE32_CHARS[(value << (BASE32_CHAR_BITS - bits)) & CHAR_MASK];
  }

  return result;
}

function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of normalized) {
    const index = BASE32_CHARS.indexOf(char);
    if (index < 0) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << BASE32_CHAR_BITS) | index;
    bits += BASE32_CHAR_BITS;
    if (bits >= BYTE_BITS) {
      bytes.push((value >>> (bits - BYTE_BITS)) & BYTE_MASK);
      bits -= BYTE_BITS;
    }
  }

  return Buffer.from(bytes);
}

function generateTotpCode(secret: string, timeStep: number): string {
  const key = base32Decode(secret);

  // Encode timeStep as 8-byte big-endian (RFC 6238).
  // Split into two 32-bit halves because JS bitwise ops work on 32-bit integers.
  const time = Buffer.alloc(TOTP_TIME_BUFFER_BYTES);
  time.writeUInt32BE(Math.floor(timeStep / UINT32_MAX_PLUS_ONE), 0);
  time.writeUInt32BE(timeStep % UINT32_MAX_PLUS_ONE, 4);

  const hmac = createHmac("sha1", key).update(time).digest();
  const offset = hmac[hmac.length - 1] & HMAC_OFFSET_MASK;

  // Dynamic truncation per RFC 4226 §5.3
  const code =
    ((hmac[offset] & HIGH_BIT_MASK) << BIT_SHIFT_24) |
    ((hmac[offset + 1] & BYTE_MASK) << BIT_SHIFT_16) |
    ((hmac[offset + 2] & BYTE_MASK) << BYTE_BITS) |
    (hmac[offset + 3] & BYTE_MASK);

  return (code % OTP_MODULUS).toString().padStart(TOTP_DIGITS, "0");
}

const SIX_DIGIT_PATTERN = /^\d{6}$/;

/**
 * Verify a TOTP token allowing for clock drift of ±TOTP_DRIFT_STEPS steps.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * Returns false (rather than throwing) if the stored secret can't be base32-decoded,
 * which can happen if the encrypted column failed to decrypt (e.g. ENCRYPTION_KEY
 * rotated) and the fail-open transformer handed back raw ciphertext. The caller
 * surfaces this as a normal "invalid token" response instead of a 500.
 */
function verifyTotpToken(secret: string, token: string): boolean {
  if (!SIX_DIGIT_PATTERN.test(token)) return false;

  const now = Math.floor(Date.now() / MS_PER_SECOND);
  const currentStep = Math.floor(now / TOTP_STEP_SECONDS);
  const tokenBuf = Buffer.from(token, "utf8");

  for (let i = -TOTP_DRIFT_STEPS; i <= TOTP_DRIFT_STEPS; i++) {
    let candidate: string;
    try {
      candidate = generateTotpCode(secret, currentStep + i);
    } catch {
      return false;
    }
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === tokenBuf.length &&
      timingSafeEqual(candidateBuf, tokenBuf)
    ) {
      return true;
    }
  }
  return false;
}

export interface TotpSetupData {
  secret: string;
  otpauthUrl: string;
}

@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);
  private readonly issuer = "BearlyMail";

  constructor(private readonly usersService: UsersService) {}

  /**
   * Generate a new TOTP secret for MFA setup.
   * Returns the secret and the otpauth URI for the authenticator app.
   * The secret is stored (encrypted) on the user but MFA is not yet enabled.
   * The user must call enableMfa() after verifying the first code.
   */
  async setupMfa(userId: string): Promise<TotpSetupData> {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new Error("User not found");

    const secretBytes = randomBytes(TOTP_SECRET_BYTES);
    const secret = base32Encode(secretBytes);

    const label = encodeURIComponent(`BearlyMail:${user.email}`);
    const issuerEncoded = encodeURIComponent(this.issuer);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuerEncoded}&algorithm=SHA1&digits=6&period=30`;

    // Persist the secret so the user can verify it on the next step.
    // totpEnabled stays false until they prove they can generate valid codes.
    await this.usersService.update(userId, {
      totpSecret: secret,
      totpEnabled: false,
    });

    this.logger.log(`[MFA] TOTP setup initiated for user ${userId}`);

    return { secret, otpauthUrl };
  }

  /**
   * Verify the first TOTP code and enable MFA for the user.
   * Returns false if the token is invalid.
   */
  async enableMfa(userId: string, token: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    if (!user?.totpSecret) return false;

    if (!verifyTotpToken(user.totpSecret, token)) {
      this.logger.warn(
        `[MFA] Failed enable attempt for user ${userId} — invalid token`,
      );
      return false;
    }

    await this.usersService.update(userId, { totpEnabled: true });
    this.logger.log(`[MFA] MFA enabled for user ${userId}`);
    return true;
  }

  /**
   * Verify a TOTP token for an already-enrolled user.
   * Returns false if MFA is not enabled or the token is invalid.
   */
  async verifyMfa(userId: string, token: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    if (!user?.totpEnabled || !user.totpSecret) return false;

    const valid = verifyTotpToken(user.totpSecret, token);
    if (!valid) {
      this.logger.warn(
        `[MFA] Failed verification attempt for user ${userId} — invalid token`,
      );
    }
    return valid;
  }

  /**
   * Disable MFA for a user after verifying their current TOTP token.
   * Requires the user to prove ownership before removing the secret.
   */
  async disableMfa(userId: string, token: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    if (!user?.totpEnabled || !user.totpSecret) return false;

    if (!verifyTotpToken(user.totpSecret, token)) {
      this.logger.warn(
        `[MFA] Failed disable attempt for user ${userId} — invalid token`,
      );
      return false;
    }

    await this.usersService.update(userId, {
      totpSecret: null,
      totpEnabled: false,
    });
    this.logger.log(`[MFA] MFA disabled for user ${userId}`);
    return true;
  }

  /**
   * Check whether a user has MFA enabled.
   */
  async getMfaStatus(userId: string): Promise<{ enabled: boolean }> {
    const user = await this.usersService.findOne(userId);
    return { enabled: user?.totpEnabled ?? false };
  }

  /** Exposed for unit-testing the core TOTP algorithm. */
  static _verifyTotpToken(secret: string, token: string): boolean {
    return verifyTotpToken(secret, token);
  }

  /** Exposed for unit-testing the base32 helpers. */
  static _base32Encode(buffer: Buffer): string {
    return base32Encode(buffer);
  }

  static _base32Decode(input: string): Buffer {
    return base32Decode(input);
  }

  static _generateTotpCode(secret: string, timeStep: number): string {
    return generateTotpCode(secret, timeStep);
  }
}
