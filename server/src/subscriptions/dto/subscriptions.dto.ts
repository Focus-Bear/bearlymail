import {
  IsIn,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
} from "class-validator";

import { VOLUME_TIERS } from "../volume-tiers.constants";

export class ApplyPromoDto {
  @IsString()
  @IsNotEmpty()
  promoCode: string;
}

export class LinkOrgRevenueCatDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  revenueCatOrgSubscriptionId: string;
}

export class GrantAccessDto {
  @IsUUID()
  userId: string;

  @IsPositive()
  durationDays: number;
}

export class AdminGrantPlanDto {
  @IsUUID()
  userId: string;

  @IsString()
  @IsIn(Object.keys(VOLUME_TIERS))
  tier: string;
}

export class AdminPlanTargetDto {
  @IsUUID()
  userId: string;
}
