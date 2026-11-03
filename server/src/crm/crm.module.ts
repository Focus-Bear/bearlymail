import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Contact } from "../database/entities/contact.entity";
import { Deal } from "../database/entities/deal.entity";
import { DealNote } from "../database/entities/deal-note.entity";
import { DealStage } from "../database/entities/deal-stage.entity";
import { LLMModule } from "../llm/llm.module";
import { ContactTypeClassifierService } from "./contact-type-classifier.service";
import { DealNotesService } from "./deal-notes.service";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Deal, DealNote, DealStage, Contact]),
    forwardRef(() => LLMModule),
  ],
  controllers: [DealsController],
  providers: [DealsService, DealNotesService, ContactTypeClassifierService],
  exports: [DealsService, ContactTypeClassifierService],
})
export class CrmModule {}
