import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ContactsService } from "../contacts/contacts.service";
import { ScheduledEmail } from "../database/entities/scheduled-email.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { UsersService } from "../users/users.service";
import {
  CreateScheduledEmailDto,
  ScheduledEmailsService,
} from "./scheduled-emails.service";

const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

describe("ScheduledEmailsService", () => {
  let service: ScheduledEmailsService;
  let repo: jest.Mocked<Repository<ScheduledEmail>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledEmailsService,
        {
          provide: getRepositoryToken(ScheduledEmail),
          useFactory: mockRepository,
        },
        { provide: EmailProviderManager, useValue: {} },
        { provide: EmailsService, useValue: {} },
        { provide: UserEncryptionService, useValue: {} },
        { provide: ContactsService, useValue: {} },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    service = module.get(ScheduledEmailsService);
    repo = module.get(getRepositoryToken(ScheduledEmail));
  });

  describe("scheduleEmail", () => {
    it("saves a scheduled reply with a non-UUID provider thread ID", async () => {
      const dto: CreateScheduledEmailDto = {
        emailType: "reply",
        // Gmail thread IDs are short hex strings — NOT UUIDs.
        // Before the fix, this caused: "invalid input syntax for type uuid".
        threadId: "19deabad8035dc29",
        emailId: "3369f13c-f07b-4549-aee5-e7a15c2ac848",
        to: [{ email: "someone@example.com", name: "Someone" }],
        subject: "Re: Test",
        body: "Scheduled reply body",
        scheduledSendAt: new Date("2025-05-20T08:00:00Z"),
        userTimezone: "Asia/Manila",
      };

      const fakeEntity = { id: "abc-123", ...dto, status: "pending" };
      repo.create.mockReturnValue(fakeEntity as any);
      repo.save.mockResolvedValue(fakeEntity as any);

      const result = await service.scheduleEmail("user-uuid", dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-uuid",
          threadId: "19deabad8035dc29",
          emailId: "3369f13c-f07b-4549-aee5-e7a15c2ac848",
          to: [{ email: "someone@example.com", name: "Someone" }],
          subject: "Re: Test",
          body: "Scheduled reply body",
          status: "pending",
        }),
      );
      expect(repo.save).toHaveBeenCalledWith(fakeEntity);
      expect(result.id).toBe("abc-123");
    });

    it("saves a scheduled reply with cc and bcc", async () => {
      const dto: CreateScheduledEmailDto = {
        emailType: "reply",
        threadId: "19deabad8035dc29",
        emailId: "3369f13c-f07b-4549-aee5-e7a15c2ac848",
        to: [{ email: "to@example.com" }],
        cc: [{ email: "cc@example.com" }],
        bcc: [{ email: "bcc@example.com" }],
        subject: "Re: Test",
        body: "Body",
        scheduledSendAt: new Date("2025-05-20T08:00:00Z"),
      };

      const fakeEntity = { id: "def-456", ...dto, status: "pending" };
      repo.create.mockReturnValue(fakeEntity as any);
      repo.save.mockResolvedValue(fakeEntity as any);

      const result = await service.scheduleEmail("user-uuid", dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: [{ email: "cc@example.com" }],
          bcc: [{ email: "bcc@example.com" }],
        }),
      );
      expect(result.id).toBe("def-456");
    });

    it("sets null for optional fields when not provided", async () => {
      const dto: CreateScheduledEmailDto = {
        emailType: "reply",
        to: [{ email: "to@example.com" }],
        subject: "Test",
        body: "Body",
        scheduledSendAt: new Date("2025-05-20T08:00:00Z"),
      };

      const fakeEntity = { id: "ghi-789", status: "pending" };
      repo.create.mockReturnValue(fakeEntity as any);
      repo.save.mockResolvedValue(fakeEntity as any);

      await service.scheduleEmail("user-uuid", dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: null,
          emailId: null,
          cc: null,
          bcc: null,
          attachments: null,
          errorMessage: null,
          sentAt: null,
        }),
      );
    });
  });
});
