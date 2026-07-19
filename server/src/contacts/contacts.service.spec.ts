import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { ContactCrmService } from "./contact-crm.service";
import { ContactsService } from "./contacts.service";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { SearchIndexHelper } from "./search-index.helper";

describe("ContactsService", () => {
  let service: ContactsService;

  // Shared email query-builder stub — individual tests can override getMany.
  const mockEmailQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    // Update query-builder chain (used by upsertContacts backfill)
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const mockEmailRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(mockEmailQueryBuilder),
  };

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
    findOneOrFail: jest.fn(),
  };

  const mockGmailContactsProvider = {
    isConnected: jest.fn(),
    fetchAllContacts: jest.fn(),
    searchContacts: jest.fn(),
  };

  const mockContactCrmService = {
    getContactNotes: jest.fn().mockResolvedValue([]),
    getContactCustomFields: jest.fn().mockResolvedValue([]),
    addContactNote: jest.fn(),
    updateContactNote: jest.fn(),
    deleteContactNote: jest.fn(),
    getContactTypes: jest.fn().mockResolvedValue([]),
    ensureDefaultContactTypes: jest.fn().mockResolvedValue([]),
    createContactType: jest.fn(),
    updateContactType: jest.fn(),
    deleteContactType: jest.fn(),
    getCustomFieldDefinitions: jest.fn().mockResolvedValue([]),
    createCustomField: jest.fn(),
    updateCustomField: jest.fn(),
    deleteCustomField: jest.fn(),
    setCustomFieldValue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: getRepositoryToken(Contact),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: GmailContactsProvider,
          useValue: mockGmailContactsProvider,
        },
        {
          provide: ContactCrmService,
          useValue: mockContactCrmService,
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset email query builder so each test starts clean.
    mockEmailQueryBuilder.select.mockReturnThis();
    mockEmailQueryBuilder.where.mockReturnThis();
    mockEmailQueryBuilder.andWhere.mockReturnThis();
    mockEmailQueryBuilder.orderBy.mockReturnThis();
    mockEmailQueryBuilder.limit.mockReturnThis();
    mockEmailQueryBuilder.take.mockReturnThis();
    mockEmailQueryBuilder.getMany.mockResolvedValue([]);
    mockEmailQueryBuilder.update.mockReturnThis();
    mockEmailQueryBuilder.set.mockReturnThis();
    mockEmailQueryBuilder.execute.mockResolvedValue({ affected: 0 });
    mockEmailRepository.createQueryBuilder.mockReturnValue(
      mockEmailQueryBuilder,
    );
  });

  describe("syncContacts", () => {
    it("should sync contacts from Gmail when connected", async () => {
      const userId = "user-123";
      const rawContacts = [
        {
          providerId: "contact-1",
          email: "test@example.com",
          name: "Test User",
        },
      ];

      mockGmailContactsProvider.isConnected.mockResolvedValue(true);
      mockGmailContactsProvider.fetchAllContacts.mockResolvedValue(rawContacts);
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue({ id: "contact-1" });

      const result = await service.syncContacts(userId);

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("gmail");
      expect(result[0].synced).toBeGreaterThan(0);
      expect(mockGmailContactsProvider.fetchAllContacts).toHaveBeenCalledWith(
        userId,
      );
    });

    it("should skip Gmail sync when not connected", async () => {
      const userId = "user-123";

      mockGmailContactsProvider.isConnected.mockResolvedValue(false);

      const result = await service.syncContacts(userId);

      expect(result).toHaveLength(0);
      expect(mockGmailContactsProvider.fetchAllContacts).not.toHaveBeenCalled();
    });

    it("should handle Gmail sync errors gracefully", async () => {
      const userId = "user-123";
      const error = new Error("Sync failed");

      mockGmailContactsProvider.isConnected.mockResolvedValue(true);
      mockGmailContactsProvider.fetchAllContacts.mockRejectedValue(error);

      const result = await service.syncContacts(userId);

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe("gmail");
      expect(result[0].synced).toBe(0);
    });
  });

  describe("searchContacts", () => {
    it("should return frequent contacts when query is too short", async () => {
      const userId = "user-123";
      const mockContacts = [
        {
          id: "contact-1",
          email: "test@example.com",
          name: "Test",
          contactFrequency: 10,
          isFavorite: false,
        },
      ];

      mockRepository.find.mockResolvedValue(mockContacts);

      const result = await service.searchContacts(userId, "a", 10);

      expect(result).toBeDefined();
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it("should return frequent contacts when query is empty", async () => {
      const userId = "user-123";
      const mockContacts = [
        {
          id: "contact-1",
          email: "test@example.com",
          name: "Test",
          contactFrequency: 10,
          isFavorite: false,
        },
      ];

      mockRepository.find.mockResolvedValue(mockContacts);

      const result = await service.searchContacts(userId, "", 10);

      expect(result).toBeDefined();
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it("should find exact email match", async () => {
      const userId = "user-123";
      const query = "test@example.com";
      const emailHash = SearchIndexHelper.hashExact(query);
      const mockContact = {
        id: "contact-1",
        email: query,
        name: "Test User",
        emailHash,
      };

      mockRepository.findOne.mockResolvedValue(mockContact);

      const result = await service.searchContacts(userId, query);

      expect(result).toHaveLength(1);
      expect(result[0].email).toBe(query);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId, emailHash },
      });
    });

    it("should search using query tokens when no exact match", async () => {
      const userId = "user-123";
      const query = "test";
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      mockGmailContactsProvider.searchContacts.mockResolvedValue([]);

      const result = await service.searchContacts(userId, query);

      expect(result).toBeDefined();
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith("contact");
      expect(queryBuilder.where).toHaveBeenCalled();
    });

    it("should merge Gmail results with local contacts", async () => {
      const userId = "user-123";
      const query = "test";
      const localContact = {
        id: "contact-1",
        email: "local@example.com",
        name: "Local Test Contact",
        contactFrequency: 10,
        isFavorite: false,
      };
      const gmailContact = {
        providerId: "gmail-1",
        email: "testgmail@example.com",
        name: "Gmail Contact",
      };
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([localContact]),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      mockGmailContactsProvider.searchContacts.mockResolvedValue([
        gmailContact,
      ]);

      const result = await service.searchContacts(userId, query, 20);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(
        result.some((result) => result.email === "local@example.com"),
      ).toBe(true);
      expect(
        result.some((result) => result.email === "testgmail@example.com"),
      ).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const userId = "user-123";
      const query = "test";
      // 30 local contacts whose visible fields all match "test" so the
      // post-filter doesn't drop them and we can verify the final slice.
      const manyContacts = Array.from({ length: 30 }, (_, i) => ({
        id: `contact-${i}`,
        email: `test${i}@example.com`,
        name: `Test User ${i}`,
        contactFrequency: 30 - i,
        isFavorite: false,
      }));
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(manyContacts),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      mockGmailContactsProvider.searchContacts.mockResolvedValue([]);

      const result = await service.searchContacts(userId, query, 5);

      // DB pulls a generous relevance-ranked pool so the visible-field filter
      // and final slice happen in memory (see CONTACTS_SEARCH_CANDIDATE_POOL).
      expect(queryBuilder.take).toHaveBeenCalledWith(200);
      // The user's `limit` is enforced on the merged, filtered results.
      expect(result).toHaveLength(5);
    });

    it("should filter Gmail results to only show contacts matching visible fields", async () => {
      const userId = "user-123";
      const query = "sid";
      const matchingGmailContact = {
        providerId: "gmail-1",
        email: "sid@example.com",
        name: "Sid Smith",
      };
      const nonMatchingGmailContact = {
        providerId: "gmail-2",
        email: "john@example.com",
        name: "John Doe",
      };
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      mockGmailContactsProvider.searchContacts.mockResolvedValue([
        matchingGmailContact,
        nonMatchingGmailContact,
      ]);

      const result = await service.searchContacts(userId, query, 20);

      // Should only include the matching contact
      expect(result.some((result) => result.email === "sid@example.com")).toBe(
        true,
      );
      expect(result.some((result) => result.email === "john@example.com")).toBe(
        false,
      );
    });

    it("should filter local database results to only show contacts matching visible fields", async () => {
      const userId = "user-123";
      const query = "sid";
      const matchingLocalContact = {
        id: "contact-1",
        email: "sidney@example.com",
        name: "Sidney Jones",
        contactFrequency: 5,
        isFavorite: false,
      };
      const nonMatchingLocalContact = {
        id: "contact-2",
        email: "doingdoingdonecoaching@gmail.com",
        name: "Swantje Lorrimer",
        contactFrequency: 3,
        isFavorite: false,
      };
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([matchingLocalContact, nonMatchingLocalContact]),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      mockGmailContactsProvider.searchContacts.mockResolvedValue([]);

      const result = await service.searchContacts(userId, query, 20);

      // Should only include the contact with "sid" in visible fields
      expect(
        result.some((result) => result.email === "sidney@example.com"),
      ).toBe(true);
      expect(
        result.some(
          (result) => result.email === "doingdoingdonecoaching@gmail.com",
        ),
      ).toBe(false);
    });
  });

  describe("getFrequentContacts", () => {
    it("should return frequent contacts ordered by favorite and frequency", async () => {
      const userId = "user-123";
      const mockContacts = [
        {
          id: "contact-1",
          email: "frequent@example.com",
          name: "Frequent",
          contactFrequency: 20,
          isFavorite: true,
        },
        {
          id: "contact-2",
          email: "normal@example.com",
          name: "Normal",
          contactFrequency: 10,
          isFavorite: false,
        },
      ];

      mockRepository.find.mockResolvedValue(mockContacts);

      const result = await service.getFrequentContacts(userId, 10);

      expect(result).toHaveLength(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: {
          isFavorite: "DESC",
          contactFrequency: "DESC",
          lastContactedAt: "DESC",
        },
        take: 10,
      });
    });
  });

  describe("incrementContactFrequency", () => {
    it("should increment frequency for existing contact", async () => {
      const userId = "user-123";
      const email = "test@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);
      const existingContact = {
        id: "contact-1",
        userId,
        emailHash,
        contactFrequency: 5,
      };

      mockRepository.findOne.mockResolvedValue(existingContact);
      mockRepository.query.mockResolvedValue(undefined);

      await service.incrementContactFrequency(userId, email);

      expect(mockRepository.query).toHaveBeenCalled();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId, emailHash },
      });
    });

    it("should create contact if it doesn't exist", async () => {
      const userId = "user-123";
      const email = "new@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.query.mockResolvedValue(undefined);
      mockRepository.save.mockResolvedValue({ id: "contact-1" });

      await service.incrementContactFrequency(userId, email);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          email,
          emailHash,
          provider: "manual",
          contactFrequency: 1,
        }),
      );
    });
  });

  describe("toggleFavorite", () => {
    it("should toggle favorite status from false to true", async () => {
      const userId = "user-123";
      const contactId = "contact-1";
      const contact = {
        id: contactId,
        userId,
        isFavorite: false,
      };

      mockRepository.findOne.mockResolvedValue(contact);
      mockRepository.save.mockResolvedValue({ ...contact, isFavorite: true });

      const result = await service.toggleFavorite(userId, contactId);

      expect(result.isFavorite).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isFavorite: true }),
      );
    });

    it("should toggle favorite status from true to false", async () => {
      const userId = "user-123";
      const contactId = "contact-1";
      const contact = {
        id: contactId,
        userId,
        isFavorite: true,
      };

      mockRepository.findOne.mockResolvedValue(contact);
      mockRepository.save.mockResolvedValue({ ...contact, isFavorite: false });

      const result = await service.toggleFavorite(userId, contactId);

      expect(result.isFavorite).toBe(false);
    });

    it("should throw error when contact not found", async () => {
      const userId = "user-123";
      const contactId = "contact-1";

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.toggleFavorite(userId, contactId)).rejects.toThrow(
        "Contact not found",
      );
    });
  });

  describe("getContactByEmail", () => {
    it("should return contact by email", async () => {
      const userId = "user-123";
      const email = "test@example.com";
      const emailHash = SearchIndexHelper.hashExact(email);
      const mockContact = {
        id: "contact-1",
        userId,
        email,
        emailHash,
      };

      mockRepository.findOne.mockResolvedValue(mockContact);

      const result = await service.getContactByEmail(userId, email);

      expect(result).toEqual(mockContact);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId, emailHash },
      });
    });

    it("should return null when contact not found", async () => {
      const userId = "user-123";
      const email = "nonexistent@example.com";

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getContactByEmail(userId, email);

      expect(result).toBeNull();
    });
  });

  describe("getContactThreads", () => {
    const userId = "user-123";
    const contactId = "contact-abc";
    const contactEmail = "alice@example.com";

    const mockContact = {
      id: contactId,
      userId,
      email: contactEmail,
    };

    const makeEmail = (
      overrides: Partial<{
        id: string;
        emailThreadId: string;
        threadId: string;
        from: string;
        fromName: string | null;
        to: string;
        cc: string;
        subject: string;
        receivedAt: Date;
        isRead: boolean;
      }>,
    ) => ({
      id: "email-1",
      emailThreadId: "thread-1",
      threadId: "gmail-thread-1",
      from: "other@example.com",
      fromName: "Other Person",
      to: "me@example.com",
      cc: "",
      subject: "Hello",
      receivedAt: new Date("2025-01-01T10:00:00Z"),
      isRead: true,
      ...overrides,
    });

    it("throws NotFoundException when contact does not exist", async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getContactThreads(userId, contactId),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns empty array when no emails involve the contact", async () => {
      mockRepository.findOne.mockResolvedValue(mockContact);
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({ from: "nobody@example.com", to: "me@example.com", cc: "" }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result).toEqual([]);
    });

    it("assigns role='from' when contact appears in the from field", async () => {
      mockRepository.findOne.mockResolvedValue(mockContact);
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({ from: contactEmail, to: "me@example.com", cc: "" }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("from");
      expect(result[0].emailThreadId).toBe("thread-1");
    });

    it("assigns role='to' when contact appears in the to field (not from)", async () => {
      mockRepository.findOne.mockResolvedValue(mockContact);
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({ from: "other@example.com", to: contactEmail, cc: "" }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("to");
    });

    it("assigns role='cc' when contact appears only in the cc field", async () => {
      mockRepository.findOne.mockResolvedValue(mockContact);
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({
          from: "other@example.com",
          to: "me@example.com",
          cc: contactEmail,
        }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("cc");
    });

    it("deduplicates threads — only the first (newest) email per emailThreadId is kept", async () => {
      mockRepository.findOne.mockResolvedValue(mockContact);
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({
          id: "email-1",
          emailThreadId: "thread-shared",
          from: contactEmail,
          receivedAt: new Date("2025-02-01T12:00:00Z"),
        }),
        makeEmail({
          id: "email-2",
          emailThreadId: "thread-shared",
          from: contactEmail,
          receivedAt: new Date("2025-01-01T10:00:00Z"),
        }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result).toHaveLength(1);
      expect(result[0].emailThreadId).toBe("thread-shared");
    });

    it("returns multiple threads when the contact appears in different threads", async () => {
      mockRepository.findOne.mockResolvedValue(mockContact);
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({
          id: "email-1",
          emailThreadId: "thread-A",
          from: contactEmail,
        }),
        makeEmail({
          id: "email-2",
          emailThreadId: "thread-B",
          to: contactEmail,
          from: "other@example.com",
        }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result).toHaveLength(2);
      const threadIds = result.map((thread) => thread.emailThreadId).sort();
      expect(threadIds).toEqual(["thread-A", "thread-B"]);
    });

    it("maps email fields to ContactThreadSummary shape correctly", async () => {
      const receivedAt = new Date("2025-03-01T08:00:00Z");
      mockRepository.findOne.mockResolvedValue(mockContact);
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({
          emailThreadId: "thread-xyz",
          threadId: "gmail-thread-xyz",
          from: contactEmail,
          fromName: "Alice",
          subject: "Important meeting",
          receivedAt,
          isRead: false,
        }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result[0]).toMatchObject({
        emailThreadId: "thread-xyz",
        threadId: "gmail-thread-xyz",
        subject: "Important meeting",
        from: contactEmail,
        fromName: "Alice",
        receivedAt,
        isRead: false,
        role: "from",
      });
    });

    it("performs case-insensitive matching against the contact email", async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockContact,
        email: "Alice@Example.COM",
      });
      mockEmailQueryBuilder.getMany.mockResolvedValue([
        makeEmail({ from: "alice@example.com", to: "me@example.com", cc: "" }),
      ]);

      const result = await service.getContactThreads(userId, contactId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("from");
    });
  });

  describe("getAllContacts", () => {
    it("should return all contacts ordered by name", async () => {
      const userId = "user-123";
      const mockContacts = [
        {
          id: "contact-1",
          email: "a@example.com",
          name: "A Contact",
        },
        {
          id: "contact-2",
          email: "b@example.com",
          name: "B Contact",
        },
      ];

      mockRepository.find.mockResolvedValue(mockContacts);

      const result = await service.getAllContacts(userId);

      expect(result).toBeDefined();
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: {
          name: "ASC",
          email: "ASC",
        },
      });
    });
  });
});
