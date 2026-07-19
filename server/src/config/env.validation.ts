import { plainToInstance, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

/** Maximum allowed DB pool size per process. Above this, connection budget maths break. */
const DB_POOL_SIZE_MAX = 50;

/** Minimum acceptable ENCRYPTION_KEY length (AES-256 needs ≥16 chars for scrypt input). */
const ENCRYPTION_KEY_MIN_LENGTH = 16;

/**
 * Minimum acceptable JWT_SECRET length. HS256 (HMAC-SHA-256) requires a key of
 * at least the hash output size — 256 bits / 32 bytes — per RFC 7518 §3.2.
 */
const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Environment variable validation schema.
 *
 * Add required env vars here so that misconfigured deploys fail fast at
 * startup (NestJS ConfigModule `validate` hook) rather than silently at
 * runtime.
 *
 * Keep this file lean — only truly required vars that would break the app
 * at runtime if absent. Optional vars should remain optional here.
 */
export class EnvironmentVariables {
  /**
   * AES-256 encryption key for all data at rest.
   * Required — the app will refuse to start without a valid key.
   * Must be at least 16 characters. Use a strong random value in production
   * and store it in Secrets Manager (never in source control).
   */
  @IsString()
  @MinLength(ENCRYPTION_KEY_MIN_LENGTH, {
    message: `ENCRYPTION_KEY must be at least ${ENCRYPTION_KEY_MIN_LENGTH} characters`,
  })
  ENCRYPTION_KEY: string;

  /**
   * Secret used to sign/verify JWTs and OAuth connect-state.
   * Required — the app previously fell back to a hardcoded "your-secret-key"
   * default, which lets anyone forge tokens. Fail fast instead so a
   * misconfigured deploy can never boot on a public default.
   */
  @IsString()
  @MinLength(JWT_SECRET_MIN_LENGTH, {
    message: `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters`,
  })
  JWT_SECRET: string;

  /**
   * S3 bucket name for feedback screenshot uploads.
   * Optional — if absent, presigned URL generation will fail at runtime but
   * the server will still start. The FeedbackScreenshotsService logs a warning
   * when this is unset.
   */
  @IsOptional()
  @IsString()
  FEEDBACK_SCREENSHOTS_BUCKET?: string;

  /**
   * TypeORM connection pool size per process.
   * Default 5. Keep (web_instances × DB_POOL_SIZE) + (worker_instances × DB_POOL_SIZE)
   * well below your RDS max_connections (≈112 for t4g.micro, ≈225 for t4g.small).
   * With max 3 web + 1 worker: 4 × (5 + 5) = 40 connections (36% of 112) — safe.
   *
   * Note: @Min(1) allows a pool of 1, but values < 3 can serialize database work
   * under concurrent load — all requests queue behind a single connection.
   * For production, prefer at least 3–5.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DB_POOL_SIZE_MAX)
  DB_POOL_SIZE?: number;

  /**
   * PgBoss pg.Pool size per process (separate from the TypeORM pool).
   * Default 5. Apply the same connection budget math as DB_POOL_SIZE above.
   *
   * Note: @Min(1) allows a pool of 1, but values < 3 can serialize database work
   * under concurrent load — all requests queue behind a single connection.
   * For production, prefer at least 3–5.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DB_POOL_SIZE_MAX)
  DB_PGBOSS_POOL_SIZE?: number;

  /**
   * SQS queue URL for context analysis Lambda dispatch.
   * All context analysis routes exclusively through Lambda + SQS.
   * Injected by CDK from BearlyMailContextAnalysisStack at deploy time.
   * Optional here to allow CI smoke tests to start without AWS credentials;
   * SqsService will throw at runtime if a dispatch is attempted without it.
   */
  @IsOptional()
  @IsString()
  CONTEXT_ANALYSIS_SQS_QUEUE_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((err) => Object.values(err.constraints ?? {}).join(", ")).join("\n")}`,
    );
  }

  return validatedConfig;
}
