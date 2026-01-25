import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";
import { ReplyDraft } from "../database/entities/reply-draft.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ReplyDraft])],
  controllers: [DraftsController],
  providers: [DraftsService],
  exports: [DraftsService],
})
export class DraftsModule {}
