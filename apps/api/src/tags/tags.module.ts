import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Item, ItemSchema } from '../items/item.schema.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }]),
    SharingModule,
  ],
  controllers: [TagsController],
  providers: [TagsService],
})
export class TagsModule {}
