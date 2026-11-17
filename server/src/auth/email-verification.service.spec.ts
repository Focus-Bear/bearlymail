import { BadRequestException } from "@nestjs/common";
import { Repository } from "typeorm";

import { EMAIL_VERIFICATION } from "../constants/auth-security.constants";
import { User } from "../database/entities/user.entity";
import { EmailService } from "../email/email.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { revokeAllAccessTokens } from "../personal-access-tokens/revoke-all-access-tokens";
import { UsersService } from "../users/users.service";
import { EmailVerificationService } from "./email-verification.service";
import { EmailNotVerifiedException } from "./exceptions/email-not-verified.exception";
import { hashEmailedToken } from "./token-hash.util";

jest.mock("../personal-access-tokens/revoke-all-access-tokens", () => ({
  revokeAllAccessTokens: jest.fn().mockResolvedValue(2),
}));

const TOKEN_IN_URL = /token=([0-9a-f]+)$/;

describe("EmailVerificationService", () => {
  let usersService: {
    update: jest.Mock;
    findOne: jest.Mock;
    findByEmail: jest.Mock;
    findByEmailVerificationTokenHash: jest.Mock;
  };
  let emailService: {
    sendEmailVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };
  let mailboxes: Array<{ find: jest.Mock }>;
  let service: EmailVerificationService;

  const unverified = {
    id: "user-1",
    email: "Owner@Example.com",
    name: "Owner",
    password: "bcrypt-hash",
    emailVerifiedAt: null,
    emailVerificationTokenExpiresAt: null,
  } as unknown as User;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(async (id: string) => ({ ...unverified, id })),
      findByEmail: jest.fn(),
      findByEmailVerificationTokenHash: jest.fn(),
    };
    emailService = {
      sendEmailVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    mailboxes = Array.from({ length: 5 }, () => ({
      find: jest.fn().mockResolvedValue([]),
    }));
    const encryption = {
      withUserKey: jest.fn((_id: string, task: () => Promise<unknown>) =>
        task(),
      ),
    };
    const [google, office365, zoho, imap, apple] =
      mailboxes as unknown as Repository<never>[];
    service = new EmailVerificationService(
      usersService as unknown as UsersService,
      emailService as unknown as EmailService,
      encryption as unknown as UserEncryptionService,
      google,
      office365,
      zoho,
      imap,
      apple,
      {} as Repository<never>,
    );
  });

  describe("sendVerification", () => {
    it("stores only the hash of the token it emails", async () => {
      await service.sendVerification(unverified);

      const [, , url] = emailService.sendEmailVerificationEmail.mock.calls[0];
      expect(url).toContain(EMAIL_VERIFICATION.CLIENT_PATH);
      const token = TOKEN_IN_URL.exec(url)?.[1] ?? "";
      const [, stored] = usersService.update.mock.calls[0];
      expect(stored.emailVerificationTokenHash).toBe(hashEmailedToken(token));
      expect(stored.emailVerificationTokenHash).not.toBe(token);
      expect(stored.emailVerificationTokenExpiresAt.getTime()).toBeGreaterThan(
        Date.now(),
      );
    });

    it("doesn't throw when the email can't be delivered", async () => {
      emailService.sendEmailVerificationEmail.mockRejectedValue(
        new Error("SES down"),
      );
      await expect(
        service.sendVerification(unverified),
      ).resolves.toBeUndefined();
    });
  });

  describe("verifyEmail", () => {
    it("marks the holder of the link verified", async () => {
      usersService.findByEmailVerificationTokenHash.mockResolvedValue(
        unverified,
      );

      await service.verifyEmail("abc");

      expect(
        usersService.findByEmailVerificationTokenHash,
      ).toHaveBeenCalledWith(hashEmailedToken("abc"));
      expect(usersService.update).toHaveBeenCalledWith("user-1", {
        emailVerifiedAt: expect.any(Date),
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      });
    });

    it("rejects an unknown or expired link", async () => {
      usersService.findByEmailVerificationTokenHash.mockResolvedValue(null);
      await expect(service.verifyEmail("nope")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("resendVerification", () => {
    it.each([
      ["no account", null],
      ["already verified", { ...unverified, emailVerifiedAt: new Date() }],
      ["no password", { ...unverified, password: "" }],
      [
        "a link sent seconds ago",
        {
          ...unverified,
          emailVerificationTokenExpiresAt: new Date(
            Date.now() + EMAIL_VERIFICATION.TOKEN_TTL_MS - 1000,
          ),
        },
      ],
    ])("sends nothing for %s", async (_label, user) => {
      usersService.findByEmail.mockResolvedValue(user);
      await service.resendVerification("owner@example.com");
      expect(emailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it("sends a new link for an unverified password account", async () => {
      usersService.findByEmail.mockResolvedValue(unverified);
      await service.resendVerification("owner@example.com");
      expect(emailService.sendEmailVerificationEmail).toHaveBeenCalled();
    });
  });

  describe("assertVerifiedForPasswordSignIn", () => {
    it("passes a verified user", async () => {
      await expect(
        service.assertVerifiedForPasswordSignIn({
          ...unverified,
          emailVerifiedAt: new Date(),
        } as User),
      ).resolves.toBeUndefined();
    });

    it("verifies a legacy account whose connected mailbox has its address", async () => {
      mailboxes[3].find.mockResolvedValue([{ email: " owner@example.COM " }]);

      await service.assertVerifiedForPasswordSignIn(unverified);

      expect(usersService.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      );
    });

    it("emails a link and refuses otherwise", async () => {
      mailboxes[0].find.mockResolvedValue([
        { email: "someone-else@example.com" },
      ]);

      await expect(
        service.assertVerifiedForPasswordSignIn(unverified),
      ).rejects.toBeInstanceOf(EmailNotVerifiedException);
      expect(emailService.sendEmailVerificationEmail).toHaveBeenCalled();
    });

    it("doesn't re-send while a link is outstanding", async () => {
      await expect(
        service.assertVerifiedForPasswordSignIn({
          ...unverified,
          emailVerificationTokenExpiresAt: new Date(Date.now() + 60_000),
        } as User),
      ).rejects.toBeInstanceOf(EmailNotVerifiedException);
      expect(emailService.sendEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe("claimForProviderSignIn", () => {
    it("leaves a verified account alone", async () => {
      const verified = { ...unverified, emailVerifiedAt: new Date() } as User;
      await expect(service.claimForProviderSignIn(verified)).resolves.toBe(
        verified,
      );
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it("removes an unproven password, ends sessions and revokes tokens", async () => {
      await service.claimForProviderSignIn(unverified);

      expect(usersService.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          password: "",
          passwordChangedAt: expect.any(Date),
          emailVerifiedAt: expect.any(Date),
        }),
      );
      expect(revokeAllAccessTokens).toHaveBeenCalledWith(
        expect.anything(),
        "user-1",
        expect.any(Date),
      );
    });

    it("keeps the password of a legacy account its own mailbox proves", async () => {
      mailboxes[0].find.mockResolvedValue([{ email: "owner@example.com" }]);

      await service.claimForProviderSignIn(unverified);

      const [, update] = usersService.update.mock.calls[0];
      expect(update).not.toHaveProperty("password");
      expect(update.emailVerifiedAt).toEqual(expect.any(Date));
      expect(revokeAllAccessTokens).not.toHaveBeenCalled();
    });
  });

  it("emails a reset link and stores only its hash", async () => {
    await service.sendPasswordResetLink(unverified);

    const [, , url] = emailService.sendPasswordResetEmail.mock.calls[0];
    const token = TOKEN_IN_URL.exec(url)?.[1] ?? "";
    expect(url).toContain("/reset-password?token=");
    expect(usersService.update).toHaveBeenCalledWith("user-1", {
      passwordSetupTokenHash: hashEmailedToken(token),
      passwordSetupTokenExpiresAt: expect.any(Date),
    });
  });
});
