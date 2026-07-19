import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { PriorityService } from "./priority.service";
import { PriorityLearningService } from "./priority-learning.service";
import {
  TriageSuggestion,
  TriageSuggestionsService,
} from "./triage-suggestions.service";

@Controller("priority")
@UseGuards(JwtAuthGuard)
export class PriorityController {
  constructor(
    private readonly triageSuggestionsService: TriageSuggestionsService,
    private readonly priorityService: PriorityService,
    private readonly priorityLearningService: PriorityLearningService,
    private readonly emailsService: EmailsService,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
  ) {}

  @Post("triage-suggestions")
  async getTriageSuggestions(
    @Request() req,
    @Body() body: { emailIds: string[] },
  ) {
    return this.triageSuggestionsService.generateSuggestions(
      req.user.userId,
      body.emailIds,
    );
  }

  @Post("triage-suggestions/override")
  async trackOverride(
    @Request() req,
    @Body()
    body: {
      emailId: string;
      suggestion: TriageSuggestion;
      userAction: { starCount: number; archived: boolean };
    },
  ) {
    await this.triageSuggestionsService.trackOverride(
      req.user.userId,
      body.emailId,
      body.suggestion,
      body.userAction,
    );
    return { message: "Override tracked" };
  }

  @Get(":emailId/explanation")
  async getPriorityExplanation(
    @Request() req,
    @Param("emailId") emailId: string,
  ) {
    const email = await this.emailsService.getEmailById(
      req.user.userId,
      emailId,
    );
    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const contexts = await this.priorityService.getUserContexts(
      req.user.userId,
    );
    const explanation = this.priorityService.calculatePriorityWithExplanation(
      email,
      contexts,
    );

    return explanation;
  }

  @Post("star-feedback")
  @Throttle({ feedback: {} })
  async storeStarFeedback(
    @Request() req,
    @Body()
    body: {
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

    return { message: "Feedback stored successfully" };
  }

  @Post(":emailId/override")
  async setPriorityOverride(
    @Request() req,
    @Param("emailId") emailId: string,
    @Body()
    body: {
      priorityScore: number;
      reasonType?: string;
      reasonText?: string;
    },
  ) {
    await this.priorityService.applyUserOverride(
      req.user.userId,
      emailId,
      body.priorityScore,
      body.reasonType,
      body.reasonText,
    );

    // Process the override reason to improve future scoring
    if (body.reasonType && body.reasonText) {
      const email = await this.emailsService.getEmailById(
        req.user.userId,
        emailId,
      );
      if (email) {
        await this.priorityLearningService.processOverrideReason(
          req.user.userId,
          email,
          body.reasonType,
          body.reasonText,
        );
      }
    }

    return { message: "Priority override applied successfully" };
  }

  @Post(":threadId/override-urgency")
  async overrideUrgency(
    @Request() req,
    @Param("threadId") threadId: string,
    @Body()
    body: {
      urgencyScore: number;
      reason: string;
    },
  ) {
    // Find thread by emailThreadId (the UUID, not Gmail threadId)
    const thread = await this.emailThreadRepository.findOne({
      where: { id: threadId, userId: req.user.userId },
    });

    if (!thread) {
      throw new Error(ERROR_MESSAGES.THREAD_NOT_FOUND);
    }

    // Update thread with new urgency score and override reason
    thread.urgencyScore = Math.max(0, Math.min(100, body.urgencyScore));
    thread.urgencyOverrideReason = EncryptionHelper.encrypt(body.reason);
    await this.emailThreadRepository.save(thread);

    // Trigger learning from override
    const emails = await this.emailsService.getThreadEmails(
      req.user.userId,
      thread.threadId,
    );
    if (emails.length > 0) {
      // Use first email for learning context
      await this.priorityLearningService.learnFromUrgencyOverride(
        req.user.userId,
        emails[0],
        body.urgencyScore,
        body.reason,
      );
    }

    return { message: "Urgency override applied successfully" };
  }

  @Post(":emailId/feedback")
  @Throttle({ feedback: {} })
  async providePriorityFeedback(
    @Request() req,
    @Param("emailId") emailId: string,
    @Body()
    body: {
      feedback: string;
      expectedPriority?: number;
    },
  ) {
    const email = await this.emailsService.getEmailById(
      req.user.userId,
      emailId,
    );
    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    // Use priority learning service to process feedback and update context
    const result = await this.priorityLearningService.learnFromPriorityFeedback(
      req.user.userId,
      email,
      body.feedback,
      body.expectedPriority,
    );

    return {
      message: "Feedback received and will be used to improve prioritization",
      contextUpdated: result.updated.length > 0,
      contextUpdates: result.updated,
      summary:
        result.updated.length > 0
          ? `Updated ${result.updated.length} context ${result.updated.length === 1 ? "entry" : "entries"} based on your feedback`
          : "No context updates were needed based on your feedback",
    };
  }
}
