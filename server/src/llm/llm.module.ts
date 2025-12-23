import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LLMService } from "./llm.service";
import { LLMController } from "./llm.controller";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [ConfigModule, forwardRef(() => UsersModule)],
  controllers: [LLMController],
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {}
