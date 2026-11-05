import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";

import { AuthenticatedRequest } from "../types/common";
import { GooglePermissionUrlQueryDto } from "./dto/google-permission-url-query.dto";
import {
  buildGooglePermissionGrantUrl,
  DEFAULT_GRANT_RETURN_PATH,
} from "./google-permission-grant";
import { JwtAuthGuard } from "./jwt-auth.guard";

/**
 * Incremental Google authorization. Sign-in only asks for Gmail; the feature
 * that needs calendar or contacts asks for it here, and AuthController's
 * Google callback finishes the grant.
 */
@Controller("auth/google")
@UseGuards(JwtAuthGuard)
export class GooglePermissionsController {
  /** GET /auth/google/permission-url?permission=calendar&returnTo=/inbox */
  @Get("permission-url")
  getPermissionUrl(
    @Request() req: AuthenticatedRequest,
    @Query() query: GooglePermissionUrlQueryDto,
  ): { url: string } {
    return {
      url: buildGooglePermissionGrantUrl({
        userId: req.user.userId,
        email: req.user.email,
        permission: query.permission,
        returnTo: query.returnTo ?? DEFAULT_GRANT_RETURN_PATH,
      }),
    };
  }
}
