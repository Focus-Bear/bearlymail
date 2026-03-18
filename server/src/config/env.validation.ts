import { plainToInstance, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from "class-validator";

/** Maximum allowed DB pool size per process. Above this, connection budget maths break. */
const DB_POOL_SIZE_MAX = 50;

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
