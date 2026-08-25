import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ZohoAccount } from "../database/entities/zoho-account.entity";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "./zoho-accounts.service";

describe("ZohoAccountsService", () => {
  let service: ZohoAccountsService;
  let repo: jest.Mocked<Repository<ZohoAccount>>;

  const userId = "user-1";

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ZohoAccountsService,
        {
          provide: getRepositoryToken(ZohoAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    service = module.get(ZohoAccountsService);
    repo = module.get(getRepositoryToken(ZohoAccount));
  });

  describe("findPrimary", () => {
    it("returns the explicitly-flagged primary account", async () => {
      const primary = { id: "acct-primary" } as ZohoAccount;
      repo.findOne.mockResolvedValueOnce(primary);

      const result = await service.findPrimary(userId);

      expect(result).toBe(primary);
      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { userId, isPrimary: true, isActive: true },
      });
    });

    it("falls back to the oldest active account when none is flagged primary", async () => {
      const fallback = { id: "acct-active" } as ZohoAccount;
      // 1st call (primary lookup) -> null, 2nd call (active fallback) -> account
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(fallback);

      const result = await service.findPrimary(userId);

      expect(result).toBe(fallback);
      expect(repo.findOne).toHaveBeenCalledTimes(2);
      expect(repo.findOne).toHaveBeenLastCalledWith({
        where: { userId, isActive: true },
        order: { createdAt: "ASC" },
      });
    });

    it("returns null when the user has no active accounts", async () => {
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await service.findPrimary(userId);

      expect(result).toBeNull();
      expect(repo.findOne).toHaveBeenCalledTimes(2);
    });
  });
});
