import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { SchedulingPreference } from "../database/entities/scheduling-preference.entity";
import { SchedulingPreferencesController } from "./scheduling-preferences.controller";
import { SchedulingPreferencesService } from "./scheduling-preferences.service";

@Module({
  imports: [TypeOrmModule.forFeature([SchedulingPreference])],
  controllers: [SchedulingPreferencesController],
  providers: [SchedulingPreferencesService],
  exports: [SchedulingPreferencesService],
})
export class SchedulingPreferencesModule {}
