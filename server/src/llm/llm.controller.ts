import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { LLMService } from "./llm.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "../users/users.service";

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
    @Body() body: { text: string; rules?: string[] },
  ) {
    // Fetch user tone settings if rules not provided
    // For now, use defaults or provided rules
    return this.llmService.checkTone(
      body.text,
      body.rules,
      undefined,
      req.user.userId,
    );
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
    const user = await this.llmService["usersService"].findOne(req.user.userId);
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
    const isUserSender =
      senderEmail &&
      userEmail &&
      normalizeEmail(senderEmail) === normalizeEmail(userEmail);

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
    const user = await this.llmService["usersService"].findOne(req.user.userId);
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
