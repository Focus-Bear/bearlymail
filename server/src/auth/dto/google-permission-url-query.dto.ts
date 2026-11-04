import { IsIn, IsOptional, IsString } from "class-validator";

import {
  INCREMENTAL_GOOGLE_PERMISSION_GROUPS,
  IncrementalGooglePermissionGroup,
} from "../../constants/google-oauth-scopes";

export class GooglePermissionUrlQueryDto {
  @IsIn(INCREMENTAL_GOOGLE_PERMISSION_GROUPS)
  permission: IncrementalGooglePermissionGroup;

  /** In-app path to come back to; anything else falls back to the inbox. */
  @IsOptional()
  @IsString()
  returnTo?: string;
}
