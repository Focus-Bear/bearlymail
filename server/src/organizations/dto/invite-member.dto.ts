import { IsEmail, IsIn, IsNotEmpty } from "class-validator";

import { OrgRole } from "../../database/entities/organization-member.entity";

export class InviteMemberDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsIn(["admin", "member"])
  role: Exclude<OrgRole, "owner">;
}
