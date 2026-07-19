import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { User } from "../database/entities/user.entity";
import { InviteService } from "./invite.service";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrganizationMember, User]),
    ConfigModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, InviteService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
