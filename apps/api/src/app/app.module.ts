import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { ItemsModule } from '../items/items.module.js';
import { ExperiencesModule } from '../experiences/experiences.module.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { EmailModule } from '../email/email.module.js';
import { HealthController } from '../health/health.controller.js';
import { TagsModule } from '../tags/tags.module.js';
import { RecommendationsModule } from '../recommendations/recommendations.module.js';
import { PlacesModule } from '../places/places.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    ItemsModule,
    ExperiencesModule,
    SharingModule,
    StorageModule,
    EmailModule,
    TagsModule,
    RecommendationsModule,
    PlacesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
