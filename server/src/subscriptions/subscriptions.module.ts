import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../database/entities/user.entity";
import { UsersModule } from "../users/users.module";
import { SubscriptionGuard } from "./subscription.guard";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ConfigModule,
    // Import UsersModule to use AdminGuard
    UsersModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionGuard],
  exports: [SubscriptionsService, SubscriptionGuard],
})
export class SubscriptionsModule {}
