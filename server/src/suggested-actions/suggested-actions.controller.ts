import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CalendarService } from "../calendar/calendar.service";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { GitHubApiService } from "../github/github-api.service";
import { GitHubProjectStatusService } from "../github/github-project-status.service";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { UsersService } from "../users/users.service";
import { SuggestedActionsService } from "./suggested-actions.service";

@Controller("suggested-actions")
@UseGuards(JwtAuthGuard, AiCapacityGuard)
export class SuggestedActionsController {
  constructor(
    private readonly suggestedActionsService: SuggestedActionsService,
    private readonly usersService: UsersService,
    private readonly githubApiService: GitHubApiService,
    private readonly githubProjectStatusService: GitHubProjectStatusService,
    private readonly calendarService: CalendarService,
    private readonly emailsService: EmailsService,
  ) {}

  @Get("email/:id")
  async getSuggestedActions(@Request() req, @Param("id") emailId: string) {
    const { userId } = req.user;
    return this.suggestedActionsService.detectActions(emailId, userId);
  }

  @Post("github/create-issue")
  async createGitHubIssue(
    @Request() req,
    @Body()
    body: {
      owner: string;
      repo: string;
      title: string;
      body: string;
      labels?: string[];
    },
  ) {
    const { userId } = req.user;
    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      throw new BadRequestException(ERROR_MESSAGES.GITHUB_TOKEN_NOT_CONFIGURED);
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    return this.githubApiService.createIssue(token, {
      owner: body.owner,
      repo: body.repo,
      title: body.title,
      body: body.body,
      labels: body.labels,
    });
  }

  @Post("github/update-project-status")
  async updateProjectItemStatus(
    @Request() req,
    @Body()
    body: {
      projectId: string;
      itemId: string;
      fieldId: string;
      optionId: string;
    },
  ) {
    // Validate input first (synchronous, no DB hit needed)
    if (!body.projectId || !body.itemId || !body.fieldId || !body.optionId) {
      throw new BadRequestException(
        "projectId, itemId, fieldId, and optionId are all required",
      );
    }

    const { userId } = req.user;
    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      throw new BadRequestException(ERROR_MESSAGES.GITHUB_TOKEN_NOT_CONFIGURED);
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    if (!token) {
      throw new BadRequestException("GitHub token decryption failed");
    }

    await this.githubProjectStatusService.updateProjectItemStatus(
      token,
      body.projectId,
      body.itemId,
      body.fieldId,
      body.optionId,
    );

    return { success: true };
  }

  @Post("github/update-status")
  async updateIssueStatus(
    @Request() req,
    @Body()
    body: {
      owner: string;
      repo: string;
      issueNumber: number;
      state: "open" | "closed";
    },
  ) {
    const { userId } = req.user;
    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      throw new BadRequestException(ERROR_MESSAGES.GITHUB_TOKEN_NOT_CONFIGURED);
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    return this.githubApiService.updateIssueStatus(
      token,
      body.owner,
      body.repo,
      body.issueNumber,
      body.state,
    );
  }

  @Post("github/add-comment")
  async addIssueComment(
    @Request() req,
    @Body()
    body: {
      owner: string;
      repo: string;
      issueNumber: number;
      body: string;
    },
  ) {
    const { userId } = req.user;
    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      throw new BadRequestException(ERROR_MESSAGES.GITHUB_TOKEN_NOT_CONFIGURED);
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    return this.githubApiService.addIssueComment(
      token,
      body.owner,
      body.repo,
      body.issueNumber,
      body.body,
    );
  }

  @Post("github/search")
  async searchIssues(
    @Request() req,
    @Body()
    body: {
      query: string;
    },
  ) {
    const { userId } = req.user;
    const user = await this.usersService.findOne(userId);
    if (!user?.githubToken) {
      throw new BadRequestException(ERROR_MESSAGES.GITHUB_TOKEN_NOT_CONFIGURED);
    }

    const token = EncryptionHelper.tryDecrypt(user.githubToken);
    return this.githubApiService.searchIssues(token, body.query);
  }

  @Post("calendar/create-invite")
  async createCalendarInvite(
    @Request() req,
    @Body()
    body: {
      startTime: string;
      durationMinutes: number;
      guestEmail: string;
      guestName?: string;
      title?: string;
      description?: string;
    },
  ) {
    const { userId } = req.user;
    const event = await this.calendarService.createEvent({
      userId,
      startTime: body.startTime,
      durationMinutes: body.durationMinutes,
      guestEmail: body.guestEmail,
      guestName: body.guestName,
      title: body.title,
      description: body.description,
    });
    return event;
  }

  @Post("calendar/events")
  async findEventsWithAttendee(
    @Request() req,
    @Body()
    body: {
      attendeeEmail: string;
      daysAhead?: number;
      daysBack?: number;
    },
  ) {
    const { userId } = req.user;
    return this.calendarService.findEventsWithAttendee(
      userId,
      body.attendeeEmail,
      body.daysAhead,
      body.daysBack,
    );
  }
}
