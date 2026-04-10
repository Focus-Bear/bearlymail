import { Test, TestingModule } from "@nestjs/testing";

import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { UsersService } from "../users/users.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailDebugController } from "./email-debug.controller";
import { EmailsService } from "./emails.service";
import { GmailSyncService } from "./providers/gmail-sync.service";

describe("EmailDebugController", () => {
  let controller: EmailDebugController;

  const mockEmailsService = {
    fixStuckCalculatingThreads: jest.fn(),
    fixStaleUnsyncedThreads: jest.fn(),
    lookupByGmailUrl: jest.fn(),
    lookupByMessageId: jest.fn(),
    lookupThread: jest.fn(),
    getCategoryDebugData: jest.fn(),
  };

  const mockEmailAdminService = {};

  const mockBoss = {
    send: jest.fn(),
    getQueueSize: jest.fn(),
    db: {
      executeSql: jest.fn().mockResolvedValue({ rowCount: 0 }),
    },
  };

  const mockGoogleAccountsService = {
    hasConnectedGmail: jest.fn().mockResolvedValue(true),
  };

  const mockUsersService = {
    findOne: jest.fn().mockResolvedValue({ isAdmin: true }),
    findOneWithTokens: jest.fn().mockResolvedValue(null),
  };

  const mockGmailSyncService = {
    refreshAttachmentsFromGmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailDebugController],
      providers: [
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: EmailAdminService,
          useValue: mockEmailAdminService,
        },
        {
          provide: "PG_BOSS",
          useValue: mockBoss,
        },
        {
          provide: GoogleAccountsService,
          useValue: mockGoogleAccountsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: GmailSyncService,
          useValue: mockGmailSyncService,
        },
      ],
    }).compile();

    controller = module.get<EmailDebugController>(EmailDebugController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

});
