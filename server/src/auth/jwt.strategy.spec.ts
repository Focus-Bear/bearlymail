import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../users/users.service";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;
  let _usersService: UsersService;
  let _configService: ConfigService;

  const mockUsersService = {
    findOne: jest.fn(),
    findOneForAuth: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
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

    it("should use JWT_SECRET from config or default", () => {
      // The strategy is initialized in beforeEach, so we check the constructor was called
      expect(mockConfigService.get).toHaveBeenCalledWith("JWT_SECRET");
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
  });
});
