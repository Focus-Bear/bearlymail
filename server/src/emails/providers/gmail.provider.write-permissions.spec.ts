import { Logger } from "@nestjs/common";

import {
  GOOGLE_PERMISSION_REQUIRED_CODE,
  GooglePermissionRequiredException,
} from "../../auth/exceptions/google-permission-required.exception";
import {
  GOOGLE_PERMISSION_GROUP,
  GOOGLE_SIGN_IN_SCOPES,
  scopesForGooglePermissionGroup,
} from "../../constants/google-oauth-scopes";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { GmailProvider } from "./gmail.provider";
import { GmailSyncService } from "./gmail-sync.service";

const mockGmail = {
  users: {
    threads: {
      get: jest.fn().mockResolvedValue({ data: { messages: [] } }),
      modify: jest.fn().mockResolvedValue({ data: { messages: [] } }),
    },
    messages: {
      modify: jest.fn().mockResolvedValue({ data: {} }),
      trash: jest.fn().mockResolvedValue({ data: {} }),
      send: jest
        .fn()
        .mockResolvedValue({ data: { id: "msg-1", threadId: "thread-1" } }),
    },
    labels: {
      list: jest.fn().mockResolvedValue({
        data: { labels: [{ id: "Label_1", name: "SnoozedBearlyMail" }] },
      }),
      create: jest.fn(),
    },
  },
};

jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({ setCredentials: jest.fn(), on: jest.fn() })),
    },
    gmail: jest.fn(() => mockGmail),
  },
  gmail_v1: {},
}));

const USER_ID = "user-1";
const THREAD_ID = "thread-1";
const READONLY_GRANT = GOOGLE_SIGN_IN_SCOPES.join(" ");
const MANAGE_GRANT = [
  ...GOOGLE_SIGN_IN_SCOPES,
  ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.GMAIL_MANAGE),
].join(" ");
const SEND_ONLY_GRANT = [
  ...GOOGLE_SIGN_IN_SCOPES,
  ...scopesForGooglePermissionGroup(GOOGLE_PERMISSION_GROUP.GMAIL_SEND),
].join(" ");

function buildProvider(googleGrantedScopes: string | null) {
  const usersService = {
    findOneWithTokens: jest.fn().mockResolvedValue({
      id: USER_ID,
      googleCalendarAccessToken: "access",
      googleCalendarRefreshToken: "refresh",
      googleGrantedScopes,
    }),
    recordSkippedGmailWrite: jest.fn().mockResolvedValue(undefined),
    markNeedsRelogin: jest.fn(),
  } as unknown as jest.Mocked<UsersService>;
  const provider = new GmailProvider(
    usersService,
    {} as EmailsService,
    {} as GmailSyncService,
  );
  return { provider, usersService };
}

type WriteCall = (provider: GmailProvider) => Promise<unknown>;

const BACKGROUND_WRITES: Array<[string, WriteCall]> = [
  ["archive", (gmail) => gmail.archiveThread(USER_ID, THREAD_ID)],
  ["unarchive", (gmail) => gmail.unarchiveThread(USER_ID, THREAD_ID)],
  ["trash", (gmail) => gmail.trashThread(USER_ID, THREAD_ID)],
  ["star sync", (gmail) => gmail.syncStarStatusToGmail(USER_ID, THREAD_ID, 0)],
  [
    "read-status sync",
    (gmail) => gmail.syncReadStatusToGmail(USER_ID, "msg-1", true),
  ],
  ["snooze", (gmail) => gmail.snoozeThread(USER_ID, THREAD_ID, new Date())],
  ["snooze return", (gmail) => gmail.unsnoozeThread(USER_ID, THREAD_ID)],
  [
    "blocked-sender label",
    (gmail) => gmail.addLabelToThread(USER_ID, THREAD_ID, "SnoozedBearlyMail"),
  ],
];

function gmailWriteCallCount(): number {
  return (
    mockGmail.users.threads.modify.mock.calls.length +
    mockGmail.users.messages.modify.mock.calls.length +
    mockGmail.users.messages.trash.mock.calls.length +
    mockGmail.users.labels.create.mock.calls.length
  );
}

describe("GmailProvider — Gmail writes need gmail.modify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => {});
  });

  it.each(BACKGROUND_WRITES)(
    "%s with a read-only grant skips Gmail quietly and arms the one-time notice",
    async (_name, write) => {
      const { provider, usersService } = buildProvider(READONLY_GRANT);

      await expect(write(provider)).resolves.toBeUndefined();

      expect(mockGmail.users.threads.get).not.toHaveBeenCalled();
      expect(gmailWriteCallCount()).toBe(0);
      expect(usersService.recordSkippedGmailWrite).toHaveBeenCalledWith(
        USER_ID,
      );
      expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
    },
  );

  it.each(BACKGROUND_WRITES)(
    "%s with gmail.modify writes to Gmail",
    async (_name, write) => {
      const { provider, usersService } = buildProvider(MANAGE_GRANT);

      await write(provider);

      expect(
        gmailWriteCallCount() + mockGmail.users.threads.get.mock.calls.length,
      ).toBeGreaterThan(0);
      expect(usersService.recordSkippedGmailWrite).not.toHaveBeenCalled();
    },
  );

  it("treats an existing user with an unrecorded grant as able to write", async () => {
    const { provider, usersService } = buildProvider(null);

    await provider.archiveThread(USER_ID, THREAD_ID);

    expect(mockGmail.users.threads.modify).toHaveBeenCalled();
    expect(usersService.recordSkippedGmailWrite).not.toHaveBeenCalled();
  });

  it("does not let gmail.send stand in for gmail.modify", async () => {
    const { provider } = buildProvider(SEND_ONLY_GRANT);

    await provider.archiveThread(USER_ID, THREAD_ID);

    expect(gmailWriteCallCount()).toBe(0);
  });
});

describe("GmailProvider — sending needs gmail.send", () => {
  const SEND_CALLS: Array<[string, WriteCall]> = [
    [
      "reply",
      (gmail) =>
        gmail.sendReply(USER_ID, {
          threadId: THREAD_ID,
          to: "a@example.com",
          subject: "Re: hi",
          body: "hello",
        }),
    ],
    [
      "new email",
      (gmail) =>
        gmail.sendEmail(USER_ID, {
          to: [{ email: "a@example.com" }],
          subject: "hi",
          body: "hello",
        }),
    ],
  ];

  beforeEach(() => jest.clearAllMocks());

  it.each(SEND_CALLS)(
    "%s with a read-only grant fails with a structured 403 instead of dropping the message",
    async (_name, send) => {
      const { provider, usersService } = buildProvider(READONLY_GRANT);

      const error = await send(provider).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(GooglePermissionRequiredException);
      expect(
        (error as GooglePermissionRequiredException).getResponse(),
      ).toEqual(
        expect.objectContaining({
          code: GOOGLE_PERMISSION_REQUIRED_CODE,
          permission: GOOGLE_PERMISSION_GROUP.GMAIL_SEND,
        }),
      );
      expect(mockGmail.users.messages.send).not.toHaveBeenCalled();
      expect(usersService.markNeedsRelogin).not.toHaveBeenCalled();
    },
  );

  it.each(SEND_CALLS)(
    "%s is allowed by gmail.modify alone (Google lets it send)",
    async (_name, send) => {
      const { provider } = buildProvider(MANAGE_GRANT);

      await send(provider);

      expect(mockGmail.users.messages.send).toHaveBeenCalled();
    },
  );

  it.each(SEND_CALLS)("%s works with gmail.send", async (_name, send) => {
    const { provider } = buildProvider(SEND_ONLY_GRANT);

    await send(provider);

    expect(mockGmail.users.messages.send).toHaveBeenCalled();
  });
});
