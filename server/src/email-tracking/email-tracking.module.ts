import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { EmailOpenEvent } from "../database/entities/email-open-event.entity";
import { EmailTracking } from "../database/entities/email-tracking.entity";
import { User } from "../database/entities/user.entity";
import { EmailOpenRecorderService } from "./email-open-recorder.service";
import { EmailTrackingSummaryService } from "./email-tracking-summary.service";
import { TrackedEmailSender } from "./tracked-email-sender.service";
import { TrackingPixelController } from "./tracking-pixel.controller";

/**
 * Mailtrack-style open tracking. Deliberately depends on nothing but its own
 * tables (and the user's setting) so every send path can import it without
 * creating a module cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EmailTracking, EmailOpenEvent, User])],
  controllers: [TrackingPixelController],
  providers: [
    TrackedEmailSender,
    EmailOpenRecorderService,
    EmailTrackingSummaryService,
  ],
  exports: [TrackedEmailSender, EmailTrackingSummaryService],
})
export class EmailTrackingModule {}
