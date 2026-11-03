import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  GmailWriteAction,
  hasGooglePermission,
  IncrementalGooglePermissionGroup,
} from "../constants/google-oauth-scopes";
import { UsersService } from "../users/users.service";
import { GooglePermissionRequiredException } from "./exceptions/google-permission-required.exception";

const GOOGLE_PERMISSION_METADATA_KEY = "requiredGooglePermission";

interface RequiredGooglePermission {
  permission: IncrementalGooglePermissionGroup;
  action: GmailWriteAction;
}

/**
 * Refuses the endpoint with a GooglePermissionRequiredException when the
 * signed-in user's Gmail grant lacks `permission`. The guard runs before the
 * handler, so nothing changes in BearlyMail either: the client asks Google
 * for the permission and replays the request.
 */
export const RequireGooglePermission = (
  permission: IncrementalGooglePermissionGroup,
  action: GmailWriteAction,
) =>
  applyDecorators(
    SetMetadata(GOOGLE_PERMISSION_METADATA_KEY, {
      permission,
      action,
    } satisfies RequiredGooglePermission),
    UseGuards(GooglePermissionGuard),
  );

/**
 * Throws GooglePermissionRequiredException when the user's Gmail grant lacks
 * `permission`. Only users whose mailbox is the legacy Gmail connection
 * (Google tokens on the user row, which GmailProvider writes through) can be
 * missing one. Everyone else — Outlook, Zoho, IMAP, and Google sign-ins whose
 * grant predates scope tracking — passes.
 */
export async function assertGooglePermission(
  usersService: Pick<UsersService, "findOneWithTokens">,
  userId: string,
  permission: IncrementalGooglePermissionGroup,
  action: GmailWriteAction,
): Promise<void> {
  const user = await usersService.findOneWithTokens(userId);
  if (!user?.googleCalendarAccessToken) return;
  if (hasGooglePermission(user.googleGrantedScopes, permission)) return;
  throw new GooglePermissionRequiredException(permission, action);
}

@Injectable()
export class GooglePermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredGooglePermission | undefined>(
      GOOGLE_PERMISSION_METADATA_KEY,
      context.getHandler(),
    );
    const userId: string | undefined = context.switchToHttp().getRequest()
      .user?.userId;
    if (!required || !userId) return true;

    await assertGooglePermission(
      this.usersService,
      userId,
      required.permission,
      required.action,
    );
    return true;
  }
}
