import { CallHandler, ExecutionContext } from "@nestjs/common";
import { of } from "rxjs";

import { KmsEncryptionService } from "./kms-encryption.service";
import { UserEncryptionInterceptor } from "./user-encryption.interceptor";
import { UserEncryptionService } from "./user-encryption.service";

function makeContext(userId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => (userId ? { user: { userId } } : {}),
    }),
  } as unknown as ExecutionContext;
}

function makeCallHandler(): jest.Mocked<CallHandler> {
  return {
    handle: jest.fn().mockReturnValue(of("response")),
  } as unknown as jest.Mocked<CallHandler>;
}

describe("UserEncryptionInterceptor", () => {
  let interceptor: UserEncryptionInterceptor;
  let kmsService: jest.Mocked<KmsEncryptionService>;
  let userEncService: jest.Mocked<UserEncryptionService>;

  beforeEach(() => {
    kmsService = {
      isEnabled: jest.fn(),
    } as unknown as jest.Mocked<KmsEncryptionService>;

    userEncService = {
      getUserKey: jest.fn(),
    } as unknown as jest.Mocked<UserEncryptionService>;

    interceptor = new UserEncryptionInterceptor(userEncService, kmsService);
  });

  it("passes through when KMS is disabled", async () => {
    kmsService.isEnabled.mockReturnValue(false);
    const handler = makeCallHandler();
    const ctx = makeContext("user-1");

    const result = await interceptor.intercept(ctx, handler);

    expect(userEncService.getUserKey).not.toHaveBeenCalled();
    expect(result).toBe(handler.handle());
  });

  it("passes through for unauthenticated requests", async () => {
    kmsService.isEnabled.mockReturnValue(true);
    const handler = makeCallHandler();
    const ctx = makeContext(undefined);

    const result = await interceptor.intercept(ctx, handler);

    expect(userEncService.getUserKey).not.toHaveBeenCalled();
    expect(result).toBe(handler.handle());
  });

  it("fetches user key and wraps handler when KMS is enabled", async () => {
    const key = Buffer.alloc(32, 0xab);
    kmsService.isEnabled.mockReturnValue(true);
    userEncService.getUserKey.mockResolvedValue(key);

    const handler = makeCallHandler();
    const ctx = makeContext("user-1");

    const obs = await interceptor.intercept(ctx, handler);

    await new Promise<void>((resolve, reject) => {
      obs.subscribe({
        complete: () => resolve(),
        error: (err: unknown) => reject(err as Error),
      });
    });

    expect(userEncService.getUserKey).toHaveBeenCalledWith("user-1");
    expect(handler.handle).toHaveBeenCalled();
  });
});
