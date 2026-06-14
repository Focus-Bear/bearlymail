import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { LocalModelInferenceService } from "./local-model-inference.service";

/**
 * Local category/priority model serving — invokes the inference Lambda
 * (see local-models/ and the serving CDK stack). Exported so the email
 * processing pipeline can run it in shadow mode and, later, use its predictions.
 */
@Module({
  imports: [ConfigModule],
  providers: [LocalModelInferenceService],
  exports: [LocalModelInferenceService],
})
export class LocalModelModule {}
