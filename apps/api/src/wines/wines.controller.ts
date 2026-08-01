import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';
import { WinesService } from './wines.service.js';

class WineSearchQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(25)
  limit?: number;
}

class WineDetailsQueryDto {
  @IsOptional()
  @IsString()
  vintageId?: string;

  @IsOptional()
  @IsString()
  wineId?: string;

  @IsOptional()
  @IsString()
  itemId?: string;
}

class ResolveVivinoUrlDto {
  @IsString()
  @MinLength(10)
  url!: string;
}

class IdentifyWinePhotoDto {
  @IsString()
  @MinLength(3)
  photoKey!: string;
}

@Controller('wines')
@UseGuards(AuthGuard('jwt'))
export class WinesController {
  constructor(private readonly winesService: WinesService) {}

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() query: WineSearchQueryDto) {
    return this.winesService.search(user.userId, query.q, query.limit);
  }

  @Get('details')
  details(@CurrentUser() user: AuthUser, @Query() query: WineDetailsQueryDto) {
    return this.winesService.details(user.userId, {
      vintageId: query.vintageId,
      wineId: query.wineId,
      itemId: query.itemId,
    });
  }

  @Post('resolve-vivino-url')
  resolveVivinoUrl(
    @CurrentUser() user: AuthUser,
    @Body() body: ResolveVivinoUrlDto,
  ) {
    return this.winesService.resolveVivinoUrl(user.userId, body.url);
  }

  @Post('identify-photo')
  identifyPhoto(
    @CurrentUser() user: AuthUser,
    @Body() body: IdentifyWinePhotoDto,
  ) {
    return this.winesService.identifyFromPhoto(user.userId, body.photoKey);
  }
}
