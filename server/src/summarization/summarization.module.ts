import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SummarizationController } from "./summarization.controller";
import { SummarizationService } from "./summarization.service";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { SummarizationRule } from "../database/entities/summarization-rule.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([SummarizationRule]),
    forwardRef(() => EmailsModule),
    LLMModule,
  ],
  controllers: [SummarizationController],
  providers: [SummarizationService],
  exports: [SummarizationService],
})
export class SummarizationModule {}
