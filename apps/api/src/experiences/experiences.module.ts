import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Experience, ExperienceSchema } from './experience.schema.js';
import { ExperiencesService } from './experiences.service.js';
import { ExperiencesController } from './experiences.controller.js';
import { ExperienceSearchIndexService } from './experience-search-index.service.js';
import { ExperienceSearchService } from './experience-search.service.js';
import { ItemsModule } from '../items/items.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { PeopleModule } from '../people/people.module.js';
import { UsersModule } from '../users/users.module.js';
import { SharingModule } from '../sharing/sharing.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Experience.name, schema: ExperienceSchema },
    ]),
    forwardRef(() => ItemsModule),
    StorageModule,
    PeopleModule,
    UsersModule,
    forwardRef(() => SharingModule),
  ],
  controllers: [ExperiencesController],
  providers: [
    ExperiencesService,
    ExperienceSearchIndexService,
    ExperienceSearchService,
  ],
  exports: [ExperiencesService, ExperienceSearchService],
})
export class ExperiencesModule {}
