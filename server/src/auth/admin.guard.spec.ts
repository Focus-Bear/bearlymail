import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { AuditService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import { AdminGuard } from "./admin.guard";

describe("AdminGuard", () => {
  let guard: AdminGuard;
  let usersService: UsersService;
  let auditService: AuditService;
  let mockExecutionContext: ExecutionContext;

  const mockUsersService = {
    findOne: jest.fn(),
  };
  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
    usersService = module.get<UsersService>(UsersService);
    auditService = module.get<AuditService>(AuditService);

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn(),
      }),
    } as unknown as ExecutionContext;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeRequest = (
    userId: string | undefined,
    mfaVerified = false,
    extras: Record<string, unknown> = {},
    // Fresh by default when verified; pass an older timestamp to simulate a
    // stale elevation.
    mfaVerifiedAt: number | undefined = mfaVerified ? Date.now() : undefined,
  ) => ({
    user: userId ? { userId, mfaVerified, mfaVerifiedAt } : {},
    method: "GET",
    path: "/admin/test",
    url: "/admin/test",
    originalUrl: "/admin/test",
    ip: "127.0.0.1",
    headers: { "user-agent": "jest" },
    params: {},
    query: {},
    body: {},
    ...extras,
  });

  const NINE_HOURS_MS = 9 * 60 * 60 * 1000;

  describe("canActivate", () => {
    it("should return true for admin user with MFA enabled and verified", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: true,
      });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
    });

    it("should write an audit log entry on successful authorization (GAP-12)", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(
        makeRequest(userId, true, {
          method: "DELETE",
          path: "/feedback/admin/abc-1",
          originalUrl: "/feedback/admin/abc-1?debug=1",
          ip: "10.0.0.5",
          headers: { "user-agent": "Test-UA/1.0" },
          params: { id: "abc-1" },
          query: { page: "0" },
          body: { reason: "spam" },
        }),
      );
      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: true,
      });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith({
        userId,
        action: "DELETE /feedback/admin/abc-1",
        ipAddress: "10.0.0.5",
        userAgent: "Test-UA/1.0",
        metadata: {
          params: { id: "abc-1" },
          query: { page: "0" },
          body: { reason: "spam" },
        },
      });
    });

    it("should not write an audit log entry when authorization fails (non-admin user)", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));
      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: false,
        totpEnabled: true,
      });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it("should not write an audit log entry when MFA is missing", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));
      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: false,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it("should return false for non-admin user", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: false,
        totpEnabled: true,
      });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
    });

    it("should throw ForbiddenException (MFA_SETUP_REQUIRED) when admin has no MFA", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: false,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (err: unknown) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          error: "MFA_SETUP_REQUIRED",
        });
      }
    });

    it("should throw ForbiddenException (MFA_VERIFICATION_REQUIRED) when JWT lacks mfaVerified", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, false));

      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: true,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (err: unknown) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          error: "MFA_VERIFICATION_REQUIRED",
        });
      }
    });

    it("should throw MFA_VERIFICATION_REQUIRED when the elevation is stale (older than the recency window)", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(
        makeRequest(userId, true, {}, Date.now() - NINE_HOURS_MS),
      );
      mockUsersService.findOne.mockResolvedValue({
        id: userId,
        isAdmin: true,
        totpEnabled: true,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      try {
        await guard.canActivate(mockExecutionContext);
      } catch (err: unknown) {
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          error: "MFA_VERIFICATION_REQUIRED",
        });
      }
      // A stale elevation must not be treated as a successful authorization.
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it("should return false when isAdmin is undefined", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));

      mockUsersService.findOne.mockResolvedValue({ id: userId });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
    });

    it("should return false when userId is missing from request", async () => {
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue({ user: {} });

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it("should return false when user object is missing from request", async () => {
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue({});

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
      expect(usersService.findOne).not.toHaveBeenCalled();
    });

    it("should return false when user is not found in DB", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));
      mockUsersService.findOne.mockResolvedValue(null);

      const result = await guard.canActivate(mockExecutionContext);
      expect(result).toBe(false);
    });

    it("should propagate errors from usersService", async () => {
      const userId = "user-123";
      (
        mockExecutionContext.switchToHttp().getRequest as jest.Mock
      ).mockReturnValue(makeRequest(userId, true));
      mockUsersService.findOne.mockRejectedValue(new Error("Database error"));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        "Database error",
      );
    });
  });
});
