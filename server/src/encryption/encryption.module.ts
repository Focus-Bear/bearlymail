import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../database/entities/user.entity";
import { UsersModule } from "../users/users.module";
import { DataReencryptionController } from "./data-reencryption/data-reencryption.controller";
import { DataReencryptionProcessor } from "./data-reencryption/data-reencryption.processor";
import { DataReencryptionService } from "./data-reencryption/data-reencryption.service";
import { EncryptionController } from "./encryption.controller";
import { EncryptionService } from "./encryption.service";
import { KmsEncryptionService } from "./kms-encryption.service";
import { UserEncryptionInterceptor } from "./user-encryption.interceptor";
import { UserEncryptionService } from "./user-encryption.service";

@Global()
@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([User])],
  controllers: [EncryptionController, DataReencryptionController],
  providers: [
    EncryptionService,
    KmsEncryptionService,
    UserEncryptionService,
    UserEncryptionInterceptor,
    DataReencryptionService,
    DataReencryptionProcessor,
  ],
  exports: [
    EncryptionService,
    KmsEncryptionService,
    UserEncryptionService,
    UserEncryptionInterceptor,
    DataReencryptionService,
  ],
})
export class EncryptionModule {}
