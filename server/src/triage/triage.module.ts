import { Module } from "@nestjs/common";

import { LLMModule } from "../llm/llm.module";
import { TriageController } from "./triage.controller";
import { TriageService } from "./triage.service";

@Module({
  imports: [LLMModule],
  controllers: [TriageController],
  providers: [TriageService],
  exports: [TriageService],
})
export class TriageModule {}
