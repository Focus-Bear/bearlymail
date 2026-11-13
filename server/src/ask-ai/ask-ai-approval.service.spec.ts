import {
  BadRequestException,
  GoneException,
  NotFoundException,
} from "@nestjs/common";
import { Repository } from "typeorm";

import { AskAiPendingApproval } from "../database/entities/ask-ai-pending-approval.entity";
import { AskAiMcpToolDescriptor, AskAiPausedTurn } from "./ask-ai.types";
import {
  ASK_AI_APPROVAL_TTL_MS,
  AskAiApprovalService,
  hashToolCall,
} from "./ask-ai-approval.service";

const DESCRIPTOR: AskAiMcpToolDescriptor = {
  kind: "mcp",
  serverId: "srv-1",
  serverName: "Google Drive",
  toolName: "share_file",
  toolTitle: "Share file",
  readOnly: false,
};

function pausedTurn(args: Record<string, unknown>): AskAiPausedTurn {
  return {
    messages: [],
    activity: [],
    round: 1,
    queuedCalls: [],
    awaiting: { toolCallId: "call-1", descriptor: DESCRIPTOR, args },
  };
}

describe("AskAiApprovalService", () => {
  let repo: jest.Mocked<
    Pick<
      Repository<AskAiPendingApproval>,
      "create" | "save" | "findOne" | "delete"
    >
  >;
  let service: AskAiApprovalService;

  beforeEach(() => {
    repo = {
      create: jest.fn((value) => value as AskAiPendingApproval),
      save: jest.fn(async (value) => ({ ...value, id: "approval-1" })),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    } as unknown as typeof repo;
    service = new AskAiApprovalService(
      repo as unknown as Repository<AskAiPendingApproval>,
    );
  });

  describe("hashToolCall", () => {
    it("is stable regardless of key order", () => {
      expect(hashToolCall(DESCRIPTOR, { a: 1, b: { c: 2, d: 3 } })).toBe(
        hashToolCall(DESCRIPTOR, { b: { d: 3, c: 2 }, a: 1 }),
      );
    });

    it("changes when the arguments, tool or server change", () => {
      const base = hashToolCall(DESCRIPTOR, { email: "a@b.com" });
      expect(hashToolCall(DESCRIPTOR, { email: "x@y.com" })).not.toBe(base);
      expect(
        hashToolCall(
          { ...DESCRIPTOR, toolName: "other" },
          { email: "a@b.com" },
        ),
      ).not.toBe(base);
      expect(
        hashToolCall(
          { ...DESCRIPTOR, serverId: "srv-2" },
          { email: "a@b.com" },
        ),
      ).not.toBe(base);
    });
  });

  it("stores the paused turn and describes the pending call", async () => {
    const args = { fileId: "f1", email: "a@b.com" };
    const pending = await service.createPending("user-1", pausedTurn(args));

    expect(pending).toMatchObject({
      approvalId: "approval-1",
      serverName: "Google Drive",
      toolName: "share_file",
      toolTitle: "Share file",
      arguments: args,
      argumentsHash: hashToolCall(DESCRIPTOR, args),
    });
    const expiresIn = new Date(pending.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(0);
    expect(expiresIn).toBeLessThanOrEqual(ASK_AI_APPROVAL_TTL_MS);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        argumentsHash: hashToolCall(DESCRIPTOR, args),
      }),
    );
  });

  function storedRecord(
    args: Record<string, unknown>,
    overrides: Partial<AskAiPendingApproval> = {},
  ): AskAiPendingApproval {
    return {
      id: "11111111-1111-1111-1111-111111111111",
      userId: "user-1",
      argumentsHash: hashToolCall(DESCRIPTOR, args),
      state: pausedTurn(args),
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    } as AskAiPendingApproval;
  }

  const decision = (argumentsHash: string) => ({
    userId: "user-1",
    approvalId: "11111111-1111-1111-1111-111111111111",
    argumentsHash,
    approved: true,
  });

  it("returns the paused turn once for a matching approval", async () => {
    const args = { fileId: "f1" };
    repo.findOne.mockResolvedValue(storedRecord(args));

    const paused = await service.consume(
      decision(hashToolCall(DESCRIPTOR, args)),
    );

    expect(paused.awaiting.args).toEqual(args);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: "11111111-1111-1111-1111-111111111111", userId: "user-1" },
    });
    expect(repo.delete).toHaveBeenCalledWith({
      id: "11111111-1111-1111-1111-111111111111",
      userId: "user-1",
    });
  });

  it("rejects an approval whose hash is for different arguments", async () => {
    repo.findOne.mockResolvedValue(storedRecord({ email: "a@b.com" }));

    await expect(
      service.consume(decision(hashToolCall(DESCRIPTOR, { email: "x@y.com" }))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects stored arguments that no longer match the stored hash", async () => {
    const record = storedRecord({ email: "a@b.com" });
    record.state = pausedTurn({ email: "x@y.com" });
    repo.findOne.mockResolvedValue(record);

    await expect(
      service.consume(decision(record.argumentsHash)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an expired approval", async () => {
    const args = { fileId: "f1" };
    repo.findOne.mockResolvedValue(
      storedRecord(args, { expiresAt: new Date(Date.now() - 1) }),
    );

    await expect(
      service.consume(decision(hashToolCall(DESCRIPTOR, args))),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it("rejects an unknown or other user's approval", async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.consume(decision("a".repeat(64))),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects an approval that was already used", async () => {
    const args = { fileId: "f1" };
    repo.findOne.mockResolvedValue(storedRecord(args));
    repo.delete.mockResolvedValue({ affected: 0, raw: [] });

    await expect(
      service.consume(decision(hashToolCall(DESCRIPTOR, args))),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
