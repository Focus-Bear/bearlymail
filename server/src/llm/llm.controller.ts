import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { LLMService } from './llm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('llm')
@UseGuards(JwtAuthGuard)
export class LLMController {
  constructor(private readonly llmService: LLMService) {}

  @Get('providers')
  async getAvailableProviders() {
    return {
      available: this.llmService.getAvailableProviders(),
      default: this.llmService.getDefaultProvider(),
    };
  }

  @Post('check-tone')
  async checkTone(@Request() req, @Body() body: { text: string; rules?: string[] }) {
    // Fetch user tone settings if rules not provided
    // For now, use defaults or provided rules
    return this.llmService.checkTone(body.text, body.rules, undefined, req.user.userId);
  }

  @Post('extract-actions')
  async extractActions(@Request() req, @Body() body: { emailBody: string }) {
    return this.llmService.extractActionItems(body.emailBody, undefined, req.user.userId);
  }

  @Post('suggest-replies')
  async suggestReplies(@Request() req, @Body() body: { 
    originalEmail: { from: string; fromName?: string; subject: string; body: string },
    context?: { tone?: string; writingStyle?: string }
  }) {
    return this.llmService.generateReplyOptions(body.originalEmail, body.context || {}, undefined, req.user.userId);
  }
}

