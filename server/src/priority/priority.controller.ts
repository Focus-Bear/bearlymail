import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { PriorityService } from './priority.service';
import { TriageSuggestionsService } from './triage-suggestions.service';
import { PriorityRule } from '../database/entities/priority-rule.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('priority')
@UseGuards(JwtAuthGuard)
export class PriorityController {
  constructor(
    private readonly priorityService: PriorityService,
    private readonly triageSuggestionsService: TriageSuggestionsService,
  ) {}

  @Get('rules')
  async getRules(@Request() req) {
    return this.priorityService.getPriorityRules(req.user.userId);
  }

  @Post('rules')
  async createRule(@Request() req, @Body() rule: Partial<PriorityRule>) {
    return this.priorityService.createPriorityRule(req.user.userId, rule);
  }

  @Put('rules/:id')
  async updateRule(@Request() req, @Param('id') id: string, @Body() updates: Partial<PriorityRule>) {
    return this.priorityService.updatePriorityRule(id, req.user.userId, updates);
  }

  @Delete('rules/:id')
  async deleteRule(@Request() req, @Param('id') id: string) {
    await this.priorityService.deletePriorityRule(id, req.user.userId);
    return { message: 'Rule deleted successfully' };
  }

  @Post('triage-suggestions')
  async getTriageSuggestions(@Request() req, @Body() body: { emailIds: string[] }) {
    return this.triageSuggestionsService.generateSuggestions(req.user.userId, body.emailIds);
  }

  @Post('triage-suggestions/override')
  async trackOverride(
    @Request() req,
    @Body() body: {
      emailId: string;
      suggestion: any;
      userAction: { starCount: number; archived: boolean };
    },
  ) {
    await this.triageSuggestionsService.trackOverride(
      req.user.userId,
      body.emailId,
      body.suggestion,
      body.userAction,
    );
    return { message: 'Override tracked' };
  }
}

