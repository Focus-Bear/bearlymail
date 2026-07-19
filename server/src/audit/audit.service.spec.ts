import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuditLog } from "../database/entities/audit-log.entity";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  let service: AuditService;
  let repo: jest.Mocked<Pick<Repository<AuditLog>, "create" | "save">>;

  beforeEach(async () => {
    repo = {
      create: jest.fn((entity: Partial<AuditLog>) => entity as AuditLog),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it("persists an audit log row with all supplied fields", async () => {
    await service.log({
      userId: "user-1",
      action: "GET /admin/x",
      targetType: "User",
      targetId: "target-1",
      metadata: { foo: "bar" },
      ipAddress: "10.0.0.1",
      userAgent: "ua/1",
    });

    expect(repo.create).toHaveBeenCalledWith({
      userId: "user-1",
      action: "GET /admin/x",
      targetType: "User",
      targetId: "target-1",
      metadata: { foo: "bar" },
      ipAddress: "10.0.0.1",
      userAgent: "ua/1",
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it("defaults missing optional fields to null", async () => {
    await service.log({ userId: "user-1", action: "POST /admin/y" });

    expect(repo.create).toHaveBeenCalledWith({
      userId: "user-1",
      action: "POST /admin/y",
      targetType: null,
      targetId: null,
      metadata: null,
      ipAddress: null,
      userAgent: null,
    });
  });

  it("swallows persistence errors so the request path is never blocked", async () => {
    repo.save.mockRejectedValueOnce(new Error("db down"));

    await expect(
      service.log({ userId: "user-1", action: "GET /admin/z" }),
    ).resolves.toBeUndefined();
  });
});
