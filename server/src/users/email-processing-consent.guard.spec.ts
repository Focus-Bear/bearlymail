import { ExecutionContext, ForbiddenException } from "@nestjs/common";

import { mockPartial } from "../test/helpers/mock-utils";
import { EmailProcessingConsentGuard } from "./email-processing-consent.guard";
import { UsersService } from "./users.service";

function contextFor(userId?: string): ExecutionContext {
  return mockPartial<ExecutionContext>({
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId } : undefined }),
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
  });
}

describe("EmailProcessingConsentGuard", () => {
  const hasEmailProcessingConsent = jest.fn();
  const guard = new EmailProcessingConsentGuard(
    mockPartial<UsersService>({ hasEmailProcessingConsent }),
  );

  beforeEach(() => hasEmailProcessingConsent.mockReset());

  it("refuses a user who hasn't accepted the terms, so a client can't skip step 1", async () => {
    hasEmailProcessingConsent.mockResolvedValue(false);

    await expect(guard.canActivate(contextFor("user-1"))).rejects.toThrow(
      ForbiddenException,
    );
    expect(hasEmailProcessingConsent).toHaveBeenCalledWith("user-1");
  });

  it("lets a user through once acceptance is recorded", async () => {
    hasEmailProcessingConsent.mockResolvedValue(true);

    await expect(guard.canActivate(contextFor("user-1"))).resolves.toBe(true);
  });

  it("refuses an unauthenticated request", async () => {
    await expect(guard.canActivate(contextFor())).rejects.toThrow(
      ForbiddenException,
    );
    expect(hasEmailProcessingConsent).not.toHaveBeenCalled();
  });
});
