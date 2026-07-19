import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Waitlist } from "../database/entities/waitlist.entity";
import { EmailModule } from "../email/email.module";
import { UsersModule } from "../users/users.module";
import { WaitlistController } from "./waitlist.controller";
import { WaitlistService } from "./waitlist.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Waitlist]),
    UsersModule,
    forwardRef(() => AuthModule),
    EmailModule,
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
