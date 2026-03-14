import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "../users/users.service";
import { LLMService } from "./llm.service";

@Controller("llm")
@UseGuards(JwtAuthGuard)
export class LLMController {
  constructor(
    private readonly llmService: LLMService,
    private readonly usersService: UsersService,
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
      currentTime?: string;
      scheduledSendAt?: string;
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
      return { isOk: true, suggestions: [], revisedText: undefined };
    }

    const result = await this.llmService.checkTone(
      body.text,
      rules,
      undefined,
      req.user.userId,
      body.currentTime,
      body.scheduledSendAt,
    );

    // Suppress low-significance results — trivial rewording should never block a send.
    if (result.significance === "low") {
      return { isOk: true, suggestions: [], revisedText: undefined };
    }

    // If the user already has a scheduled send time in the future, filter out any
    // timing / scheduling suggestions that the LLM may have produced.
    if (body.scheduledSendAt) {
      const scheduledTime = new Date(body.scheduledSendAt);
      const isScheduledInFuture =
        !isNaN(scheduledTime.getTime()) && scheduledTime > new Date();

      if (isScheduledInFuture && result.suggestions.length > 0) {
        const timingKeywords = [
          "late",
          "night",
          "weekend",
          "early",
          "morning",
          "timing",
          "hour",
          "after hours",
          "business hours",
          "off hours",
          "schedule",
          "monday",
          "next business",
        ];
        const nonTimingSuggestions = result.suggestions.filter(
          (suggestion) =>
            !timingKeywords.some((kw) => suggestion.toLowerCase().includes(kw)),
        );

        if (nonTimingSuggestions.length === 0) {
          // All suggestions were timing-related — email is fine.
          return { isOk: true, suggestions: [], revisedText: undefined };
        }

        if (nonTimingSuggestions.length < result.suggestions.length) {
          // Some timing suggestions removed — recalculate isOk based on remaining.
          return {
            ...result,
            isOk: nonTimingSuggestions.length === 0 ? true : result.isOk,
            suggestions: nonTimingSuggestions,
          };
        }
      }
    }

    return result;
  }

  @Post("extract-actions")
  async extractActions(
    @Request() req,
    @Body()
    body: {
      emailBody: string;
      senderInfo?: { from: string; fromName?: string };
      recipientInfo?: { name?: string; email?: string };
    },
  ) {
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
      const match = email.match(/<(.+)>/);
      return (match ? match[1] : email).toLowerCase().trim();
    };
    const isUserSender = Boolean(
      senderEmail &&
      userEmail &&
      normalizeEmail(senderEmail) === normalizeEmail(userEmail),
    );

    return this.llmService.extractActionItems(
      body.emailBody,
      undefined,
      req.user.userId,
      body.senderInfo,
      recipientInfo,
      isUserSender,
    );
  }

  @Post("suggest-replies")
  async suggestReplies(
    @Request() req,
    @Body()
    body: {
      originalEmail: {
        from: string;
        fromName?: string;
        subject: string;
        body: string;
      };
      context?: { tone?: string; writingStyle?: string };
    },
  ) {
    const user = await this.usersService.findOne(req.user.userId);
    const toneRules = user?.toneSettings?.rules || [];
    const emailExamples = toneRules.filter(
      (rule: string) =>
        !rule.startsWith("Tone:") &&
        !rule.startsWith("Style:") &&
        !rule.startsWith("Common phrase:"),
    );

    const userContext = {
      tone: body.context?.tone || "professional",
      writingStyle: body.context?.writingStyle,
      userName: user?.displayName || user?.name || "User",
      userJobTitle: user?.jobTitle || "",
      emailExamples,
    };

    return this.llmService.generateReplyOptions(
      body.originalEmail,
      userContext,
      undefined,
      req.user.userId,
    );
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

    const result = await this.llmService.disputeToneCheck(
      body.emailText,
      currentRules,
      body.suggestions,
      body.userArgument,
      undefined,
      req.user.userId,
    );

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
}
