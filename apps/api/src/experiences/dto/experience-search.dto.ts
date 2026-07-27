import { IsOptional, IsString } from 'class-validator';

export class ExperienceSearchQueryDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
