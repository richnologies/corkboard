import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExperiencesService } from './experiences.service.js';
import { ExperienceSearchService } from './experience-search.service.js';
import {
  CreateExperienceDto,
  UpdateExperienceDto,
} from './dto/experience.dto.js';
import { ExperienceSearchQueryDto } from './dto/experience-search.dto.js';
import { ExperienceCalendarQueryDto } from './dto/experience-calendar.dto.js';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ExperiencesController {
  constructor(
    private readonly experiencesService: ExperiencesService,
    private readonly experienceSearchService: ExperienceSearchService,
  ) {}

  @Get('experiences/search')
  search(@CurrentUser() user: AuthUser, @Query() query: ExperienceSearchQueryDto) {
    const limit = Math.min(parseInt(query.limit ?? '8', 10) || 8, 20);
    return this.experienceSearchService.search(user.userId, query.q, limit);
  }

  @Get('experiences/calendar')
  calendar(
    @CurrentUser() user: AuthUser,
    @Query() query: ExperienceCalendarQueryDto,
  ) {
    return this.experiencesService.findForCalendar(
      user.userId,
      query.from,
      query.to,
    );
  }

  @Post('items/:itemId/experiences')
  create(
    @CurrentUser() user: AuthUser,
    @Param('itemId') itemId: string,
    @Body() dto: CreateExperienceDto,
  ) {
    return this.experiencesService.create(user.userId, itemId, dto);
  }

  @Get('items/:itemId/experiences')
  findByItem(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.experiencesService.findByItem(user.userId, itemId);
  }

  @Patch('experiences/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    return this.experiencesService.update(user.userId, id, dto);
  }

  @Delete('experiences/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.experiencesService.remove(user.userId, id);
  }
}
