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
import { IsString } from 'class-validator';
import { ItemsService } from './items.service.js';
import {
  CreateItemDto,
  ItemQueryDto,
  PresignPhotoDto,
  UpdateItemDto,
} from './dto/item.dto.js';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator.js';
import { S3Service } from '../storage/s3.service.js';
import { ExperiencesService } from '../experiences/experiences.service.js';
import { buildItemHistory } from '../common/mappers.js';

class PhotoViewUrlQueryDto {
  @IsString()
  key!: string;
}

@Controller('items')
@UseGuards(AuthGuard('jwt'))
export class ItemsController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly experiencesService: ExperiencesService,
    private readonly s3Service: S3Service,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.itemsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ItemQueryDto) {
    return this.itemsService.findAll(user.userId, query);
  }

  @Post('photos/presign')
  presignPhoto(@CurrentUser() user: AuthUser, @Body() dto: PresignPhotoDto) {
    return this.s3Service.createUploadUrl(
      user.userId,
      dto.contentType,
      dto.extension,
      dto.variant,
    );
  }

  @Get('photos/view-url')
  async photoViewUrl(
    @CurrentUser() user: AuthUser,
    @Query() query: PhotoViewUrlQueryDto,
  ) {
    await this.experiencesService.assertCanViewPhoto(user.userId, query.key);
    const url = await this.s3Service.createViewUrl(query.key);
    return { url };
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.itemsService.findOne(user.userId, id);
  }

  @Get(':id/history')
  async history(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const item = await this.itemsService.findOne(user.userId, id);
    const experiences = await this.experiencesService.findByItem(
      user.userId,
      id,
    );
    return buildItemHistory(item, experiences);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.itemsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.itemsService.remove(user.userId, id);
  }
}
