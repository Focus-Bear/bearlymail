import { IsArray, IsOptional, IsString } from "class-validator";

export class UpdateContactGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberContactIds?: string[];
}
