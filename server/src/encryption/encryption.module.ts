import { Module, Global } from "@nestjs/common";
import { EncryptionService } from "./encryption.service";

@Global() // Make encryption service available everywhere
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
