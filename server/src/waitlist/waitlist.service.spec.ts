import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import { Waitlist } from "../database/entities/waitlist.entity";
import { EmailService } from "../email/email.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { WaitlistService } from "./waitlist.service";

jest.mock("axios");
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomBytes: jest.fn(() => Buffer.alloc(32, "a")),
}));
jest.mock("../encryption/encryption.helper", () => {
  const noopTransformer = {
    to: (value: unknown) => value,
    from: (value: unknown) => value,
  };
  return {
    EncryptionHelper: {
      hashEmail: jest.fn((email: string) => `hash_${email.toLowerCase()}`),
    },
    makeEmailTransformer: () => noopTransformer,
    makeEncryptedColumnTransformer: () => noopTransformer,
    makeEncryptedJsonTransformer: () => noopTransformer,
    makeGlobalEmailTransformer: () => noopTransformer,
    makeGlobalEncryptedColumnTransformer: () => noopTransformer,
    makeGlobalEncryptedJsonTransformer: () => noopTransformer,
  };
});

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("WaitlistService", () => {
  let service: WaitlistService;
  let repository: jest.Mocked<Repository<Waitlist>>;
  let usersService: jest.Mocked<UsersService>;
  let emailService: jest.Mocked<EmailService>;
  let configService: jest.Mocked<ConfigService>;

  const mockWaitlistEntry: Waitlist = {
    id: "waitlist-1",
    email: "test@example.com",
    emailHash: "hash_test@example.com",
    firstName: "Test",
    reason: "I want to test the product",
    approved: false,
    createdAt: new Date("2024-01-01"),
  } as Waitlist;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        {
          provide: getRepositoryToken(Waitlist),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendWaitlistApprovalEmail: jest.fn(),
            sendWaitlistConfirmationEmail: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
    repository = module.get(getRepositoryToken(Waitlist));
    usersService = module.get(UsersService);
    emailService = module.get(EmailService);
    configService = module.get(ConfigService);
    jest.clearAllMocks();

    mockedAxios.post.mockResolvedValue({ data: {} });
  });

  describe("create", () => {
    beforeEach(() => {
      // No existing waitlist entry for the email by default
      repository.findOne.mockResolvedValue(null);
    });

    it("should create a waitlist entry", async () => {
      repository.create.mockReturnValue(mockWaitlistEntry);
      repository.save.mockResolvedValue(mockWaitlistEntry);
      // No Cliq config
      configService.get.mockReturnValue(undefined);

      const result = await service.create(
        "test@example.com",
        "Test",
        "I want to test",
      );

      expect(EncryptionHelper.hashEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(repository.create).toHaveBeenCalledWith({
        email: "test@example.com",
        emailHash: "hash_test@example.com",
        firstName: "Test",
        reason: "I want to test",
        approved: false,
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual({ status: "created", entry: mockWaitlistEntry });
    });

    it("should return already_on_waitlist without saving when the email is already registered", async () => {
      repository.findOne.mockResolvedValue(mockWaitlistEntry);

      const result = await service.create(
        "test@example.com",
        "Test",
        "I want to test",
      );

      expect(result).toEqual({ status: "already_on_waitlist" });
      expect(repository.save).not.toHaveBeenCalled();
      expect(emailService.sendWaitlistConfirmationEmail).not.toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should send a confirmation email to the registrant", async () => {
      repository.create.mockReturnValue(mockWaitlistEntry);
      repository.save.mockResolvedValue(mockWaitlistEntry);
      configService.get.mockReturnValue(undefined);

      await service.create("test@example.com", "Test", "I want to test");

      expect(emailService.sendWaitlistConfirmationEmail).toHaveBeenCalledWith(
        "test@example.com",
        "Test",
        "en",
      );
    });

    it("should not fail the signup when the confirmation email fails", async () => {
      repository.create.mockReturnValue(mockWaitlistEntry);
      repository.save.mockResolvedValue(mockWaitlistEntry);
      configService.get.mockReturnValue(undefined);
      emailService.sendWaitlistConfirmationEmail.mockRejectedValue(
        new Error("SES error"),
      );

      const result = await service.create(
        "test@example.com",
        "Test",
        "I want to test",
      );

      expect(result).toEqual({ status: "created", entry: mockWaitlistEntry });
    });

    it("should not send a confirmation email for auto-approved signups", async () => {
      const autoApprovedEntry = {
        ...mockWaitlistEntry,
        email: "jeremy@focusbear.io",
        approved: true,
      };
      repository.create.mockReturnValue(autoApprovedEntry);
      repository.save.mockResolvedValue(autoApprovedEntry);
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockPartial({ id: "user-1" }));
      configService.get.mockReturnValue(undefined);

      await service.create("jeremy@focusbear.io", "Jeremy", "Testing");

      expect(emailService.sendWaitlistConfirmationEmail).not.toHaveBeenCalled();
    });

    it("should auto-approve jeremy@focusbear.io", async () => {
      const autoApprovedEntry = {
        ...mockWaitlistEntry,
        email: "jeremy@focusbear.io",
        approved: true,
      };
      repository.create.mockReturnValue(autoApprovedEntry);
      repository.save.mockResolvedValue(autoApprovedEntry);
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockPartial({ id: "user-1" }));
      configService.get.mockReturnValue(undefined);

      const result = await service.create(
        "jeremy@focusbear.io",
        "Jeremy",
        "Testing",
      );

      expect(result.entry.approved).toBe(true);
      expect(usersService.create).toHaveBeenCalledWith({
        email: "jeremy@focusbear.io",
        name: "Jeremy",
        isApproved: true,
        isAdmin: true,
      });
    });

    it("should update existing user when jeremy@focusbear.io is auto-approved", async () => {
      const autoApprovedEntry = {
        ...mockWaitlistEntry,
        email: "jeremy@focusbear.io",
        approved: true,
      };
      repository.create.mockReturnValue(autoApprovedEntry);
      repository.save.mockResolvedValue(autoApprovedEntry);
      const existingUser = mockPartial({ id: "user-1", isAdmin: false });
      usersService.findByEmail.mockResolvedValue(existingUser);
      usersService.update.mockResolvedValue(existingUser);
      configService.get.mockReturnValue(undefined);

      await service.create("jeremy@focusbear.io", "Jeremy", "Testing");

      expect(usersService.update).toHaveBeenCalledWith("user-1", {
        isApproved: true,
        isAdmin: true,
      });
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it("should not create user for non-auto-approved entries", async () => {
      repository.create.mockReturnValue(mockWaitlistEntry);
      repository.save.mockResolvedValue(mockWaitlistEntry);
      configService.get.mockReturnValue(undefined);

      await service.create("test@example.com", "Test", "Testing");

      expect(usersService.create).not.toHaveBeenCalled();
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it("should send Cliq notification when configured", async () => {
      repository.create.mockReturnValue(mockWaitlistEntry);
      repository.save.mockResolvedValue(mockWaitlistEntry);
      configService.get.mockImplementation((key: string) => {
        if (key === "ZOHO_CLIQ_BACKEND_BOT_WEBHOOK")
          return "https://cliq.webhook.url";
        if (key === "ZOHO_CLIQ_API_KEY") return "api-key";
        if (key === "ZOHO_CLIQ_BEARLY_MAIL_SIGNUP_CHANNEL") return "channel-id";
        return undefined;
      });

      await service.create("test@example.com", "Test", "Testing");

      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://cliq.webhook.url?zapikey=api-key",
        expect.objectContaining({
          channel: "channel-id",
          message: expect.stringContaining("New Waitlist Signup"),
        }),
      );
    });

    it("should not send Cliq notification when config is missing", async () => {
      repository.create.mockReturnValue(mockWaitlistEntry);
      repository.save.mockResolvedValue(mockWaitlistEntry);
      configService.get.mockReturnValue(undefined);

      await service.create("test@example.com", "Test", "Testing");

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return all waitlist entries ordered by createdAt DESC", async () => {
      const entries = [mockWaitlistEntry];
      repository.find.mockResolvedValue(entries);

      const result = await service.findAll();

      expect(repository.find).toHaveBeenCalledWith({
        order: { createdAt: "DESC" },
      });
      expect(result).toEqual(entries);
    });

    it("should return empty array when no entries", async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe("findOne", () => {
    it("should return waitlist entry by id", async () => {
      repository.findOne.mockResolvedValue(mockWaitlistEntry);

      const result = await service.findOne("waitlist-1");

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "waitlist-1" },
      });
      expect(result).toEqual(mockWaitlistEntry);
    });

    it("should return undefined when entry not found", async () => {
      repository.findOne.mockResolvedValue(undefined);

      const result = await service.findOne("nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("findByEmail", () => {
    it("should find waitlist entry by email hash", async () => {
      repository.findOne.mockResolvedValue(mockWaitlistEntry);

      const result = await service.findByEmail("test@example.com");

      expect(EncryptionHelper.hashEmail).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { emailHash: "hash_test@example.com" },
      });
      expect(result).toEqual(mockWaitlistEntry);
    });

    it("should return null when entry not found", async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail("nonexistent@example.com");

      expect(result).toBeNull();
    });
  });

  describe("approve", () => {
    it("should throw error if entry not found", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.approve("nonexistent")).rejects.toThrow(
        "Waitlist entry not found",
      );
    });

    it("should approve entry and create user account with setup token", async () => {
      repository.findOne
        .mockResolvedValueOnce(mockWaitlistEntry)
        .mockResolvedValueOnce({ ...mockWaitlistEntry, approved: true });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockPartial({ id: "user-1" }));
      emailService.sendWaitlistApprovalEmail.mockResolvedValue(undefined);

      const result = await service.approve("waitlist-1");

      expect(repository.update).toHaveBeenCalledWith("waitlist-1", {
        approved: true,
      });
      expect(usersService.create).toHaveBeenCalledWith({
        email: "test@example.com",
        name: "Test",
        isApproved: false,
        isAdmin: false,
        passwordSetupToken: expect.any(String),
        passwordSetupTokenExpiresAt: expect.any(Date),
      });
      expect(emailService.sendWaitlistApprovalEmail).toHaveBeenCalledWith(
        "test@example.com",
        "Test",
        expect.any(String),
        "en",
      );
      expect(result.approved).toBe(true);
    });

    it("should approve entry and update existing user with setup token", async () => {
      const existingUser = mockPartial({ id: "user-1" });
      repository.findOne
        .mockResolvedValueOnce(mockWaitlistEntry)
        .mockResolvedValueOnce({ ...mockWaitlistEntry, approved: true });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      usersService.findByEmail.mockResolvedValue(existingUser);
      usersService.update.mockResolvedValue(existingUser);
      emailService.sendWaitlistApprovalEmail.mockResolvedValue(undefined);

      const result = await service.approve("waitlist-1");

      expect(usersService.update).toHaveBeenCalledWith("user-1", {
        passwordSetupToken: expect.any(String),
        passwordSetupTokenExpiresAt: expect.any(Date),
      });
      expect(usersService.create).not.toHaveBeenCalled();
      expect(result.approved).toBe(true);
    });

    it("should set isAdmin for jeremy@focusbear.io when creating user", async () => {
      const jeremyEntry = {
        ...mockWaitlistEntry,
        email: "jeremy@focusbear.io",
      };
      repository.findOne
        .mockResolvedValueOnce(jeremyEntry)
        .mockResolvedValueOnce({ ...jeremyEntry, approved: true });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockPartial({ id: "user-1" }));
      emailService.sendWaitlistApprovalEmail.mockResolvedValue(undefined);

      await service.approve("waitlist-1");

      expect(usersService.create).toHaveBeenCalledWith({
        email: "jeremy@focusbear.io",
        name: "Test",
        isApproved: false,
        isAdmin: true,
        passwordSetupToken: expect.any(String),
        passwordSetupTokenExpiresAt: expect.any(Date),
      });
    });

    it("should generate password setup token valid for 7 days", async () => {
      const now = new Date("2024-01-01T12:00:00Z");
      jest.useFakeTimers();
      jest.setSystemTime(now);

      repository.findOne
        .mockResolvedValueOnce(mockWaitlistEntry)
        .mockResolvedValueOnce({ ...mockWaitlistEntry, approved: true });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockPartial({ id: "user-1" }));
      emailService.sendWaitlistApprovalEmail.mockResolvedValue(undefined);

      await service.approve("waitlist-1");

      const createCall = usersService.create.mock.calls[0][0];
      const expiresAt = createCall.passwordSetupTokenExpiresAt;
      const expectedExpiry = new Date(now);
      expectedExpiry.setDate(expectedExpiry.getDate() + 7);

      expect(expiresAt.getTime()).toBe(expectedExpiry.getTime());

      jest.useRealTimers();
    });

    it("should not throw if email sending fails", async () => {
      repository.findOne
        .mockResolvedValueOnce(mockWaitlistEntry)
        .mockResolvedValueOnce({ ...mockWaitlistEntry, approved: true });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockPartial({ id: "user-1" }));
      emailService.sendWaitlistApprovalEmail.mockRejectedValue(
        new Error("Email failed"),
      );

      await expect(service.approve("waitlist-1")).resolves.toBeDefined();

      expect(repository.update).toHaveBeenCalled();
      expect(usersService.create).toHaveBeenCalled();
    });

    // User needs password setup
    it("should not set isApproved to true when creating user", async () => {
      repository.findOne
        .mockResolvedValueOnce(mockWaitlistEntry)
        .mockResolvedValueOnce({ ...mockWaitlistEntry, approved: true });
      repository.update.mockResolvedValue(mockPartial({ affected: 1 }));
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockPartial({ id: "user-1" }));
      emailService.sendWaitlistApprovalEmail.mockResolvedValue(undefined);

      await service.approve("waitlist-1");

      const createCall = usersService.create.mock.calls[0][0];
      expect(createCall.isApproved).toBe(false);
    });
  });
});
