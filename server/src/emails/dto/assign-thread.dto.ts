import { IsNotEmpty, IsUUID } from "class-validator";

export class AssignThreadDto {
  @IsUUID()
  @IsNotEmpty()
  assigneeUserId: string;
}
