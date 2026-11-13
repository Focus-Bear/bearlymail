import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, timingSafeEqual } from "node:crypto";
import { LessThan, Repository } from "typeorm";

import { MS_PER_SECOND, SECONDS } from "../constants/time-constants";
import { AskAiPendingApproval } from "../database/entities/ask-ai-pending-approval.entity";
import {
  AskAiMcpToolDescriptor,
  AskAiPausedTurn,
  AskAiPendingToolCall,
  AskAiToolDecision,
} from "./ask-ai.types";

/** How long the user has to approve or deny a tool call. */
export const ASK_AI_APPROVAL_TTL_MS = SECONDS.FIFTEEN_MINUTES * MS_PER_SECOND;

/** JSON with object keys sorted at every level, so equal values hash equally. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Hash binding an approval to one exact call: which server, which tool, and
 * which arguments. Changing any of them yields a different hash.
 */
export function hashToolCall(
  descriptor: Pick<AskAiMcpToolDescriptor, "serverId" | "toolName">,
  args: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        serverId: descriptor.serverId,
        toolName: descriptor.toolName,
        args,
      }),
    )
    .digest("hex");
}

function hashesMatch(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Stores Ask AI tool calls that need the user's approval, and hands the paused
 * turn back exactly once when the user decides. Records are per-user,
 * single-use and expire after {@link ASK_AI_APPROVAL_TTL_MS}.
 */
@Injectable()
export class AskAiApprovalService {
  constructor(
    @InjectRepository(AskAiPendingApproval)
    private readonly repo: Repository<AskAiPendingApproval>,
  ) {}

  /** Persist a paused turn and describe the pending call for the client. */
  async createPending(
    userId: string,
    paused: AskAiPausedTurn,
  ): Promise<AskAiPendingToolCall> {
    await this.repo.delete({ userId, expiresAt: LessThan(new Date()) });

    const { descriptor, args } = paused.awaiting;
    const argumentsHash = hashToolCall(descriptor, args);
    const expiresAt = new Date(Date.now() + ASK_AI_APPROVAL_TTL_MS);
    const saved = await this.repo.save(
      this.repo.create({ userId, argumentsHash, state: paused, expiresAt }),
    );

    return {
      approvalId: saved.id,
      serverName: descriptor.serverName,
      toolName: descriptor.toolName,
      ...(descriptor.toolTitle ? { toolTitle: descriptor.toolTitle } : {}),
      arguments: args,
      argumentsHash,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Claim a pending call for the user's decision. The record is deleted before
   * anything runs, so a decision can be used only once. Rejects unknown,
   * expired, or mismatched (different arguments) approvals.
   */
  async consume(decision: AskAiToolDecision): Promise<AskAiPausedTurn> {
    const { userId, approvalId, argumentsHash } = decision;
    const record = await this.repo.findOne({
      where: { id: approvalId, userId },
    });
    if (!record) {
      throw new NotFoundException("This approval request no longer exists");
    }
    const deleted = await this.repo.delete({ id: approvalId, userId });
    if (deleted.affected !== 1) {
      throw new NotFoundException("This approval request was already used");
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new GoneException("This approval request has expired");
    }

    const paused = record.state as AskAiPausedTurn | null;
    if (
      !paused?.awaiting ||
      !hashesMatch(record.argumentsHash, argumentsHash) ||
      !hashesMatch(
        record.argumentsHash,
        hashToolCall(paused.awaiting.descriptor, paused.awaiting.args),
      )
    ) {
      throw new BadRequestException(
        "This approval does not match the requested tool call",
      );
    }
    return paused;
  }
}
