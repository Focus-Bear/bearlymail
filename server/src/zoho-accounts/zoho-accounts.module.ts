import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ZohoAccountsService } from "./zoho-accounts.service";
import { ZohoAccountsController } from "./zoho-accounts.controller";
import { ZohoAccount } from "../database/entities/zoho-account.entity";
import { UsersModule } from "../users/users.module";
import { AuthModule } from "../auth/auth.module";

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
