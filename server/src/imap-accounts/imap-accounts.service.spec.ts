import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { ImapFlow } from "imapflow";
import type { PgBoss } from "pg-boss";
import type { Repository } from "typeorm";

import { JOB_NAMES } from "../constants/job-names";
import type { ImapAccount } from "../database/entities/imap-account.entity";
import type { ImapAccountSettingsDto } from "./dto/imap-account-settings.dto";
import { ImapAccountsService } from "./imap-accounts.service";
import { withImapSession } from "./imap-session";
import { verifySmtpSettings } from "./smtp-sender";

jest.mock("./imap-session", () => ({
  ...jest.requireActual("./imap-session"),
  withImapSession: jest.fn(),
}));
jest.mock("./smtp-sender", () => ({ verifySmtpSettings: jest.fn() }));
jest.mock("dns/promises", () => ({
  ...jest.requireActual("dns/promises"),
  resolveMx: jest.fn().mockResolvedValue([]),
}));

const mockSession = withImapSession as jest.Mock;
const mockVerifySmtp = verifySmtpSettings as jest.Mock;

const DTO: ImapAccountSettingsDto = {
  email: "Friend@Crazy.test",
  password: "correct-horse",
  imapHost: "mail.crazy.test",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "mail.crazy.test",
  smtpPort: 465,
  smtpSecure: true,
};

function fakeClient(paths: string[]) {
  return {
    list: jest.fn().mockResolvedValue(
      paths.map((path) => ({
        path,
        name: path.split(".").pop(),
        delimiter: ".",
        specialUse: path.endsWith("Sent") ? "\\Sent" : undefined,
      })),
    ),
    mailboxCreate: jest.fn().mockResolvedValue(undefined),
  };
}

describe("ImapAccountsService", () => {
  let repository: jest.Mocked<Repository<ImapAccount>>;
  let boss: { send: jest.Mock };
  let client: ReturnType<typeof fakeClient>;

  function buildService(selfHosted = "false") {
    const config = { get: jest.fn().mockReturnValue(selfHosted) };
    return new ImapAccountsService(
      repository,
      boss as unknown as PgBoss,
      config as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    repository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ ...data }) as ImapAccount),
      save: jest.fn(
        async (account) => ({ id: "acc-1", ...account }) as ImapAccount,
      ),
      count: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<ImapAccount>>;
    boss = { send: jest.fn().mockResolvedValue("job") };
    client = fakeClient(["INBOX", "INBOX.Sent", "INBOX.Trash"]);
    mockSession.mockImplementation(async (_settings, _options, work) =>
      work(client as unknown as ImapFlow),
    );
    mockVerifySmtp.mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it("only allows private mail hosts on self-hosted deployments", () => {
    expect(buildService().sessionOptions.allowPrivateHosts).toBe(false);
    expect(buildService("true").sessionOptions.allowPrivateHosts).toBe(true);
  });

  it("tests a connection without creating folders", async () => {
    const result = await buildService().testConnection(DTO);
    expect(result).toEqual({
      ok: true,
      servers: {
        imapHost: "mail.crazy.test",
        imapPort: 993,
        imapSecure: true,
        smtpHost: "mail.crazy.test",
        smtpPort: 465,
        smtpSecure: true,
      },
      mailboxes: { archive: null, sent: "INBOX.Sent", trash: "INBOX.Trash" },
    });
    expect(client.mailboxCreate).not.toHaveBeenCalled();
    expect(mockSession.mock.calls[0][0]).toMatchObject({
      username: "Friend@Crazy.test",
    });
  });

  it("reports which protocol failed and why", async () => {
    mockVerifySmtp.mockRejectedValue(
      Object.assign(new Error("535"), { code: "EAUTH" }),
    );
    await expect(buildService().testConnection(DTO)).resolves.toEqual({
      ok: false,
      failure: { protocol: "smtp", code: "auth_failed", detail: "535" },
    });
  });

  it("connects: creates Archive, stores settings, makes the first account primary and syncs", async () => {
    const summary = await buildService().connect("user-1", DTO);

    expect(client.mailboxCreate).toHaveBeenCalledWith("INBOX.Archive");
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "friend@crazy.test",
        username: "Friend@Crazy.test",
        password: "correct-horse",
        archiveMailbox: "INBOX.Archive",
        sentMailbox: "INBOX.Sent",
        trashMailbox: "INBOX.Trash",
        isPrimary: true,
        needsRelogin: false,
      }),
    );
    expect(summary).not.toHaveProperty("password");
    expect(summary).not.toHaveProperty("username");
    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.FETCH_USER_EMAILS,
      { userId: "user-1" },
      expect.objectContaining({ singletonKey: "fetch-user-emails-user-1" }),
    );
  });

  it("doesn't append to Sent for servers that file sent mail themselves", async () => {
    await buildService().connect("user-1", {
      ...DTO,
      smtpHost: "smtp.fastmail.com",
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ sentMailbox: null }),
    );
  });

  it("updates an existing account in place on reconnect (e.g. a new password)", async () => {
    repository.find.mockResolvedValue([
      {
        id: "acc-1",
        email: "friend@crazy.test",
        isPrimary: true,
        name: "Friend",
      } as ImapAccount,
    ]);
    await buildService().connect("user-1", { ...DTO, password: "new-pass" });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "acc-1",
        password: "new-pass",
        name: "Friend",
      }),
    );
  });

  it("refuses to store settings that don't work", async () => {
    mockSession.mockRejectedValue(
      Object.assign(new Error("no"), { authenticationFailed: true }),
    );
    await expect(buildService().connect("user-1", DTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("finds the servers itself when only an email and password are given", async () => {
    mockSession.mockImplementation(async (settings, _options, work) => {
      if (settings.host !== "mail.crazy.test" || settings.port !== 993) {
        throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      }
      return work(client as unknown as ImapFlow);
    });
    const summary = await buildService().connect("user-1", {
      email: "friend@crazy.test",
      password: "correct-horse",
    });

    expect(summary.imapHost).toBe("mail.crazy.test");
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imapHost: "mail.crazy.test",
        imapPort: 993,
        smtpHost: "mail.crazy.test",
        smtpPort: 465,
        archiveMailbox: "INBOX.Archive",
      }),
    );
    // Discovery probes fail fast so a dead candidate can't stall the form.
    expect(mockSession.mock.calls[0][1]).toMatchObject({
      timeoutMs: expect.any(Number),
    });
  });
});
