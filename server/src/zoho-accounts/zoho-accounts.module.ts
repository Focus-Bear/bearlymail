import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { ZohoAccount } from "../database/entities/zoho-account.entity";
import { UsersModule } from "../users/users.module";
import { ZohoAccountsController } from "./zoho-accounts.controller";
import { ZohoAccountsService } from "./zoho-accounts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ZohoAccount]),
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  providers: [ZohoAccountsService],
  controllers: [ZohoAccountsController],
  exports: [ZohoAccountsService],
})
export class ZohoAccountsModule {}
