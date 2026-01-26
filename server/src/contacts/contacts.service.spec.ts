import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ContactsService } from "./contacts.service";
import { Contact } from "../database/entities/contact.entity";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { SearchIndexHelper } from "./search-index.helper";

describe("ContactsService", () => {
  let service: ContactsService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: getRepositoryToken(Contact),
          useValue: mockRepository,
        },
        {
          provide: GmailContactsProvider,
          useValue: mockGmailContactsProvider,
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
        name: "Local Contact",
        contactFrequency: 10,
        isFavorite: false,
      };
      const gmailContact = {
        providerId: "gmail-1",
        email: "gmail@example.com",
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
      expect(result.some((r) => r.email === "local@example.com")).toBe(true);
      expect(result.some((r) => r.email === "gmail@example.com")).toBe(true);
    });

    it("should respect limit parameter", async () => {
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

      await service.searchContacts(userId, query, 5);

      expect(queryBuilder.take).toHaveBeenCalledWith(5);
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
