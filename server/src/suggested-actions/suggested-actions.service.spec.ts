import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { ActionItemsService } from "../action-items/action-items.service";
import { CalendarService } from "../calendar/calendar.service";
import { ActionItem } from "../database/entities/action-item.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import { GitHubService } from "../github/github.service";
import { GitHubApiService } from "../github/github-api.service";
import { GitHubRepoMappingService } from "../github/github-repo-mapping.service";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { SuggestedActionsService } from "./suggested-actions.service";

describe("SuggestedActionsService", () => {
  let service: SuggestedActionsService;
  let emailsService: EmailsService;
  let usersService: UsersService;
  let llmService: LLMService;

  const mockEmailsService = {
    getEmailById: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  const mockLLMService = {
    detectSuggestedActions: jest.fn(),
  };

  const mockGitHubService = {
    parseGitHubLinks: jest.fn(),
  };

  const mockGitHubApiService = {};

  const mockCalendarService = {};

  const mockActionItemsService = {
    findByEmailId: jest.fn(),
    createFromEmail: jest.fn(),
  };

  const mockEmailRepository = {};

  const mockRepoMappingService = {
    getRepoForEmail: jest.fn(),
    findAllForUser: jest.fn(),
    autoDiscoverRepo: jest.fn(),
  };

  const mockActionItemRepository = {
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
  };

  const mockUserContextRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestedActionsService,
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: GitHubService,
          useValue: mockGitHubService,
        },
        {
          provide: GitHubApiService,
          useValue: mockGitHubApiService,
        },
        {
          provide: CalendarService,
          useValue: mockCalendarService,
        },
        {
          provide: ActionItemsService,
          useValue: mockActionItemsService,
        },
        {
          provide: GitHubRepoMappingService,
          useValue: mockRepoMappingService,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
        {
          provide: getRepositoryToken(ActionItem),
          useValue: mockActionItemRepository,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: getRepositoryToken(UserContext),
          useValue: mockUserContextRepository,
        },
      ],
    }).compile();

    service = module.get<SuggestedActionsService>(SuggestedActionsService);
    emailsService = module.get<EmailsService>(EmailsService);
    usersService = module.get<UsersService>(UsersService);
    llmService = module.get<LLMService>(LLMService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("detectActions", () => {
    it("should detect actions for email", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockEmail = {
        id: emailId,
        subject: "Test Email",
        body: "Test body",
        from: "test@example.com",
        fromName: "Test User",
      };
      const mockUser = {
        id: userId,
        githubToken: "token-123",
        googleCalendarAccessToken: "calendar-token",
      };
      const mockActions = [
        {
          type: "reply",
          confidence: 0.9,
          reason: "Needs response",
        },
      ];

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockGitHubService.parseGitHubLinks.mockReturnValue([]);
      mockLLMService.detectSuggestedActions.mockResolvedValue(mockActions);

      const result = await service.detectActions(emailId, userId);

      expect(result).toEqual(mockActions);
      expect(emailsService.getEmailById).toHaveBeenCalledWith(userId, emailId);
      expect(usersService.findOne).toHaveBeenCalledWith(userId);
      expect(llmService.detectSuggestedActions).toHaveBeenCalled();
    });

    it("should return empty array when email not found", async () => {
      const userId = "user-123";
      const emailId = "email-123";

      mockEmailsService.getEmailById.mockResolvedValue(null);

      const result = await service.detectActions(emailId, userId);

      expect(result).toEqual([]);
    });

    it("should enhance GitHub actions with metadata", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockEmail = {
        id: emailId,
        subject: "GitHub Issue",
        body: "Check https://github.com/owner/repo/issues/123",
        from: "test@example.com",
      };
      const mockUser = {
        id: userId,
        githubToken: "token-123",
      };
      const mockGitHubLinks = [
        {
          type: "issue",
          owner: "owner",
          repo: "repo",
          number: 123,
        },
      ];
      const mockActions = [
        {
          type: "github_update_status",
          confidence: 0.8,
          reason: "Update issue status",
        },
      ];

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockGitHubService.parseGitHubLinks.mockReturnValue(mockGitHubLinks);
      mockLLMService.detectSuggestedActions.mockResolvedValue(mockActions);

      const result = await service.detectActions(emailId, userId);

      expect(result[0].metadata).toBeDefined();
      expect(result[0].metadata?.issueInfo).toEqual({
        owner: "owner",
        repo: "repo",
        number: 123,
      });
    });

    it("should pass GitHub link info to LLM", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockEmail = {
        id: emailId,
        subject: "Test",
        body: "Test body",
        from: "test@example.com",
      };
      const mockUser = {
        id: userId,
        githubToken: "token-123",
      };
      const mockGitHubLinks = [
        {
          type: "issue",
          owner: "owner",
          repo: "repo",
          number: 123,
        },
      ];

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockGitHubService.parseGitHubLinks.mockReturnValue(mockGitHubLinks);
      mockLLMService.detectSuggestedActions.mockResolvedValue([]);

      await service.detectActions(emailId, userId);

      expect(mockLLMService.detectSuggestedActions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          hasGithubLinks: true,
          githubLinks: [
            {
              type: "issue",
              owner: "owner",
              repo: "repo",
              number: 123,
            },
          ],
        }),
        undefined,
        userId,
      );
    });

    it("should pass calendar token status to LLM", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockEmail = {
        id: emailId,
        subject: "Test",
        body: "Test body",
        from: "test@example.com",
      };
      const mockUser = {
        id: userId,
        googleCalendarAccessToken: "calendar-token",
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockGitHubService.parseGitHubLinks.mockReturnValue([]);
      mockLLMService.detectSuggestedActions.mockResolvedValue([]);

      await service.detectActions(emailId, userId);

      expect(mockLLMService.detectSuggestedActions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          hasCalendarToken: true,
        }),
        undefined,
        userId,
      );
    });

    it("should handle errors gracefully and return empty array", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const error = new Error("Detection failed");

      mockEmailsService.getEmailById.mockRejectedValue(error);

      const result = await service.detectActions(emailId, userId);

      expect(result).toEqual([]);
    });

    it("should handle missing user tokens", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockEmail = {
        id: emailId,
        subject: "Test",
        body: "Test body",
        from: "test@example.com",
      };
      const mockUser = {
        id: userId,
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockGitHubService.parseGitHubLinks.mockReturnValue([]);
      mockLLMService.detectSuggestedActions.mockResolvedValue([]);

      await service.detectActions(emailId, userId);

      expect(mockLLMService.detectSuggestedActions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          hasGithubToken: false,
          hasCalendarToken: false,
        }),
        undefined,
        userId,
      );
    });

    it("should handle null user", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockEmail = {
        id: emailId,
        subject: "Test",
        body: "Test body",
        from: "test@example.com",
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockUsersService.findOne.mockResolvedValue(null);
      mockGitHubService.parseGitHubLinks.mockReturnValue([]);
      mockLLMService.detectSuggestedActions.mockResolvedValue([]);

      await service.detectActions(emailId, userId);

      expect(mockLLMService.detectSuggestedActions).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          hasGithubToken: false,
          hasCalendarToken: false,
        }),
        undefined,
        userId,
      );
    });
  });
});
