import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OpenAiModule } from '../openai/openai.module.js';
import { PlacesModule } from '../places/places.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  CatalogPlace,
  CatalogPlaceSchema,
} from './catalog-place.schema.js';
import {
  CatalogWine,
  CatalogWineSchema,
} from './catalog-wine.schema.js';
import { CatalogService } from './catalog.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CatalogPlace.name, schema: CatalogPlaceSchema },
      { name: CatalogWine.name, schema: CatalogWineSchema },
    ]),
    PlacesModule,
    StorageModule,
    OpenAiModule,
  ],
  providers: [CatalogService],
  exports: [CatalogService, MongooseModule],
})
export class CatalogModule {}
