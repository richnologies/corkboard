import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ItemCategory, ItemStatus, SourceType } from '@org/domain';

class LocationDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @IsOptional()
  @IsUrl()
  googleMapsUrl?: string;
}

class SourceDto {
  @IsEnum(SourceType)
  type!: SourceType;

  @IsOptional()
  @IsString()
  referrerName?: string;

  @IsOptional()
  @IsString()
  referrerPersonId?: string;

  @IsOptional()
  @IsUrl()
  url?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateItemDto {
  @IsString()
  name!: string;

  @IsEnum(ItemCategory)
  category!: ItemCategory;

  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  links?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SourceDto)
  source?: SourceDto;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(ItemCategory)
  category?: ItemCategory;

  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  links?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SourceDto)
  source?: SourceDto;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ItemQueryDto {
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @IsOptional()
  @IsEnum(ItemCategory)
  category?: ItemCategory;

  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @IsOptional()
  @IsString()
  referrerName?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  q?: string;

  /** @deprecated Use q */
  @IsOptional()
  @IsString()
  city?: string;
}

export class PresignPhotoDto {
  @IsString()
  contentType!: string;

  @IsOptional()
  @IsString()
  extension?: string;

  @IsOptional()
  @IsIn(['thumb'])
  variant?: 'thumb';
}
