import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  GMAIL_WRITE_ACTION,
  GOOGLE_PERMISSION_GROUP,
  GOOGLE_SIGN_IN_SCOPES,
  scopesForGooglePermissionGroup,
} from "../constants/google-oauth-scopes";
import { UsersService } from "../users/users.service";
import {
  GOOGLE_PERMISSION_REQUIRED_CODE,
  GooglePermissionRequiredException,
} from "./exceptions/google-permission-required.exception";
import {
  GooglePermissionGuard,
  RequireGooglePermission,
} from "./google-permission.guard";

class ArchiveController {
  @RequireGooglePermission(
    GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
    GMAIL_WRITE_ACTION.ARCHIVE,
  )
  archive(): void {}

  @RequireGooglePermission(
    GOOGLE_PERMISSION_GROUP.GMAIL_SEND,
    GMAIL_WRITE_ACTION.SEND,
  )
  send(): void {}

  read(): void {}
}

type Handler = "archive" | "send" | "read";

function contextFor(handler: Handler, userId = "user-1"): ExecutionContext {
  return {
    getHandler: () => ArchiveController.prototype[handler],
    switchToHttp: () => ({ getRequest: () => ({ user: { userId } }) }),
  } as unknown as ExecutionContext;
}

function guardFor(user: Record<string, unknown> | null) {
  const usersService = {
    findOneWithTokens: jest.fn().mockResolvedValue(user),
  } as unknown as UsersService;
  return new GooglePermissionGuard(new Reflector(), usersService);
}

const READONLY_GRANT = GOOGLE_SIGN_IN_SCOPES.join(" ");
const gmailUser = (googleGrantedScopes: string | null) => ({
  id: "user-1",
  googleCalendarAccessToken: "access",
  googleGrantedScopes,
});

describe("GooglePermissionGuard", () => {
  it("refuses an archive from a read-only Gmail user with the permission and action to ask for", async () => {
    const guard = guardFor(gmailUser(READONLY_GRANT));

    const error = await guard
      .canActivate(contextFor("archive"))
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GooglePermissionRequiredException);
    expect((error as GooglePermissionRequiredException).getStatus()).toBe(403);
    expect((error as GooglePermissionRequiredException).getResponse()).toEqual(
      expect.objectContaining({
        code: GOOGLE_PERMISSION_REQUIRED_CODE,
        permission: GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE,
        action: GMAIL_WRITE_ACTION.ARCHIVE,
      }),
    );
  });

  it("refuses a send from a read-only Gmail user with gmail_send", async () => {
    const guard = guardFor(gmailUser(READONLY_GRANT));

    await expect(guard.canActivate(contextFor("send"))).rejects.toMatchObject({
      permission: GOOGLE_PERMISSION_GROUP.GMAIL_SEND,
      action: GMAIL_WRITE_ACTION.SEND,
    });
  });

  it("lets the action through once the permission is granted", async () => {
    const manageGrant = [
      ...GOOGLE_SIGN_IN_SCOPES,
      ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE),
    ].join(" ");
    const guard = guardFor(gmailUser(manageGrant));

    await expect(guard.canActivate(contextFor("archive"))).resolves.toBe(true);
  });

  it("lets existing users with an unrecorded grant through (no re-consent)", async () => {
    const guard = guardFor(gmailUser(null));

    await expect(guard.canActivate(contextFor("archive"))).resolves.toBe(true);
  });

  it("lets users without a Gmail connection through (Outlook, Zoho, IMAP)", async () => {
    const guard = guardFor({ id: "user-1", googleGrantedScopes: null });

    await expect(guard.canActivate(contextFor("send"))).resolves.toBe(true);
  });

  it("ignores handlers that don't declare a permission", async () => {
    const guard = guardFor(gmailUser(READONLY_GRANT));

    await expect(guard.canActivate(contextFor("read"))).resolves.toBe(true);
  });
});
