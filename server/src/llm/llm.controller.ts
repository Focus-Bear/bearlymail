import { Controller, Get, UseGuards } from '@nestjs/common';
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
}

