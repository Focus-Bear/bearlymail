import { IsIn, IsNotEmpty } from "class-validator";

import { OrgRole } from "../../database/entities/organization-member.entity";

export class UpdateMemberRoleDto {
  @IsIn(["admin", "member"])
  @IsNotEmpty()
  role: Exclude<OrgRole, "owner">;
}
