import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { AuthService } from "./auth.service";
import { OAuthOnlyAccountException } from "./exceptions/oauth-only-account.exception";
import { LocalStrategy } from "./local.strategy";

describe("LocalStrategy", () => {
  let strategy: LocalStrategy;
  let authService: AuthService;

  const mockAuthService = {
    validateUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalStrategy,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    strategy = module.get<LocalStrategy>(LocalStrategy);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validate", () => {
    it("should return user when validation succeeds", async () => {
      const email = "test@example.com";
      const password = "password123";
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      };

      mockAuthService.validateUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(email, password);

      expect(result).toEqual(mockUser);
      expect(authService.validateUser).toHaveBeenCalledWith(email, password);
    });

    it("should throw UnauthorizedException when user is null", async () => {
      const email = "test@example.com";
      const password = "wrongpassword";

      mockAuthService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(email, password)).rejects.toThrow(
        "Invalid email or password",
      );
      expect(authService.validateUser).toHaveBeenCalledWith(email, password);
    });

    it("should re-throw UnauthorizedException from authService", async () => {
      const email = "test@example.com";
      const password = "password123";
      const error = new UnauthorizedException("Invalid credentials");

      mockAuthService.validateUser.mockRejectedValue(error);

      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(email, password)).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("should convert approval pending error to UnauthorizedException", async () => {
      const email = "test@example.com";
      const password = "password123";
      const error = new Error("User is pending approval");

      mockAuthService.validateUser.mockRejectedValue(error);

      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(email, password)).rejects.toThrow(
        "User is pending approval",
      );
    });

    it("should convert other errors to UnauthorizedException", async () => {
      const email = "test@example.com";
      const password = "password123";
      const error = new Error("Database connection failed");

      mockAuthService.validateUser.mockRejectedValue(error);

      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(email, password)).rejects.toThrow(
        "Database connection failed",
      );
    });

    it("should handle error objects without message property", async () => {
      const email = "test@example.com";
      const password = "password123";
      const error = { code: "ERROR_CODE" } as unknown as Error;

      mockAuthService.validateUser.mockRejectedValue(error);

      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should handle non-Error objects", async () => {
      const email = "test@example.com";
      const password = "password123";
      const error = "String error";

      mockAuthService.validateUser.mockRejectedValue(error);

      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should propagate OAuthOnlyAccountException with OAUTH_ONLY_ACCOUNT error code", async () => {
      const email = "oauth-user@example.com";
      const password = "any-password";
      const error = new OAuthOnlyAccountException(email);

      mockAuthService.validateUser.mockRejectedValue(error);

      await expect(strategy.validate(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
      // The exception should propagate with its structured response intact
      await expect(strategy.validate(email, password)).rejects.toMatchObject({
        response: expect.objectContaining({ error: "OAUTH_ONLY_ACCOUNT" }),
      });
    });

    it("should return user without password field", async () => {
      const email = "test@example.com";
      const password = "password123";
      // AuthService.validateUser already strips the password before returning
      const mockUserWithoutPassword = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      };

      mockAuthService.validateUser.mockResolvedValue(mockUserWithoutPassword);

      const result = await strategy.validate(email, password);

      expect(result).not.toHaveProperty("password");
      expect(result.id).toBe("user-123");
      expect(result.email).toBe("test@example.com");
    });
  });
});
