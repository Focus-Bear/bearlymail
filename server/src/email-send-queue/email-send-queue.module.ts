import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { EmailSendAttempt } from "../database/entities/email-send-attempt.entity";
import { EmailSendQueueService } from "./email-send-queue.service";

/**
 * Producer half of the background send pipeline.
 *
 * Deliberately depends on nothing but the repository and the (global) pg-boss
 * provider, so the send controllers can import it without pulling EmailsModule
 * and RepliesModule into a dependency cycle. The consumer half lives in
 * EmailSendWorkerModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EmailSendAttempt])],
  providers: [EmailSendQueueService],
  exports: [EmailSendQueueService],
})
export class EmailSendQueueModule {}
