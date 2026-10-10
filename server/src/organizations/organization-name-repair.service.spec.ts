import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Organization } from "../database/entities/organization.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import {
  OrganizationNameRepairService,
  REPAIR_NAME_SOURCE,
} from "./organization-name-repair.service";

const GLOBAL_CIPHER = "global-cipher";
const OWNER_CIPHER = "owner-key-cipher";

describe("OrganizationNameRepairService", () => {
  let service: OrganizationNameRepairService;
  let organizationRepository: { query: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let userEncryptionService: { withUserKey: jest.Mock };
  /** Set while a `withUserKey` task is running, like the real ALS key. */
  let ownerKeyInScope = false;

  const rows = (...values: Array<{ id: string; name: string }>) =>
    values.map((row) => ({ ...row, ownerId: `owner-${row.id}` }));

  beforeEach(async () => {
    ownerKeyInScope = false;

    // Only the global-key ciphertext decrypts without a user key; the owner-key
    // ciphertext decrypts only inside `withUserKey`.
    jest
      .spyOn(EncryptionHelper, "tryDecryptWithGlobalKey")
      .mockImplementation((value) => {
        if (value === GLOBAL_CIPHER) return "Global Org";
        // Invert the encrypt mock below, so the service's round-trip guard
        // behaves as it does in production.
        const wrapped = /^global\((.*)\)$/.exec(value ?? "");
        return wrapped ? wrapped[1] : null;
      });
    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((value) =>
        ownerKeyInScope && value === OWNER_CIPHER ? "Renamed Org" : null,
      );
    jest
      .spyOn(EncryptionHelper, "encryptWithGlobalKey")
      .mockImplementation((value) => (value ? `global(${value})` : null));

    organizationRepository = { query: jest.fn() };
    userRepository = { findOne: jest.fn() };
    userEncryptionService = {
      withUserKey: jest.fn(
        async (_userId: string, task: () => Promise<unknown>) => {
          ownerKeyInScope = true;
          try {
            return await task();
          } finally {
            ownerKeyInScope = false;
          }
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationNameRepairService,
        {
          provide: getRepositoryToken(Organization),
          useValue: organizationRepository,
        },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: UserEncryptionService, useValue: userEncryptionService },
      ],
    }).compile();

    service = module.get(OrganizationNameRepairService);
  });

  afterEach(() => jest.restoreAllMocks());

  /** SELECT rows, then (per repaired row) UPDATE and the read-back SELECT. */
  const mockQueries = (
    scanned: Array<{ id: string; name: string; ownerId: string }>,
    readBackName: string | null = null,
  ) => {
    organizationRepository.query.mockImplementation(
      async (sql: string, params?: unknown[]) => {
        if (sql.includes("SELECT id, name")) return scanned;
        if (sql.startsWith("UPDATE")) return [];
        return [{ name: readBackName ?? (params ? GLOBAL_CIPHER : null) }];
      },
    );
  };

  it("leaves rows that already decrypt under the global key untouched", async () => {
    mockQueries(rows({ id: "org-1", name: GLOBAL_CIPHER }));

    const result = await service.repairAll({ dryRun: false });

    expect(result.totalAlreadyGlobal).toBe(1);
    expect(result.totalRepaired).toBe(0);
    expect(userEncryptionService.withUserKey).not.toHaveBeenCalled();
    expect(
      organizationRepository.query.mock.calls.some(([sql]: [string]) =>
        sql.startsWith("UPDATE"),
      ),
    ).toBe(false);
  });

  it("recovers the true name under the owner's key and re-encrypts globally", async () => {
    mockQueries(
      rows({ id: "org-2", name: OWNER_CIPHER }),
      "global(Renamed Org)",
    );

    const result = await service.repairAll({ dryRun: false });

    expect(result.totalRepaired).toBe(1);
    expect(result.repaired[0]).toEqual({
      organizationId: "org-2",
      source: REPAIR_NAME_SOURCE.OWNER_KEY,
    });
    // Guarded on the exact ciphertext this run inspected.
    const update = organizationRepository.query.mock.calls.find(
      ([sql]: [string]) => sql.startsWith("UPDATE"),
    );
    expect(update[1]).toEqual(["global(Renamed Org)", "org-2", OWNER_CIPHER]);
    expect(userRepository.findOne).not.toHaveBeenCalled();
  });

  it("falls back to the owner's display name when the owner key cannot decrypt", async () => {
    mockQueries(
      rows({ id: "org-3", name: "unknown-cipher" }),
      "global(Jeremy)",
    );
    userRepository.findOne.mockResolvedValue({
      id: "owner-org-3",
      displayName: "Jeremy",
      name: "Jeremy Nagel",
    });

    const result = await service.repairAll({ dryRun: false });

    expect(result.repaired[0]).toEqual({
      organizationId: "org-3",
      source: REPAIR_NAME_SOURCE.OWNER_DISPLAY_NAME,
    });
  });

  it("writes nothing in a dry run but still reports what it would repair", async () => {
    mockQueries(rows({ id: "org-4", name: OWNER_CIPHER }));

    const result = await service.repairAll({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.totalRepaired).toBe(1);
    expect(
      organizationRepository.query.mock.calls.some(([sql]: [string]) =>
        sql.startsWith("UPDATE"),
      ),
    ).toBe(false);
  });

  it("leaves a row alone when neither route recovers a name", async () => {
    mockQueries(rows({ id: "org-5", name: "unknown-cipher" }));
    userRepository.findOne.mockResolvedValue({
      id: "owner-org-5",
      displayName: null,
      name: null,
    });

    const result = await service.repairAll({ dryRun: false });

    expect(result.totalUnrecoverable).toBe(1);
    expect(result.unrecoverable).toEqual(["org-5"]);
    expect(result.totalRepaired).toBe(0);
  });
});
