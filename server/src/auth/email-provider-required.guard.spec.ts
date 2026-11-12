import { ExecutionContext, ForbiddenException } from "@nestjs/common";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { ImapAccountsService } from "../imap-accounts/imap-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { EmailProviderRequiredGuard } from "./email-provider-required.guard";
import { EMAIL_PROVIDER_REQUIRED_ERROR } from "./exceptions/email-provider-required.exception";

function setup({ hasImap = false }: { hasImap?: boolean } = {}) {
  const notConnected = jest.fn().mockResolvedValue(false);
  const guard = new EmailProviderRequiredGuard(
    { hasConnectedGmail: notConnected } as unknown as GoogleAccountsService,
    {
      hasConnectedOffice365: notConnected,
    } as unknown as Office365AccountsService,
    { hasConnectedZoho: notConnected } as unknown as ZohoAccountsService,
    {
      hasConnectedAppleMail: notConnected,
    } as unknown as AppleMailAccountsService,
    {
      findOneWithTokens: jest.fn().mockResolvedValue({}),
    } as unknown as UsersService,
    {
      hasConnectedImap: jest.fn().mockResolvedValue(hasImap),
    } as unknown as ImapAccountsService,
  );
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId: "user-1" } }),
    }),
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe("EmailProviderRequiredGuard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // The guard lets every request through in CI test runs; test the real check.
    delete process.env.CI;
    delete process.env.CI_SEARCH_FALLBACK;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("lets the request through when a mailbox is connected", async () => {
    const { guard, context } = setup({ hasImap: true });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("refuses with the EMAIL_PROVIDER_REQUIRED code when no mailbox is connected", async () => {
    const { guard, context } = setup();

    const refusal = await guard.canActivate(context).catch((error) => error);

    expect(refusal).toBeInstanceOf(ForbiddenException);
    expect((refusal as ForbiddenException).getResponse()).toMatchObject({
      error: EMAIL_PROVIDER_REQUIRED_ERROR,
    });
  });
});
