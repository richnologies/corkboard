import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RatingDto } from '../../common/dto/rating.dto.js';

export class ExperiencePhotoDto {
  @IsString()
  key!: string;

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
  @IsArray()
  @IsString({ each: true })
  companions?: string[];

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
  @IsArray()
  @IsString({ each: true })
  companions?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExperiencePhotoDto)
  photos?: ExperiencePhotoDto[];
}
