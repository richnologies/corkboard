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
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';
import { PeopleService } from './people.service.js';
import {
  CreatePersonDto,
  PersonQueryDto,
  PersonSuggestQueryDto,
  UpdatePersonDto,
} from './dto/person.dto.js';

@Controller('people')
@UseGuards(AuthGuard('jwt'))
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: PersonQueryDto) {
    return this.peopleService.findAllForUser(user.userId, query);
  }

  @Get('suggest')
  suggest(@CurrentUser() user: AuthUser, @Query() query: PersonSuggestQueryDto) {
    return this.peopleService.suggest(user.userId, query.name);
  }

  @Get(':id/activity')
  activity(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.peopleService.getActivity(user.userId, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.peopleService.findById(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePersonDto) {
    return this.peopleService.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
  ) {
    return this.peopleService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.peopleService.remove(user.userId, id);
  }
}
