import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { SummarizationRule } from "../database/entities/summarization-rule.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { SummarizationController } from "./summarization.controller";
import { SummarizationService } from "./summarization.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([SummarizationRule]),
    forwardRef(() => EmailsModule),
    LLMModule,
    UsersModule,
  ],
  controllers: [SummarizationController],
  providers: [SummarizationService],
  exports: [SummarizationService],
})
export class SummarizationModule {}
