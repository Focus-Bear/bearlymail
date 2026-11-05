import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";

import {
  PAT_SCOPES,
  PERSONAL_ACCESS_TOKENS,
} from "../constants/personal-access-tokens.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import {
  hashPersonalAccessToken,
  PersonalAccessTokensService,
} from "./personal-access-tokens.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-04T00:00:00Z");

function makeRow(
  overrides: Partial<PersonalAccessToken> = {},
): PersonalAccessToken {
  return {
    id: "token-1",
    userId: USER_ID,
    name: "Claude",
    tokenHash: "hash",
    tokenPrefix: "bm_pat_abcde",
    scopes: [PAT_SCOPES.MAIL_READ],
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: NOW,
    ...overrides,
  } as PersonalAccessToken;
}

describe("PersonalAccessTokensService", () => {
  let repository: jest.Mocked<
    Pick<
      Repository<PersonalAccessToken>,
      "count" | "create" | "save" | "find" | "findOne" | "update"
    >
  >;
  let service: PersonalAccessTokensService;

  beforeEach(() => {
    repository = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((row) => row as PersonalAccessToken),
      save: jest.fn(async (row) =>
        makeRow({ ...(row as PersonalAccessToken), id: "token-1" }),
      ),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new PersonalAccessTokensService(
      repository as unknown as Repository<PersonalAccessToken>,
    );
  });

  describe("create", () => {
    it("returns the plaintext once and stores only its hash and display prefix", async () => {
      const created = await service.create(
        USER_ID,
        { name: "  Claude Desktop ", scopes: [PAT_SCOPES.MAIL_READ] },
        NOW,
      );

      expect(
        created.token.startsWith(PERSONAL_ACCESS_TOKENS.TOKEN_PREFIX),
      ).toBe(true);
      const stored = repository.create.mock.calls[0][0] as PersonalAccessToken;
      expect(stored.name).toBe("Claude Desktop");
      expect(stored.tokenHash).toBe(hashPersonalAccessToken(created.token));
      expect(stored.tokenHash).not.toContain(created.token);
      expect(stored.tokenPrefix).toBe(
        created.token.slice(0, PERSONAL_ACCESS_TOKENS.DISPLAY_PREFIX_LENGTH),
      );
      expect(stored.expiresAt).toBeNull();
      expect(created.summary).not.toHaveProperty("tokenHash");
    });

    it("sets an expiry when expiresInDays is given", async () => {
      await service.create(
        USER_ID,
        { name: "Claude", scopes: [PAT_SCOPES.MAIL_READ], expiresInDays: 30 },
        NOW,
      );
      const stored = repository.create.mock.calls[0][0] as PersonalAccessToken;
      expect(stored.expiresAt).toEqual(
        new Date(NOW.getTime() + 30 * MILLISECONDS.DAY),
      );
    });

    it("issues a different token every time", async () => {
      const first = await service.create(USER_ID, {
        name: "a1",
        scopes: [PAT_SCOPES.MAIL_READ],
      });
      const second = await service.create(USER_ID, {
        name: "a2",
        scopes: [PAT_SCOPES.MAIL_READ],
      });
      expect(first.token).not.toBe(second.token);
    });

    it("rejects a blank name", async () => {
      await expect(
        service.create(USER_ID, {
          name: "   ",
          scopes: [PAT_SCOPES.MAIL_READ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("caps the number of active tokens", async () => {
      repository.count.mockResolvedValue(
        PERSONAL_ACCESS_TOKENS.MAX_ACTIVE_TOKENS_PER_USER,
      );
      await expect(
        service.create(USER_ID, {
          name: "Claude",
          scopes: [PAT_SCOPES.MAIL_READ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe("authenticate", () => {
    it("ignores strings without the token prefix without touching the DB", async () => {
      await expect(
        service.authenticate("eyJhbGciOi.jwt.token"),
      ).resolves.toBeNull();
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it("returns null for an unknown or revoked token", async () => {
      await expect(service.authenticate("bm_pat_unknown")).resolves.toBeNull();
      expect(repository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tokenHash: hashPersonalAccessToken("bm_pat_unknown"),
        }),
      });
    });

    it("returns null for an expired token", async () => {
      repository.findOne.mockResolvedValue(
        makeRow({ expiresAt: new Date(NOW.getTime() - 1) }),
      );
      await expect(service.authenticate("bm_pat_x", NOW)).resolves.toBeNull();
    });

    it("returns the principal, drops unknown scopes and records first use", async () => {
      repository.findOne.mockResolvedValue(
        makeRow({ scopes: [PAT_SCOPES.MAIL_SEND, "admin:everything"] }),
      );
      await expect(service.authenticate("bm_pat_x", NOW)).resolves.toEqual({
        userId: USER_ID,
        tokenId: "token-1",
        scopes: [PAT_SCOPES.MAIL_SEND],
      });
      expect(repository.update).toHaveBeenCalledWith(
        { id: "token-1" },
        { lastUsedAt: NOW },
      );
    });

    it("does not rewrite lastUsedAt on every request", async () => {
      repository.findOne.mockResolvedValue(
        makeRow({ lastUsedAt: new Date(NOW.getTime() - MILLISECONDS.MINUTE) }),
      );
      await service.authenticate("bm_pat_x", NOW);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("revoke", () => {
    it("revokes only the caller's own live token", async () => {
      await service.revoke(USER_ID, "token-1", NOW);
      expect(repository.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "token-1", userId: USER_ID }),
        { revokedAt: NOW },
      );
    });

    it("404s when nothing matched", async () => {
      repository.update.mockResolvedValue({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });
      await expect(
        service.revoke(USER_ID, "someone-elses"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
