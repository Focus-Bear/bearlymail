import { Controller, Post, Get, Body, UseGuards, Request, Param } from '@nestjs/common';
import { TriageSuggestionsService } from './triage-suggestions.service';
import { PriorityService } from './priority.service';
import { PriorityLearningService } from './priority-learning.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailsService } from '../emails/emails.service';

@Controller('priority')
@UseGuards(JwtAuthGuard)
export class PriorityController {
  constructor(
    private readonly triageSuggestionsService: TriageSuggestionsService,
    private readonly priorityService: PriorityService,
    private readonly priorityLearningService: PriorityLearningService,
    private readonly emailsService: EmailsService,
  ) {}

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

  @Get(':emailId/explanation')
  async getPriorityExplanation(@Request() req, @Param('emailId') emailId: string) {
    const email = await this.emailsService.getEmailById(req.user.userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    const contexts = await this.priorityService.getUserContexts(req.user.userId);
    const explanation = this.priorityService.calculatePriorityWithExplanation(
      email,
      contexts,
    );

    return explanation;
  }

  @Post('star-feedback')
  async storeStarFeedback(
    @Request() req,
    @Body() body: {
      emailId: string;
      userStarCount: number;
      predictedStarCount: number;
      explanation: string;
    },
  ) {
    await this.priorityLearningService.storeStarFeedback(
      req.user.userId,
      body.emailId,
      body.userStarCount,
      body.predictedStarCount,
      body.explanation,
    );

    return { message: 'Feedback stored successfully' };
  }
}
