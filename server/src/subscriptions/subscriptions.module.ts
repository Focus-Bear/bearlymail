import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { OrganizationsModule } from "../organizations/organizations.module";
import { UsersModule } from "../users/users.module";
import { AiCapacityGuard } from "./ai-capacity.guard";
import { SubscriptionGuard } from "./subscription.guard";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Organization, OrganizationMember]),
    ConfigModule,
    UsersModule,
    forwardRef(() => OrganizationsModule),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionGuard, AiCapacityGuard],
  exports: [SubscriptionsService, SubscriptionGuard, AiCapacityGuard],
})
export class SubscriptionsModule {}
