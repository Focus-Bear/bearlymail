import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  NotFoundException,
  Post,
  Req,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { InjectRepository } from "@nestjs/typeorm";
import type { Request as ExpressRequest, Response } from "express";
import { Repository } from "typeorm";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Email } from "../database/entities/email.entity";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import {
  ASK_AI_ROLE_ASSISTANT,
  ASK_AI_ROLE_USER,
  AskAiTurn,
} from "../llm/llm-ask.service";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import {
  AskAiAgentOptions,
  AskAiAgentResult,
  AskAiRunHooks,
  AskAiStreamEvent,
  AskAiToolDecision,
} from "./ask-ai.types";
import { AskAiAgentService } from "./ask-ai-agent.service";

/** Max characters accepted for a single Ask-AI question. */
const ASK_AI_MAX_QUESTION_LENGTH = 2000;
/** Max prior turns of conversation history accepted from the client. */
const ASK_AI_MAX_HISTORY_TURNS = 12;
/** Per-user rate limit: an agentic turn fans out to several LLM calls. */
const ASK_AI_RATE_LIMIT = 20;
const ASK_AI_RATE_TTL_SECONDS = 60;
/** Most recent messages of the open thread to feed the assistant. */
const ASK_AI_MAX_THREAD_MESSAGES = 12;
/** Per-message body cap when assembling a thread (bounds the prompt). */
const ASK_AI_PER_MESSAGE_BODY_LENGTH = 1500;
/** Body cap for a single (non-thread) email. */
const ASK_AI_SINGLE_BODY_LENGTH = 4000;

interface AskAiRequestBody {
  emailId: string;
  question: string;
  history?: AskAiTurn[];
}

interface AskAiToolDecisionBody {
  approvalId: string;
  argumentsHash: string;
  approved: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

type AuthedRequest = { user: { userId: string } };

/**
 * Ask AI — agentic email assistant. Grounded in the single email/thread the
 * user has open, but able to call tools (search their other emails, query
 * connected MCP servers such as Google Drive) to answer. Nothing is persisted;
 * the client supplies prior turns on each request.
 *
 * Route lives under /llm to preserve the existing client contract.
 */
@Controller("llm")
@UseGuards(JwtAuthGuard, AiCapacityGuard)
export class AskAiController {
  private readonly logger = new Logger(AskAiController.name);

  constructor(
    private readonly agent: AskAiAgentService,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  @Throttle({
    default: { limit: ASK_AI_RATE_LIMIT, ttl: ASK_AI_RATE_TTL_SECONDS },
  })
  @Post("ask-email")
  async askEmail(
    @Request() req: AuthedRequest,
    @Body() body: AskAiRequestBody,
  ) {
    const prepared = await this.prepare(req.user.userId, body);
    const { answer, toolActivity, pendingToolCall } =
      await this.agent.ask(prepared);
    return pendingToolCall
      ? { answer, toolActivity, pendingToolCall }
      : { answer, toolActivity };
  }

  /**
   * Streaming variant: emits Server-Sent Events as the agent works ("tool"
   * events as each tool runs, then a final "answer" event), so the UI can show
   * live progress on slower turns. Aborts the turn if the client disconnects.
   */
  @Throttle({
    default: { limit: ASK_AI_RATE_LIMIT, ttl: ASK_AI_RATE_TTL_SECONDS },
  })
  @Post("ask-email/stream")
  async streamEmail(
    @Request() req: AuthedRequest,
    @Body() body: AskAiRequestBody,
    @Req() rawReq: ExpressRequest,
    @Res() res: Response,
  ): Promise<void> {
    // Validation runs before any SSE headers so failures surface as normal HTTP
    // errors that the Nest exception filter can format.
    const prepared = await this.prepare(req.user.userId, body);
    await this.streamTurn(rawReq, res, (hooks) =>
      this.agent.ask({ ...prepared, ...hooks }),
    );
  }

  /**
   * Approve or deny a connected-tool call the assistant paused on, then stream
   * the rest of the turn exactly like `ask-email/stream`. Approval runs the
   * stored call only; the hash must match the call that was shown.
   */
  @Throttle({
    default: { limit: ASK_AI_RATE_LIMIT, ttl: ASK_AI_RATE_TTL_SECONDS },
  })
  @Post("ask-email/tool-approval/stream")
  async streamToolDecision(
    @Request() req: AuthedRequest,
    @Body() body: AskAiToolDecisionBody,
    @Req() rawReq: ExpressRequest,
    @Res() res: Response,
  ): Promise<void> {
    const decision = this.parseDecision(req.user.userId, body);
    // Claim the approval before opening the stream so an unknown, expired or
    // mismatched approval is a normal HTTP error rather than an SSE event.
    const paused = await this.agent.claimApproval(decision);
    await this.streamTurn(rawReq, res, (hooks) =>
      this.agent.resume(decision, paused, hooks),
    );
  }

  /**
   * Run one agent step over Server-Sent Events: "tool" events as tools run,
   * then a terminal "answer", "approval_required" or "error" event. Aborts the
   * turn if the client disconnects.
   */
  private async streamTurn(
    rawReq: ExpressRequest,
    res: Response,
    run: (hooks: AskAiRunHooks) => Promise<AskAiAgentResult>,
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const controller = new AbortController();
    rawReq.on("close", () => controller.abort());
    const write = (event: AskAiStreamEvent) => {
      if (!controller.signal.aborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
      const { answer, toolActivity, pendingToolCall } = await run({
        onEvent: write,
        signal: controller.signal,
      });
      write(
        pendingToolCall
          ? { type: "approval_required", pendingToolCall, toolActivity }
          : { type: "answer", answer, toolActivity },
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        const message =
          error instanceof Error ? error.message : "Ask AI failed";
        this.logger.warn(`Ask AI stream failed: ${message}`);
        write({ type: "error", message });
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  private parseDecision(
    userId: string,
    body: AskAiToolDecisionBody,
  ): AskAiToolDecision {
    if (
      typeof body?.approvalId !== "string" ||
      !UUID_PATTERN.test(body.approvalId)
    ) {
      throw new BadRequestException("A valid approvalId is required");
    }
    if (
      typeof body.argumentsHash !== "string" ||
      !SHA256_HEX_PATTERN.test(body.argumentsHash)
    ) {
      throw new BadRequestException("A valid argumentsHash is required");
    }
    if (typeof body.approved !== "boolean") {
      throw new BadRequestException("approved must be true or false");
    }
    return {
      userId,
      approvalId: body.approvalId,
      argumentsHash: body.argumentsHash,
      approved: body.approved,
    };
  }

  /** Shared validation + email fetch + history sanitisation. */
  private async prepare(
    userId: string,
    body: AskAiRequestBody,
  ): Promise<AskAiAgentOptions> {
    if (!body.emailId || typeof body.emailId !== "string") {
      throw new BadRequestException("Email ID is required");
    }
    const question = body.question?.trim();
    if (!question) {
      throw new BadRequestException("Question is required");
    }
    if (question.length > ASK_AI_MAX_QUESTION_LENGTH) {
      throw new BadRequestException(
        `Question too long — keep it under ${ASK_AI_MAX_QUESTION_LENGTH} characters`,
      );
    }

    const email = await this.emailRepository.findOne({
      where: { id: body.emailId, userId },
    });
    if (!email) {
      throw new NotFoundException("Email not found");
    }

    // Sanitize client-supplied history: keep only well-formed user/assistant
    // turns and cap the number of turns to bound the prompt size.
    const history: AskAiTurn[] = (body.history ?? [])
      .filter(
        (turn): turn is AskAiTurn =>
          Boolean(turn) &&
          typeof turn.content === "string" &&
          turn.content.trim().length > 0 &&
          (turn.role === ASK_AI_ROLE_USER ||
            turn.role === ASK_AI_ROLE_ASSISTANT),
      )
      .slice(-ASK_AI_MAX_HISTORY_TURNS);

    // Feed the assistant the WHOLE thread, not just the opened message — the
    // opened row may be a reaction or a one-liner while the substance (dates,
    // asks) lives in sibling messages. Messages are separate Email rows joined
    // by emailThreadId (same as GET /emails/:id/thread).
    // Newest-first take (so we keep the most recent messages on long threads),
    // then reverse to oldest → newest for the model.
    const threadEmails = email.emailThreadId
      ? (
          await this.emailRepository.find({
            where: { userId, emailThreadId: email.emailThreadId },
            order: { receivedAt: "DESC" },
            take: ASK_AI_MAX_THREAD_MESSAGES,
          })
        ).reverse()
      : [];

    const isThread = threadEmails.length > 1;
    const assembledBody = isThread
      ? this.buildThreadBody(threadEmails)
      : cleanEmailContent(email.body ?? "", null, ASK_AI_SINGLE_BODY_LENGTH);

    return {
      email: {
        subject: email.subject ?? "",
        from: email.from ?? "",
        fromName: email.fromName ?? "",
        body: assembledBody,
        isThread,
      },
      question,
      history,
      userId,
    };
  }

  /** Assemble thread messages (oldest → newest) into a single labelled body. */
  private buildThreadBody(emails: Email[]): string {
    return emails
      .map((msg, index) => {
        const who = msg.fromName || msg.from || "Unknown sender";
        const when = msg.receivedAt
          ? msg.receivedAt.toISOString().slice(0, 10)
          : "";
        const text = cleanEmailContent(
          msg.body ?? "",
          null,
          ASK_AI_PER_MESSAGE_BODY_LENGTH,
        );
        const header = `[Message ${index + 1} from ${who}${when ? ` on ${when}` : ""}]:`;
        return `${header}\n${text}`;
      })
      .join("\n\n---\n\n");
  }
}
