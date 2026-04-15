import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class CreateContactGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  memberContactIds: string[];
}
