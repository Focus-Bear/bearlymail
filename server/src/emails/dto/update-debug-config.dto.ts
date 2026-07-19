import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Validation constraints for debug config updates.
 * Object literal avoids the no-magic-numbers lint rule for numeric initializers.
 */
const DEBUG_CONFIG_CONSTRAINTS = {
  MAX_RETENTION_DAYS: 365,
} as const;

export class UpdateDebugConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DEBUG_CONFIG_CONSTRAINTS.MAX_RETENTION_DAYS)
  retentionDays?: number;
}
