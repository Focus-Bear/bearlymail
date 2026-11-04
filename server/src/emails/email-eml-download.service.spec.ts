import {
  BadRequestException,
  NotFoundException,
  NotImplementedException,
} from "@nestjs/common";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Email } from "../database/entities/email.entity";
import { EmailEmlDownloadService } from "./email-eml-download.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailProvider } from "./interfaces/email-provider.interface";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_EMAIL_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_USER_EMAIL_ID = "44444444-4444-4444-8444-444444444444";
const OWNER_MESSAGE_ID = "18c0ffee00000001";
const RAW_MESSAGE = Buffer.from(
  "Message-ID: <a@example.com>\r\nSubject: Hello\r\n\r\nBody",
);

const STORED_EMAILS: Array<
  Pick<Email, "id" | "userId" | "messageId" | "subject">
> = [
  {
    id: OWNER_EMAIL_ID,
    userId: OWNER_ID,
    messageId: OWNER_MESSAGE_ID,
    subject: "Quarterly report",
  },
  {
    id: OTHER_USER_EMAIL_ID,
    userId: OTHER_USER_ID,
    messageId: "18c0ffee00000002",
    subject: "Someone else's mail",
  },
];

type EmailWhere = { id: string; userId: string };

/**
 * An in-memory repository that applies the `where` clause the service passes,
 * so the ownership rule is exercised against data rather than asserted on a
 * mock's call arguments.
 */
function buildEmailRepository(): Repository<Email> {
  return {
    findOne: jest.fn(async ({ where }: { where: EmailWhere }) => {
      const match = STORED_EMAILS.find(
        (email) => email.id === where.id && email.userId === where.userId,
      );
      return match ? ({ ...match } as Email) : null;
    }),
  } as unknown as Repository<Email>;
}

function buildProviderManager(
  provider: Partial<EmailProvider> | null,
): EmailProviderManager {
  return {
    getPrimaryProvider: jest.fn().mockResolvedValue(provider),
  } as unknown as EmailProviderManager;
}

describe("EmailEmlDownloadService", () => {
  let getRawMessage: jest.Mock;

  beforeEach(() => {
    getRawMessage = jest.fn().mockResolvedValue(RAW_MESSAGE);
  });

  function buildService(
    provider: Partial<EmailProvider> | null = { getRawMessage },
  ): EmailEmlDownloadService {
    return new EmailEmlDownloadService(
      buildEmailRepository(),
      buildProviderManager(provider),
    );
  }

  it("returns the provider's raw message for the owner's email", async () => {
    const download = await buildService().getEmlDownload(
      OWNER_ID,
      OWNER_EMAIL_ID,
    );

    expect(getRawMessage).toHaveBeenCalledWith(OWNER_ID, OWNER_MESSAGE_ID);
    expect(download.content.equals(RAW_MESSAGE)).toBe(true);
    expect(download.contentDisposition).toContain(
      'filename="Quarterly report.eml"',
    );
  });

  it("refuses another user's email id with 404 and never contacts the provider", async () => {
    const service = buildService();

    await expect(
      service.getEmlDownload(OTHER_USER_ID, OWNER_EMAIL_ID),
    ).rejects.toThrow(new NotFoundException(ERROR_MESSAGES.EMAIL_NOT_FOUND));
    expect(getRawMessage).not.toHaveBeenCalled();
  });

  it("serves each user only their own email (owner-side control)", async () => {
    const service = buildService();

    await expect(
      service.getEmlDownload(OWNER_ID, OTHER_USER_EMAIL_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getEmlDownload(OTHER_USER_ID, OTHER_USER_EMAIL_ID),
    ).resolves.toEqual(expect.objectContaining({ content: RAW_MESSAGE }));
  });

  it("rejects a malformed id as not found without querying", async () => {
    await expect(
      buildService().getEmlDownload(OWNER_ID, "not-a-uuid"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getRawMessage).not.toHaveBeenCalled();
  });

  it("answers 501 when the provider cannot supply the raw message", async () => {
    const providerWithoutRawSupport: Partial<EmailProvider> = {
      getAttachment: jest.fn(),
    };

    await expect(
      buildService(providerWithoutRawSupport).getEmlDownload(
        OWNER_ID,
        OWNER_EMAIL_ID,
      ),
    ).rejects.toThrow(
      new NotImplementedException(ERROR_MESSAGES.RAW_MESSAGE_UNSUPPORTED),
    );
  });

  it("reports a missing provider as a bad request", async () => {
    await expect(
      buildService(null).getEmlDownload(OWNER_ID, OWNER_EMAIL_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("maps a provider 404 (message deleted upstream) to not found", async () => {
    getRawMessage.mockRejectedValue(
      Object.assign(new Error("Requested entity was not found."), {
        code: 404,
        response: { status: 404 },
      }),
    );

    await expect(
      buildService().getEmlDownload(OWNER_ID, OWNER_EMAIL_ID),
    ).rejects.toThrow(
      new NotFoundException(ERROR_MESSAGES.RAW_MESSAGE_NOT_FOUND),
    );
  });

  it("rethrows other provider failures unchanged", async () => {
    const failure = new Error("socket hang up");
    getRawMessage.mockRejectedValue(failure);

    await expect(
      buildService().getEmlDownload(OWNER_ID, OWNER_EMAIL_ID),
    ).rejects.toBe(failure);
  });
});
