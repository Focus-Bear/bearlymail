import { Global, Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module";
import { EncryptionController } from "./encryption.controller";
import { EncryptionService } from "./encryption.service";

@Global()
@Module({
  imports: [UsersModule],
  controllers: [EncryptionController],
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
