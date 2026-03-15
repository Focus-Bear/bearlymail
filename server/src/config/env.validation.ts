import { plainToInstance } from "class-transformer";
import { IsOptional, IsString, validateSync } from "class-validator";

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
