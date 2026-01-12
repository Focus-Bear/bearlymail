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

@Controller("llm")
@UseGuards(JwtAuthGuard)
export class LLMController {
  constructor(private readonly llmService: LLMService) {}

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
    return this.llmService.generateReplyOptions(
      body.originalEmail,
      body.context || {},
      undefined,
      req.user.userId,
    );
  }
}
