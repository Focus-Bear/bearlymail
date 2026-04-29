import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";

import {
  STEP_UP_REQUIRED_RESPONSE,
  STEP_UP_TOKEN_HEADER,
  StepUpAuthGuard,
} from "./step-up.guard";

describe("StepUpAuthGuard", () => {
  let guard: StepUpAuthGuard;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const makeContext = (
    userId: string | undefined,
    stepUpToken?: string,
  ): ExecutionContext => {
    const headers: Record<string, string> = {};
    if (stepUpToken !== undefined) {
      headers[STEP_UP_TOKEN_HEADER] = stepUpToken;
    }
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: userId ? { userId } : undefined,
          headers,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StepUpAuthGuard,
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    guard = module.get<StepUpAuthGuard>(StepUpAuthGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("with a valid step-up token", () => {
    it("returns true for a valid token matching the userId", async () => {
      const userId = "user-123";
      mockJwtService.verify.mockReturnValue({ sub: userId, stepUp: true });

      const ctx = makeContext(userId, "valid-token");
      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
    });

    it("throws when token sub does not match userId", async () => {
      mockJwtService.verify.mockReturnValue({
        sub: "other-user",
        stepUp: true,
      });

      const ctx = makeContext("user-123", "mismatched-token");
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws when token lacks stepUp claim", async () => {
      const userId = "user-123";
      mockJwtService.verify.mockReturnValue({ sub: userId, stepUp: false });

      const ctx = makeContext(userId, "no-step-up-claim");
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws when JWT verification fails (expired/invalid)", async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("jwt expired");
      });

      const ctx = makeContext("user-123", "expired-token");
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("without a step-up token", () => {
    it("throws STEP_UP_REQUIRED for any user without a token", async () => {
      const ctx = makeContext("user-123");
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("thrown error includes requiresStepUp flag", async () => {
      const ctx = makeContext("user-123");
      let caughtError: UnauthorizedException | null = null;
      try {
        await guard.canActivate(ctx);
      } catch (err) {
        caughtError = err as UnauthorizedException;
      }

      expect(caughtError).not.toBeNull();
      expect(
        (caughtError!.getResponse() as typeof STEP_UP_REQUIRED_RESPONSE)
          .requiresStepUp,
      ).toBe(true);
      expect(
        (caughtError!.getResponse() as typeof STEP_UP_REQUIRED_RESPONSE).error,
      ).toBe("STEP_UP_REQUIRED");
    });
  });

  describe("when userId is missing from request", () => {
    it("throws when userId is undefined", async () => {
      const ctx = makeContext(undefined);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
