import {
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
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
  addressEn?: string;

  @IsOptional()
  @IsString()
  addressEs?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  cityEn?: string;

  @IsOptional()
  @IsString()
  cityEs?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  regionEn?: string;

  @IsOptional()
  @IsString()
  regionEs?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  countryEn?: string;

  @IsOptional()
  @IsString()
  countryEs?: string;

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

class PlaceDetailsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  googleRating?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  googleUserRatingCount?: number;

  @IsOptional()
  @IsString()
  coverPhotoKey?: string;

  @IsOptional()
  @IsString()
  coverPhotoThumbKey?: string;

  @IsOptional()
  @IsString()
  coverPhotoUrl?: string;

  @IsOptional()
  @IsString()
  coverPhotoThumbUrl?: string;

  @IsOptional()
  @IsString()
  tipsEn?: string;

  @IsOptional()
  @IsString()
  tipsEs?: string;

  @IsOptional()
  @IsString()
  enrichedAt?: string;
}

class WineDetailsDto {
  @IsOptional()
  @IsString()
  vivinoWineId?: string;

  @IsOptional()
  @IsString()
  vivinoVintageId?: string;

  @IsOptional()
  @IsUrl()
  vivinoUrl?: string;

  @IsOptional()
  @IsString()
  winery?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grapes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grapesEn?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grapesEs?: string[];

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  regionEn?: string;

  @IsOptional()
  @IsString()
  regionEs?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  countryEn?: string;

  @IsOptional()
  @IsString()
  countryEs?: string;

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsString()
  styleEn?: string;

  @IsOptional()
  @IsString()
  styleEs?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  alcoholPercentage?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergensEn?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergensEs?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  descriptionEs?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imageKey?: string;
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

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  nameEs?: string;

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
  @ValidateNested()
  @Type(() => PlaceDetailsDto)
  place?: PlaceDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WineDetailsDto)
  wine?: WineDetailsDto;

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
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  nameEs?: string;

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
  @ValidateNested()
  @Type(() => PlaceDetailsDto)
  place?: PlaceDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WineDetailsDto)
  wine?: WineDetailsDto;

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
  @IsEnum(ItemCategory)
  excludeCategory?: ItemCategory;

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

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;
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
