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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateFeedbackDto } from "./create-feedback.dto";
import { FeedbackService } from "./feedback.service";
import { FeedbackRateLimitInterceptor } from "./feedback-rate-limit.interceptor";
import {
  FeedbackScreenshotsService,
  MULTER_FILE_SIZE_LIMIT,
} from "./feedback-screenshots.service";

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
   * Upload a screenshot for feedback.
   * POST /feedback/screenshot
   * Accepts: multipart/form-data, field name "file".
   * Server-side MIME validation via magic-byte detection (file-type package).
   * Accepted types: image/jpeg, image/png, image/webp.
   * Max size: 10 MB.
   * Returns: { key: string } — the S3 key to reference in POST /feedback.
   */
  @Post("screenshot")
  @UseInterceptors(
    FeedbackRateLimitInterceptor,
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MULTER_FILE_SIZE_LIMIT },
    }),
  )
  async uploadScreenshot(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ key: string }> {
    const userId = req.user?.userId as string;
    const key = await this.screenshotsService.uploadScreenshot(
      file.buffer,
      userId,
    );
    return { key };
  }

  /**
   * Admin: list all feedback submissions (paginated).
   * GET /feedback/admin
   * Returns each item with a presigned GET URL for the screenshot (1-hour TTL).
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
