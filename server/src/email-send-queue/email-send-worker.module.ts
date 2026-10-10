import { Module } from "@nestjs/common";

import { EmailsModule } from "../emails/emails.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";
import { RepliesModule } from "../replies/replies.module";
import { UsersModule } from "../users/users.module";
import { EmailSendProcessor } from "./email-send.processor";
import { EmailSendQueueModule } from "./email-send-queue.module";

/**
 * Consumer half of the background send pipeline.
 *
 * Registered only by the root app/worker modules and imported by nobody, so it
 * can depend on both EmailsModule and RepliesModule (which itself depends on
 * EmailsModule) without any forwardRef.
 */
@Module({
  imports: [
    EmailSendQueueModule,
    EmailsModule,
    RepliesModule,
    FollowUpsModule,
    UsersModule,
  ],
  providers: [EmailSendProcessor],
})
export class EmailSendWorkerModule {}
