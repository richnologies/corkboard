import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ItemsModule } from '../items/items.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  WineDetailsCache,
  WineDetailsCacheSchema,
  WineSearchCache,
  WineSearchCacheSchema,
} from './wine-cache.schema.js';
import { WinesController } from './wines.controller.js';
import { WinesService } from './wines.service.js';

@Module({
  imports: [
    ItemsModule,
    CatalogModule,
    StorageModule,
    MongooseModule.forFeature([
      { name: WineSearchCache.name, schema: WineSearchCacheSchema },
      { name: WineDetailsCache.name, schema: WineDetailsCacheSchema },
    ]),
  ],
  controllers: [WinesController],
  providers: [WinesService],
  exports: [WinesService],
})
export class WinesModule {}
