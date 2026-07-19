import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Feedback } from "../database/entities/feedback.entity";
import { UsersModule } from "../users/users.module";
import { FeedbackController } from "./feedback.controller";
import { FeedbackService } from "./feedback.service";
import { FeedbackScreenshotsService } from "./feedback-screenshots.service";

@Module({
  imports: [TypeOrmModule.forFeature([Feedback]), UsersModule, AuthModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackScreenshotsService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
