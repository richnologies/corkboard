import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
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
  @ValidateNested()
  @Type(() => ConfirmedMapPlaceDto)
  confirmedMapPlace?: ConfirmedMapPlaceDto;

  @IsOptional()
  @IsIn(['en', 'es'])
  locale?: 'en' | 'es';
}
