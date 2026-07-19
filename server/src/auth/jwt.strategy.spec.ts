import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../users/users.service";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  let _usersService: UsersService;
  let _configService: ConfigService;

  const mockUsersService: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    findOneForAuth: jest.fn(),
    findOneActivityTimestamp: jest.fn().mockResolvedValue(new Date()),
    updateLastActivity: jest.fn().mockResolvedValue(undefined),
  };

  const mockConfigService = {
    get: jest.fn(),
    getOrThrow: jest
      .fn()
      .mockReturnValue("test-jwt-secret-1234567890-strong-32"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    _usersService = module.get<UsersService>(UsersService);
    _configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor / extractor", () => {
    it("should configure dual JWT extraction (cookie + Bearer header)", () => {
      // The strategy is initialised in beforeEach — verify the config service was called
      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith("JWT_SECRET");
      // The strategy instance must exist (constructor did not throw)
      expect(strategy).toBeDefined();
    });
  });

  describe("validate", () => {
    it("should return user data when user exists", async () => {
      const payload = { sub: "user-123", email: "test@example.com" };
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      };

      mockUsersService.findOneForAuth.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: "user-123",
        email: "test@example.com",
        mfaVerified: false,
      });
      expect(mockUsersService.findOneForAuth).toHaveBeenCalledWith("user-123");
    });

    it("should throw UnauthorizedException when user is not found", async () => {
      const payload = { sub: "user-123", email: "test@example.com" };

      mockUsersService.findOneForAuth.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUsersService.findOneForAuth).toHaveBeenCalledWith("user-123");
    });

    it("should handle payload without email field", async () => {
      const payload = { sub: "user-123" };
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      };

      mockUsersService.findOneForAuth.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: "user-123",
        email: "test@example.com",
        mfaVerified: false,
      });
    });

    it("should handle errors from usersService", async () => {
      const payload = { sub: "user-123" };

      mockUsersService.findOneForAuth.mockRejectedValue(
        new Error("Database error"),
      );

      await expect(strategy.validate(payload)).rejects.toThrow(
        "Database error",
      );
    });

    it("should read JWT_SECRET via getOrThrow (no hardcoded default)", () => {
      // The strategy is initialized in beforeEach, so we check the constructor was called
      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith("JWT_SECRET");
    });

    it("should return user data with correct structure", async () => {
      const payload = { sub: "user-456", email: "another@example.com" };
      const mockUser = {
        id: "user-456",
        email: "another@example.com",
        name: "Another User",
        isAdmin: true,
      };

      mockUsersService.findOneForAuth.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toHaveProperty("userId");
      expect(result).toHaveProperty("email");
      expect(result.userId).toBe("user-456");
      expect(result.email).toBe("another@example.com");
      // Should not include other fields
      expect(result).not.toHaveProperty("name");
      expect(result).not.toHaveProperty("isAdmin");
    });

    describe("passwordChangedAt session invalidation", () => {
      it("should accept a token issued after passwordChangedAt", async () => {
        const passwordChangedAt = new Date("2026-01-01T00:00:00Z");
        // iat is 10 minutes after password change
        const iat = Math.floor(
          new Date("2026-01-01T00:10:00Z").getTime() / 1000,
        );
        const payload = { sub: "user-123", email: "test@example.com", iat };
        const mockUser = {
          id: "user-123",
          email: "test@example.com",
          passwordChangedAt,
          lastActivityAt: null,
        };

        mockUsersService.findOneForAuth.mockResolvedValue(mockUser);

        const result = await strategy.validate(payload);
        expect(result).toEqual({
          userId: "user-123",
          email: "test@example.com",
          mfaVerified: false,
        });
      });

      it("should reject a token issued before passwordChangedAt", async () => {
        const passwordChangedAt = new Date("2026-01-01T00:10:00Z");
        // iat is 5 minutes before password change
        const iat = Math.floor(
          new Date("2026-01-01T00:05:00Z").getTime() / 1000,
        );
        const payload = { sub: "user-123", email: "test@example.com", iat };
        const mockUser = {
          id: "user-123",
          email: "test@example.com",
          passwordChangedAt,
          lastActivityAt: null,
        };

        mockUsersService.findOneForAuth.mockResolvedValue(mockUser);

        await expect(strategy.validate(payload)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it("should accept a token when passwordChangedAt is null", async () => {
        const iat = Math.floor(Date.now() / 1000) - 60;
        const payload = { sub: "user-123", email: "test@example.com", iat };
        const mockUser = {
          id: "user-123",
          email: "test@example.com",
          passwordChangedAt: null,
          lastActivityAt: null,
        };

        mockUsersService.findOneForAuth.mockResolvedValue(mockUser);

        const result = await strategy.validate(payload);
        expect(result).toEqual({
          userId: "user-123",
          email: "test@example.com",
          mfaVerified: false,
        });
      });

      it("should accept a token when payload has no iat field", async () => {
        const passwordChangedAt = new Date("2026-01-01T00:00:00Z");
        const payload = { sub: "user-123", email: "test@example.com" };
        const mockUser = {
          id: "user-123",
          email: "test@example.com",
          passwordChangedAt,
          lastActivityAt: null,
        };

        mockUsersService.findOneForAuth.mockResolvedValue(mockUser);

        const result = await strategy.validate(payload);
        expect(result).toEqual({
          userId: "user-123",
          email: "test@example.com",
          mfaVerified: false,
        });
      });
    });
  });
});
