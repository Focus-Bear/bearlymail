import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { isUUID } from "class-validator";
import { Repository } from "typeorm";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { UsersService } from "../users/users.service";
import {
  normalizeEncryptedUserText,
  resolveUserDisplayName,
  resolveUserJobTitle,
} from "../utils/user-display-fields.util";
import { validateAnthropicKey } from "./anthropic-key-validator";
import { LLMService } from "./llm.service";
import type { ToneCheckRecipient } from "./llm-tone.types";
import {
  resolveReplyPerspective,
  toReplyThreadHistory,
} from "./reply-perspective";

interface SuggestRepliesBody {
  originalEmail: {
    from: string;
    fromName?: string;
    to?: string;
    subject: string;
    body: string;
  };
  /** Id of the email being replied to, so history doesn't repeat it. */
  emailId?: string;
  /** Lets the server see who sent the latest message in the thread. */
  emailThreadId?: string;
  /** Inbox the user is replying from; "follow-up" means awaiting their reply. */
  inboxMode?: string;
  context?: { tone?: string; writingStyle?: string };
  userInstructions?: string;
}

@Controller("llm")
@UseGuards(JwtAuthGuard, AiCapacityGuard)
export class LLMController {
  constructor(
    private readonly llmService: LLMService,
    private readonly usersService: UsersService,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  @Get("providers")
  async getAvailableProviders() {
    return {
      available: this.llmService.getAvailableProviders(),
      default: this.llmService.getDefaultProvider(),
    };
  }

  @Post("check-tone")
  async checkTone(
    @Request() req,
    @Body()
    body: {
      text: string;
      rules?: string[];
      currentTime?: string | null;
      scheduledSendAt?: string | null;
      attachmentFilenames?: string[];
      recipients?: ToneCheckRecipient[];
    },
  ) {
    // Fetch user tone settings if rules not provided
    let { rules } = body;
    if (!rules || rules.length === 0) {
      const user = await this.usersService.findOne(req.user.userId);
      rules = user?.toneSettings?.rules || [];
    }

    // If user has no tone settings, skip tone check and return OK
    if (!rules || rules.length === 0) {
      return {
        isOk: true,
        suggestions: [],
        revisedText: undefined,
        attachmentReminder: null,
        inappropriateTiming: null,
        recipientMismatch: null,
      };
    }

    const result = await this.llmService.checkTone({
      text: body.text,
      rules,
      userId: req.user.userId,
      scheduledSendAt: body.scheduledSendAt ?? null,
      currentTime: body.currentTime ?? null,
      attachmentFilenames: body.attachmentFilenames ?? [],
      recipients: body.recipients ?? [],
    });

    // Suppress low-significance results — trivial rewording should never block a send.
    // Preserve attachmentReminder, inappropriateTiming and recipientMismatch even when
    // isOk is forced true (all three are sender-only fields independent of the tone gate).
    if (result.significance === "low") {
      return {
        isOk: true,
        suggestions: [],
        revisedText: undefined,
        attachmentReminder: result.attachmentReminder ?? null,
        inappropriateTiming: result.inappropriateTiming ?? null,
        recipientMismatch: result.recipientMismatch ?? null,
      };
    }

    return result;
  }

  /**
   * The account owner's display name for identity anchoring in prompts, so
   * action items never refer to the user by name or read as tasks for a third
   * party (mirrors the summary fix). Tolerates ciphertext in the name columns
   * (normalizeEncryptedUserText) and falls back to "" — not "User" — so the
   * prompt's identity block simply doesn't render when the name is unknown.
   */
  private resolveUserName(
    user: { displayName?: string | null; name?: string | null } | null,
  ): string {
    return (
      normalizeEncryptedUserText(user?.displayName) ||
      normalizeEncryptedUserText(user?.name)
    );
  }

  @Post("extract-actions")
  async extractActions(
    @Request() req,
    @Body()
    body: {
      emailBody: string;
      emailId?: string;
      subject?: string;
      senderInfo?: { from: string; fromName?: string };
      recipientInfo?: { name?: string; email?: string };
      existingActions?: string[];
      isSentEmail?: boolean;
    },
  ) {
    // Change 3: If emailId is provided, check for cached action items from the summary pass.
    // This avoids a separate LLM call when the summary step already extracted action items.
    if (body.emailId) {
      const email = await this.emailRepository.findOne({
        where: { id: body.emailId, userId: req.user.userId },
        select: {
          id: true,
          actionItemsJson: true,
        },
      });
      if (email?.actionItemsJson && email.actionItemsJson.length > 0) {
        return email.actionItemsJson;
      }
    }

    // Get user info for recipient if not provided
    const user = await this.usersService.findOne(req.user.userId);
    const recipientInfo = body.recipientInfo || {
      name: user?.name || "You",
      email: user?.email || "",
    };

    // Determine if the user is the sender by comparing sender email with user email
    const senderEmail = body.senderInfo?.from || "";
    const userEmail = user?.email || "";
    // Normalize emails for comparison (lowercase, remove angle brackets if present)
    const normalizeEmail = (email: string) => {
      // Bounded `[^>]{1,320}` (up to the first `>`, capped at a generous address
      // length) keeps this linear — an unbounded `[^>]+`/`.+` retries at every
      // '<' on inputs like '<=<=<=' and backtracks polynomially (ReDoS, CWE-1333).
      const match = email.match(/<([^>]{1,320})>/);
      return (match ? match[1] : email).toLowerCase().trim();
    };
    const emailMatchesSender = Boolean(
      senderEmail &&
      userEmail &&
      normalizeEmail(senderEmail) === normalizeEmail(userEmail),
    );
    // Accept isSentEmail hint from client (e.g. derived from Gmail SENT label) as
    // a secondary signal in case normalizeEmail comparison fails due to alias mismatch.
    const isUserSender = emailMatchesSender || body.isSentEmail === true;

    return this.llmService.extractActionItems({
      emailBody: body.emailBody,
      userId: req.user.userId,
      senderInfo: body.senderInfo,
      recipientInfo,
      isUserSender,
      existingActions: body.existingActions ?? [],
      subject: body.subject,
      userName: this.resolveUserName(user),
    });
  }

  @Post("suggest-replies")
  async suggestReplies(@Request() req, @Body() body: SuggestRepliesBody) {
    const { userId } = req.user;
    const user = await this.usersService.findOne(userId);
    const toneRules = user?.toneSettings?.rules || [];
    const emailExamples = toneRules.filter(
      (rule: string) =>
        !rule.startsWith("Tone:") &&
        !rule.startsWith("Style:") &&
        !rule.startsWith("Common phrase:"),
    );

    const userEmail = EncryptionHelper.tryDecrypt(user?.email) ?? "";
    const threadEmails = await this.fetchRecentThreadEmails(
      userId,
      body.emailThreadId,
    );
    const perspective = resolveReplyPerspective({
      threadMessages: threadEmails,
      replyTarget: body.originalEmail,
      userEmail,
      inboxMode: body.inboxMode,
    });

    const userContext = {
      tone: body.context?.tone || "professional",
      writingStyle: body.context?.writingStyle,
      userName: resolveUserDisplayName(user),
      userJobTitle: resolveUserJobTitle(user),
      emailExamples,
      userInstructions: body.userInstructions,
      perspective,
    };

    return this.llmService.generateReplyOptions(
      body.originalEmail,
      userContext,
      undefined,
      userId,
      toReplyThreadHistory(threadEmails, body.emailId, userEmail),
    );
  }

  /**
   * Newest thread messages, used to tell whether the user sent the latest one
   * and as conversation history. An unknown or malformed thread id yields none,
   * so the request falls back to judging the posted email alone.
   */
  private async fetchRecentThreadEmails(
    userId: string,
    emailThreadId: string | undefined,
  ): Promise<Email[]> {
    if (!emailThreadId || !isUUID(emailThreadId)) return [];
    return this.emailRepository.find({
      where: { emailThreadId, userId },
      order: { receivedAt: "DESC" },
      take: QUERY_LIMITS.REPLY_SUGGESTION_THREAD_WINDOW,
    });
  }

  @Post("dispute-tone-check")
  async disputeToneCheck(
    @Request() req,
    @Body()
    body: {
      emailText: string;
      suggestions: string[];
      userArgument: string;
    },
  ) {
    const user = await this.usersService.findOne(req.user.userId);
    const currentRules = user?.toneSettings?.rules || [];

    const result = await this.llmService.disputeToneCheck({
      emailText: body.emailText,
      rules: currentRules,
      suggestions: body.suggestions,
      userArgument: body.userArgument,
      userId: req.user.userId,
    });

    if (result.accepted && result.rulesToRemove.length > 0) {
      const updatedRules = currentRules.filter(
        (rule: string) => !result.rulesToRemove.includes(rule),
      );

      await this.usersService.update(req.user.userId, {
        toneSettings: { rules: updatedRules },
      });

      return {
        ...result,
        rulesUpdated: true,
        remainingRules: updatedRules,
      };
    }

    return {
      ...result,
      rulesUpdated: false,
      remainingRules: currentRules,
    };
  }

  // ─── Anthropic API key management ────────────────────────────────────────

  /**
   * Validate and save an Anthropic API key or OAuth token for the current user.
   * The key is validated via a minimal inference call before being persisted.
   * Keys are stored encrypted at rest and never returned to the client.
   */
  @Post("me/anthropic-key")
  async saveAnthropicKey(
    @Request() req: { user: { userId: string } },
    @Body() body: { key: string },
  ) {
    const { key } = body;
    if (!key?.startsWith("sk-ant-")) {
      throw new BadRequestException(
        "Invalid key format — Anthropic keys start with 'sk-ant-'",
      );
    }

    const result = await validateAnthropicKey(key);
    if (!result.valid) {
      throw new BadRequestException(result.error ?? "Key validation failed");
    }

    await this.usersService.update(req.user.userId, {
      anthropicApiKey: key,
    } as Parameters<typeof this.usersService.update>[1]);
    return { success: true };
  }

  /**
   * Remove the stored Anthropic API key for the current user.
   */
  @Delete("me/anthropic-key")
  async removeAnthropicKey(@Request() req: { user: { userId: string } }) {
    await this.usersService.update(req.user.userId, {
      anthropicApiKey: null,
    } as Parameters<typeof this.usersService.update>[1]);
    return { success: true };
  }
}
