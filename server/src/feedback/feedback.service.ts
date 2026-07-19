import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Feedback } from "../database/entities/feedback.entity";
import { UsersService } from "../users/users.service";
import { CreateFeedbackDto } from "./create-feedback.dto";
import { FeedbackScreenshotsService } from "./feedback-screenshots.service";

const MAX_FEEDBACK_PAGE_SIZE = 100;

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    private readonly usersService: UsersService,
    private readonly screenshotsService: FeedbackScreenshotsService,
  ) {}

  async createFeedback(
    userId: string,
    dto: CreateFeedbackDto,
    userAgent?: string,
    appVersion?: string,
  ): Promise<Feedback> {
    let userEmailEncrypted: string | null = null;

    try {
      const user = await this.usersService.findOne(userId);
      if (user?.email) {
        // Store the plain email — the encryptedColumnTransformer on the entity
        // encrypts on write and decrypts on read automatically.
        userEmailEncrypted = user.email;
      }
    } catch (err) {
      this.logger.warn(`Could not retrieve user email for feedback: ${err}`);
    }

    const feedback = this.feedbackRepository.create({
      userEmailEncrypted,
      message: dto.message,
      screenshotS3Key: dto.screenshotS3Key ?? null,
      userAgent: userAgent ?? null,
      appVersion: appVersion ?? null,
    });

    return this.feedbackRepository.save(feedback);
  }

  async listFeedback(
    page = 0,
    limit = MAX_FEEDBACK_PAGE_SIZE,
  ): Promise<{ items: FeedbackAdminDto[]; total: number }> {
    const safeLimit = Math.min(limit, MAX_FEEDBACK_PAGE_SIZE);
    const [rows, total] = await this.feedbackRepository.findAndCount({
      order: { createdAt: "DESC" },
      skip: page * safeLimit,
      take: safeLimit,
    });

    const items = await Promise.all(rows.map((row) => this.toAdminDto(row)));
    return { items, total };
  }

  async deleteFeedback(id: string): Promise<void> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`Feedback ${id} not found`);
    }

    // Delete the screenshot from S3/R2 before removing the DB row so the
    // object is not left orphaned in the bucket.
    if (feedback.screenshotS3Key) {
      await this.screenshotsService.deleteScreenshot(feedback.screenshotS3Key);
    }

    await this.feedbackRepository.delete(id);
  }

  private async toAdminDto(row: Feedback): Promise<FeedbackAdminDto> {
    // userEmailEncrypted is automatically decrypted by the column transformer
    let screenshotUrl: string | null = null;
    if (row.screenshotS3Key) {
      // Generate a 1-hour presigned GET URL so admin can view the screenshot
      // without exposing a permanent public URL.
      screenshotUrl = await this.screenshotsService.getPresignedGetUrl(
        row.screenshotS3Key,
      );
    }

    return {
      id: row.id,
      userEmail: row.userEmailEncrypted ?? null,
      message: row.message,
      screenshotS3Key: row.screenshotS3Key ?? null,
      screenshotUrl,
      createdAt: row.createdAt,
      appVersion: row.appVersion ?? null,
      userAgent: row.userAgent ?? null,
    };
  }
}

export interface FeedbackAdminDto {
  id: string;
  userEmail: string | null;
  message: string;
  screenshotS3Key: string | null;
  /** Presigned GET URL for admin to view screenshot (1-hour TTL). Null when no screenshot. */
  screenshotUrl: string | null;
  createdAt: Date;
  appVersion: string | null;
  userAgent: string | null;
}
