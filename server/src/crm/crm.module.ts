import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Deal } from "../database/entities/deal.entity";
import { DealStage } from "../database/entities/deal-stage.entity";
import { Contact } from "../database/entities/contact.entity";
import { DealsController } from "./deals.controller";
import { DealsService } from "./deals.service";
import { ContactTypeClassifierService } from "./contact-type-classifier.service";
import { LLMModule } from "../llm/llm.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Deal, DealStage, Contact]),
    forwardRef(() => LLMModule),
  ],
  controllers: [DealsController],
  providers: [DealsService, ContactTypeClassifierService],
  exports: [DealsService, ContactTypeClassifierService],
})
export class CrmModule {}
