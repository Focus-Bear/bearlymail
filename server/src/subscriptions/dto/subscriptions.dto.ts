import { IsNotEmpty, IsPositive, IsString, IsUUID } from "class-validator";

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
