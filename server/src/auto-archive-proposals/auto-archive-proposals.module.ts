import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AutoArchiveProposal } from "../database/entities/auto-archive-proposal.entity";
import { AutoArchiveScanState } from "../database/entities/auto-archive-scan-state.entity";
import { Email } from "../database/entities/email.entity";
import { QueueModule } from "../queue/queue.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { AutoArchiveMailboxLoader } from "./auto-archive-mailbox.loader";
import { AutoArchiveProposalsController } from "./auto-archive-proposals.controller";
import { AutoArchiveProposalsProcessor } from "./auto-archive-proposals.processor";
import { AutoArchiveProposalsService } from "./auto-archive-proposals.service";

/**
 * AutoArchiveProposalsModule — mines heavy senders the user ignores into
 * proposed archive rules, which become ordinary workflows only on approval.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutoArchiveProposal,
      AutoArchiveScanState,
      Email,
    ]),
    forwardRef(() => AuthModule),
    QueueModule,
    forwardRef(() => WorkflowsModule),
  ],
  controllers: [AutoArchiveProposalsController],
  providers: [
    AutoArchiveMailboxLoader,
    AutoArchiveProposalsService,
    AutoArchiveProposalsProcessor,
  ],
  exports: [AutoArchiveProposalsService],
})
export class AutoArchiveProposalsModule {}
