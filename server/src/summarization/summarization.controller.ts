import { Controller, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { SummarizationService, SummarizationRule } from './summarization.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('summarize')
@UseGuards(JwtAuthGuard)
export class SummarizationController {
  constructor(private readonly summarizationService: SummarizationService) {}

  @Post(':id')
  async summarizeEmail(
    @Request() req,
    @Param('id') id: string,
    @Body() rule: SummarizationRule & { provider?: 'gemini' | 'openai' },
  ) {
    return {
      summary: await this.summarizationService.summarizeEmail(
        req.user.userId,
        parseInt(id),
        rule,
      ),
    };
  }
}

