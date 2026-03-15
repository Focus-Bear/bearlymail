import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateFeedbackDto } from "./create-feedback.dto";
import { FeedbackService } from "./feedback.service";
import { FeedbackRateLimitInterceptor } from "./feedback-rate-limit.interceptor";
import { FeedbackScreenshotsService } from "./feedback-screenshots.service";

export class CreateScreenshotUploadDto {
  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

@Controller("feedback")
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly screenshotsService: FeedbackScreenshotsService,
  ) {}

  /**
   * Submit a feedback entry.
   * POST /feedback
   * Rate-limited to 10 submissions per user per hour.
   * TODO: Replace with @Throttle({ feedback: {} }) once PR #920 is merged.
   * See: https://github.com/Focus-Bear/BearlyMail/issues/912
   */
  @Post()
  @UseInterceptors(FeedbackRateLimitInterceptor)
  async submit(
    @Request() req,
    @Body() dto: CreateFeedbackDto,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-app-version") appVersion?: string,
  ) {
    const userId = req.user?.userId as string;
    return this.feedbackService.createFeedback(
      userId,
      dto,
      userAgent,
      appVersion,
    );
  }

  /**
   * Request a presigned URL to upload a screenshot for feedback.
   * POST /feedback/screenshot
   * Body: { filename?: string, contentType?: string }
   * Rate-limited alongside the main submit endpoint.
   */
  @Post("screenshot")
  @UseInterceptors(FeedbackRateLimitInterceptor)
  async createScreenshotUpload(@Body() dto: CreateScreenshotUploadDto) {
    return this.screenshotsService.createPresignedPutUrl(
      dto.filename,
      dto.contentType,
    );
  }

  /**
   * Admin: list all feedback submissions (paginated).
   * GET /feedback/admin
   */
  @Get("admin")
  @UseGuards(AdminGuard)
  async listAll(@Query("page") page = "0", @Query("limit") limit = "50") {
    return this.feedbackService.listFeedback(
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  /**
   * Admin: delete a feedback submission.
   * DELETE /feedback/admin/:id
   */
  @Delete("admin/:id")
  @UseGuards(AdminGuard)
  async delete(@Param("id") id: string) {
    await this.feedbackService.deleteFeedback(id);
    return { success: true };
  }
}
