import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Office365Account } from "../database/entities/office365-account.entity";
import { UsersModule } from "../users/users.module";
import { Office365AccountsController } from "./office365-accounts.controller";
import { Office365AccountsService } from "./office365-accounts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Office365Account]),
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  providers: [Office365AccountsService],
  controllers: [Office365AccountsController],
  exports: [Office365AccountsService],
})
export class Office365AccountsModule {}
