import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { LocalModelInferenceService } from "./local-model-inference.service";

/**
 * Local category/priority model serving — invokes the inference Lambda
 * (see local-models/ and the serving CDK stack). Exported so the email
 * processing pipeline can run it in shadow mode and, later, use its predictions.
 * Owns the EmailThread repo so it can persist the decision snapshot
 * (localModelDebug) the category debug UI reads.
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([EmailThread])],
  providers: [LocalModelInferenceService],
  exports: [LocalModelInferenceService],
})
export class LocalModelModule {}
