import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Organization } from "../database/entities/organization.entity";
import { User } from "../database/entities/user.entity";
import { UsersModule } from "../users/users.module";
import { OrganizationNameRepairController } from "./organization-name-repair.controller";
import { OrganizationNameRepairProcessor } from "./organization-name-repair.processor";
import { OrganizationNameRepairService } from "./organization-name-repair.service";

/**
 * Self-contained module for the admin-triggered `organizations.name` key
 * repair, kept out of `OrganizationsModule` so the worker can register the
 * processor without pulling in the organization/billing services.
 *
 * Imported by both AppModule (serves the admin controller) and WorkerModule
 * (registers the PgBoss worker via the processor's onModuleInit).
 * `UserEncryptionService` and `PG_BOSS` come from the global Encryption/Queue
 * modules; `UsersModule` is imported for `AdminGuard`'s `UsersService`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Organization, User]), UsersModule],
  controllers: [OrganizationNameRepairController],
  providers: [OrganizationNameRepairService, OrganizationNameRepairProcessor],
})
export class OrganizationNameRepairModule {}
