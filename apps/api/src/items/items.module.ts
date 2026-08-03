import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Item, ItemSchema } from './item.schema.js';
import { ItemsService } from './items.service.js';
import { ItemsController } from './items.controller.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ExperiencesModule } from '../experiences/experiences.module.js';
import { PeopleModule } from '../people/people.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }]),
    forwardRef(() => SharingModule),
    StorageModule,
    forwardRef(() => ExperiencesModule),
    PeopleModule,
    CatalogModule,
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
