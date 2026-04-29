import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../database/entities/user.entity";
import { UsersModule } from "../users/users.module";
import { EncryptionController } from "./encryption.controller";
import { EncryptionService } from "./encryption.service";
import { KmsEncryptionService } from "./kms-encryption.service";
import { UserEncryptionInterceptor } from "./user-encryption.interceptor";
import { UserEncryptionService } from "./user-encryption.service";

@Global()
@Module({
  imports: [UsersModule, TypeOrmModule.forFeature([User])],
  controllers: [EncryptionController],
  providers: [
    EncryptionService,
    KmsEncryptionService,
    UserEncryptionService,
    UserEncryptionInterceptor,
  ],
  exports: [
    EncryptionService,
    KmsEncryptionService,
    UserEncryptionService,
    UserEncryptionInterceptor,
  ],
})
export class EncryptionModule {}
