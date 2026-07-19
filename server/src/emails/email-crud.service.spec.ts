import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailCrudService } from "./email-crud.service";

describe("EmailCrudService", () => {
  let service: EmailCrudService;
  let mockRepo: jest.Mocked<
    Pick<Repository<Email>, "findOne" | "save" | "update">
  >;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        EmailCrudService,
        {
          provide: getRepositoryToken(Email),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get(EmailCrudService);
  });

  describe("updateEmail", () => {
    const emailId = "email-uuid-123";
    const userId = "user-uuid-456";

    it("returns null when the email is not found", async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.updateEmail(userId, emailId, {
        isRead: true,
      });

      expect(result).toBeNull();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it("merges updates onto the existing entity and calls save()", async () => {
      const existing = {
        id: emailId,
        userId,
        isRead: false,
        attachments: null,
      } as Email;
      const savedEntity = { ...existing, isRead: true } as Email;
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue(savedEntity);

      const result = await service.updateEmail(userId, emailId, {
        isRead: true,
      });

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: emailId, userId },
      });
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: emailId, isRead: true }),
      );
      expect(result).toBe(savedEntity);
    });

    it("uses save() (not repository.update()) so column transformers are applied to encrypted JSON fields like attachments", async () => {
      /*
       * repository.update() bypasses TypeORM column transformers — encrypted-JSON
       * fields (attachments, labels, actionItemsJson) get serialised as PostgreSQL
       * array literals rather than encrypted strings and become unreadable on
       * read-back. save() always applies transformer.to() before persisting.
       */
      const attachment = {
        attachmentId: "att-id",
        filename: "file.pdf",
        mimeType: "application/pdf",
        size: 1024,
      };
      const existing = {
        id: emailId,
        userId,
        attachments: null,
      } as Email;
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue({
        ...existing,
        attachments: [attachment],
      } as Email);

      await service.updateEmail(userId, emailId, { attachments: [attachment] });

      // Must use save(), never repository.update()
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(mockRepo.update).not.toHaveBeenCalled();

      // The entity passed to save() must have the new attachments merged in
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ attachments: [attachment] }),
      );
    });

    it("strips immutable fields (id, userId, receivedAt) from the updates before saving", async () => {
      const existing = {
        id: emailId,
        userId,
        isRead: false,
        receivedAt: new Date("2024-01-01"),
      } as Email;
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue(existing);

      const differentUserId = "attacker-uuid";
      await service.updateEmail(userId, emailId, {
        isRead: true,
        id: "different-id",
        userId: differentUserId,
        receivedAt: new Date("2099-01-01"),
      } as Partial<Email>);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: emailId,
          userId,
          isRead: true,
        }),
      );
      // Immutable fields must not be overwritten
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.not.objectContaining({ userId: differentUserId }),
      );
    });

    it("only fetches the email belonging to the given userId (prevents IDOR)", async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.updateEmail("other-user-id", emailId, {
        isRead: true,
      });

      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: emailId, userId: "other-user-id" },
      });
      expect(result).toBeNull();
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
});
