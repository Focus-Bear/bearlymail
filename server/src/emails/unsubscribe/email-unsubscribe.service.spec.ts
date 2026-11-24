import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";

import { BlockedSendersService } from "../../blocked-senders/blocked-senders.service";
import { EMAIL_PROVIDER_TYPES } from "../../constants/domain-types";
import {
  UNSUBSCRIBE,
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_OUTCOMES,
  UNSUBSCRIBE_SOURCES,
} from "../../constants/unsubscribe.constants";
import { Email } from "../../database/entities/email.entity";
import { EmailArchiveService } from "../email-archive.service";
import { EmailProviderManager } from "../email-provider-manager.service";
import { EmailUnsubscribeService } from "./email-unsubscribe.service";
import { UnsubscribeOptions } from "./list-unsubscribe.parser";
import * as oneClickClient from "./one-click-unsubscribe.client";

const USER_ID = "user-1";
const EMAIL_ID = "11111111-1111-4111-8111-111111111111";
const HTTPS_URL = "https://hs.example.test/unsub?token=abc";
const MAILTO_ADDRESS = "unsub@lists.example.test";

const ONE_CLICK_OPTIONS: UnsubscribeOptions = {
  httpsUrl: HTTPS_URL,
  mailto: { address: MAILTO_ADDRESS, subject: "unsubscribe" },
  oneClick: true,
  source: UNSUBSCRIBE_SOURCES.HEADER,
};

function buildEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: EMAIL_ID,
    userId: USER_ID,
    emailThreadId: "thread-1",
    from: "b@useparagon.com",
    fromName: "Brandon from Paragon",
    senderEmailHmac: "hmac-paragon",
    googleAccountId: "google-1",
    office365AccountId: null,
    zohoAccountId: null,
    unsubscribeOptions: ONE_CLICK_OPTIONS,
    ...overrides,
  } as Email;
}

describe("EmailUnsubscribeService", () => {
  let emailRepository: { findOne: jest.Mock; query: jest.Mock };
  let provider: { sendEmail: jest.Mock };
  let providerManager: {
    getProvider: jest.Mock;
    getPrimaryProvider: jest.Mock;
  };
  let archiveService: { bulkArchiveEmails: jest.Mock };
  let blockedSenders: { blockSender: jest.Mock };
  let postSpy: jest.SpyInstance;
  let service: EmailUnsubscribeService;

  const useEmail = (email: Email | null) =>
    emailRepository.findOne.mockResolvedValue(email);

  beforeEach(() => {
    emailRepository = {
      findOne: jest.fn(),
      query: jest.fn().mockResolvedValue([{ id: "sib-1" }, { id: "sib-2" }]),
    };
    provider = { sendEmail: jest.fn().mockResolvedValue({}) };
    providerManager = {
      getProvider: jest.fn().mockResolvedValue(provider),
      getPrimaryProvider: jest.fn().mockResolvedValue(provider),
    };
    archiveService = {
      bulkArchiveEmails: jest.fn().mockResolvedValue(undefined),
    };
    blockedSenders = { blockSender: jest.fn().mockResolvedValue({}) };
    postSpy = jest
      .spyOn(oneClickClient, "postOneClickUnsubscribe")
      .mockResolvedValue(undefined);
    service = new EmailUnsubscribeService(
      emailRepository as unknown as Repository<Email>,
      providerManager as unknown as EmailProviderManager,
      archiveService as unknown as EmailArchiveService,
      blockedSenders as unknown as BlockedSendersService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it("one-click: POSTs server-side and reports the sender's other Triage threads", async () => {
    useEmail(buildEmail());

    const result = await service.unsubscribe(
      USER_ID,
      EMAIL_ID,
      UNSUBSCRIBE_METHODS.ONE_CLICK,
    );

    expect(postSpy).toHaveBeenCalledWith(HTTPS_URL);
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED,
      method: UNSUBSCRIBE_METHODS.ONE_CLICK,
      siblingCount: 2,
    });
    expect(emailRepository.query.mock.calls[0][1]).toEqual([
      USER_ID,
      "hmac-paragon",
      "thread-1",
      UNSUBSCRIBE.MAX_SIBLING_EMAILS,
    ]);
  });

  it("refuses to act when the confirmed method isn't the one that would run", async () => {
    useEmail(buildEmail());
    await expect(
      service.unsubscribe(USER_ID, EMAIL_ID, UNSUBSCRIBE_METHODS.MAILTO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(postSpy).not.toHaveBeenCalled();
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("falls back to opening the page when the one-click endpoint fails", async () => {
    useEmail(buildEmail());
    postSpy.mockRejectedValue(new Error("timeout"));

    const result = await service.unsubscribe(
      USER_ID,
      EMAIL_ID,
      UNSUBSCRIBE_METHODS.ONE_CLICK,
    );

    expect(result).toMatchObject({
      outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK,
      method: UNSUBSCRIBE_METHODS.LINK,
      url: HTTPS_URL,
    });
  });

  it("does not fall back when the SSRF guard refuses the URL", async () => {
    useEmail(buildEmail());
    postSpy.mockRejectedValue(
      new oneClickClient.UnsafeUnsubscribeUrlError("private address"),
    );
    await expect(
      service.unsubscribe(USER_ID, EMAIL_ID, UNSUBSCRIBE_METHODS.ONE_CLICK),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("mailto: sends from the account the newsletter arrived in", async () => {
    useEmail(
      buildEmail({
        unsubscribeOptions: { ...ONE_CLICK_OPTIONS, oneClick: false },
      }),
    );

    const result = await service.unsubscribe(
      USER_ID,
      EMAIL_ID,
      UNSUBSCRIBE_METHODS.MAILTO,
    );

    expect(providerManager.getProvider).toHaveBeenCalledWith(
      USER_ID,
      EMAIL_PROVIDER_TYPES.GMAIL,
    );
    expect(provider.sendEmail).toHaveBeenCalledWith(USER_ID, {
      to: [{ email: MAILTO_ADDRESS }],
      subject: "unsubscribe",
      body: UNSUBSCRIBE.MAILTO_DEFAULT_BODY,
    });
    expect(postSpy).not.toHaveBeenCalled();
    expect(result.outcome).toBe(UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED);
  });

  it("link: hands the https page back for the client to open", async () => {
    useEmail(
      buildEmail({
        unsubscribeOptions: {
          httpsUrl: HTTPS_URL,
          oneClick: false,
          source: UNSUBSCRIBE_SOURCES.BODY,
        },
      }),
    );

    const result = await service.unsubscribe(
      USER_ID,
      EMAIL_ID,
      UNSUBSCRIBE_METHODS.LINK,
    );

    expect(result).toMatchObject({
      outcome: UNSUBSCRIBE_OUTCOMES.OPEN_LINK,
      url: HTTPS_URL,
    });
    expect(postSpy).not.toHaveBeenCalled();
    expect(provider.sendEmail).not.toHaveBeenCalled();
  });

  it("404s for an email with no way to unsubscribe, or someone else's email", async () => {
    useEmail(buildEmail({ unsubscribeOptions: null }));
    await expect(
      service.unsubscribe(USER_ID, EMAIL_ID, UNSUBSCRIBE_METHODS.LINK),
    ).rejects.toBeInstanceOf(NotFoundException);

    useEmail(null);
    await expect(
      service.unsubscribe(USER_ID, EMAIL_ID, UNSUBSCRIBE_METHODS.LINK),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(emailRepository.findOne).toHaveBeenLastCalledWith({
      where: { id: EMAIL_ID, userId: USER_ID },
    });
  });

  it("archive-sender: records the sender as unsubscribed and archives the siblings", async () => {
    useEmail(buildEmail());

    const result = await service.archiveSender(USER_ID, EMAIL_ID);

    expect(blockedSenders.blockSender).toHaveBeenCalledWith(
      USER_ID,
      "b@useparagon.com",
      "Brandon from Paragon",
      UNSUBSCRIBE.BLOCKED_SENDER_REASON,
    );
    expect(archiveService.bulkArchiveEmails).toHaveBeenCalledWith(USER_ID, [
      "sib-1",
      "sib-2",
    ]);
    expect(result).toEqual({ archivedCount: 2 });
  });

  it("archive-sender: leaves this email's own thread out by default", async () => {
    useEmail(buildEmail());

    await service.archiveSender(USER_ID, EMAIL_ID);

    expect(emailRepository.query.mock.calls[0][1][2]).toBe("thread-1");
  });

  it("archive-sender: includes this email's own thread when asked (Settings → Subscriptions)", async () => {
    useEmail(buildEmail());

    await service.archiveSender(USER_ID, EMAIL_ID, { includeThisThread: true });

    expect(emailRepository.query.mock.calls[0][1]).toEqual([
      USER_ID,
      "hmac-paragon",
      null,
      UNSUBSCRIBE.MAX_SIBLING_EMAILS,
    ]);
  });
});
