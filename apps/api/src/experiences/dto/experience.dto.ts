import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExperienceVisibility } from '@org/domain';
import { RatingDto } from '../../common/dto/rating.dto.js';

export class ExperiencePhotoDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  thumbKey?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateExperienceDto {
  @IsDateString()
  visitedAt!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RatingDto)
  rating?: RatingDto;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  wouldReturn?: boolean;

  @IsOptional()
  @IsEnum(ExperienceVisibility)
  visibility?: ExperienceVisibility;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companionPersonIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperiencePhotoDto)
  photos?: ExperiencePhotoDto[];
}

export class UpdateExperienceDto {
  @IsOptional()
  @IsDateString()
  visitedAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RatingDto)
  rating?: RatingDto;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  wouldReturn?: boolean;

  @IsOptional()
  @IsEnum(ExperienceVisibility)
  visibility?: ExperienceVisibility;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companionPersonIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperiencePhotoDto)
  photos?: ExperiencePhotoDto[];
}
