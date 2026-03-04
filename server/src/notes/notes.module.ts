import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { PrivateNote } from "../database/entities/private-note.entity";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({
  imports: [TypeOrmModule.forFeature([PrivateNote])],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
