import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { GoogleAccountsService } from "./google-accounts.service";
import { GoogleAccountsController } from "./google-accounts.controller";
import { GoogleAccount } from "../database/entities/google-account.entity";
import { UsersModule } from "../users/users.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([GoogleAccount]),
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  providers: [GoogleAccountsService],
  controllers: [GoogleAccountsController],
  exports: [GoogleAccountsService],
})
export class GoogleAccountsModule {}
