import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PersonType } from '@org/domain';

export class CreatePersonDto {
  @IsString()
  name!: string;

  @IsEnum(PersonType)
  type!: PersonType;
}

export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(PersonType)
  type?: PersonType;

  @IsOptional()
  @IsString()
  linkedUserId?: string | null;
}

export class PersonQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
