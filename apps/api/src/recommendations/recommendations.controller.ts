import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RecommendationsService } from './recommendations.service.js';
import { RecommendationsQueryDto } from './dto/recommendations.dto.js';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';

@Controller('recommendations')
@UseGuards(AuthGuard('jwt'))
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get()
  suggest(
    @CurrentUser() user: AuthUser,
    @Query() query: RecommendationsQueryDto,
  ) {
    return this.recommendationsService.suggest(user.userId, query);
  }
}
