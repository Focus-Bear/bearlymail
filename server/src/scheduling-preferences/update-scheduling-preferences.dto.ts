import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

const MAX_HOUR = 23;
const MAX_GAP_MINUTES = 120;
const MAX_DEEP_WORK_HOURS = 12;
const MIN_SLOT_DURATION = 5;
const MAX_SLOT_DURATION = 480;
const MAX_DAY_INDEX = 6;

@ValidatorConstraint({ name: "isIanaTimezone", async: false })
class IsIanaTimezone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "string") return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return "timezone must be a valid IANA timezone (e.g. America/New_York)";
  }
}

export class UpdateSchedulingPreferencesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_HOUR)
  availabilityStartHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_HOUR)
  availabilityEndHour?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_DAY_INDEX, { each: true })
  availabilityDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_GAP_MINUTES)
  meetingGapMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_DEEP_WORK_HOURS)
  deepWorkHoursPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_SLOT_DURATION)
  @Max(MAX_SLOT_DURATION)
  slotDurationMinutes?: number;

  @IsOptional()
  @IsString()
  @Validate(IsIanaTimezone)
  timezone?: string;
}
