import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExperiencesService } from './experiences.service.js';
import {
  CreateExperienceDto,
  UpdateExperienceDto,
} from './dto/experience.dto.js';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ExperiencesController {
  constructor(private readonly experiencesService: ExperiencesService) {}

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
