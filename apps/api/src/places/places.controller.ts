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
import { PlacesService } from './places.service.js';

class PlaceSearchQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;
}

class PlaceReverseQueryDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lon!: number;
}

class PlaceNearbyQueryDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lon!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(15)
  limit?: number;
}

class ResolveGoogleUrlDto {
  @IsString()
  @MinLength(10)
  url!: string;
}

@Controller('places')
@UseGuards(AuthGuard('jwt'))
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('search')
  search(@Query() query: PlaceSearchQueryDto) {
    return this.placesService.search(query.q);
  }

  @Get('reverse')
  async reverse(@Query() query: PlaceReverseQueryDto) {
    return this.placesService.reverse(query.lat, query.lon);
  }

  @Get('nearby')
  nearby(@Query() query: PlaceNearbyQueryDto) {
    return this.placesService.nearby(query.lat, query.lon, query.limit);
  }

  @Post('resolve-google-url')
  resolveGoogleUrl(@Body() body: ResolveGoogleUrlDto) {
    return this.placesService.resolveGoogleUrl(body.url);
  }
}
