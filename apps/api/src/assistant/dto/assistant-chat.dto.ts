import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ConfirmedMapPlaceDto {
  @IsString()
  googlePlaceId!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class ConfirmedWineDto {
  @IsString()
  wineId!: string;

  @IsOptional()
  @IsString()
  vintageId?: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class ConfirmedCompanionDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsBoolean()
  createNew?: boolean;
}

export class PendingVisitDto {
  @IsIn(['log_visit', 'create_place_and_log_visit', 'update_visit'])
  type!: 'log_visit' | 'create_place_and_log_visit' | 'update_visit';

  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @IsOptional()
  @IsString()
  experienceId?: string;

  @IsOptional()
  @IsString()
  visitedAt?: string;

  @IsOptional()
  @IsNumber()
  overallRating?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  wouldReturn?: boolean;

  @IsArray()
  @IsString({ each: true })
  companions!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoThumbKeys?: string[];
}

export class AssistantChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class AssistantChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssistantChatMessageDto)
  messages!: AssistantChatMessageDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoThumbKeys?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmedMapPlaceDto)
  confirmedMapPlace?: ConfirmedMapPlaceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConfirmedWineDto)
  confirmedWine?: ConfirmedWineDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmedCompanionDto)
  confirmedCompanions?: ConfirmedCompanionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PendingVisitDto)
  pendingVisit?: PendingVisitDto;

  @IsOptional()
  @IsIn(['en', 'es'])
  locale?: 'en' | 'es';

  @IsOptional()
  @IsString()
  timeZone?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
