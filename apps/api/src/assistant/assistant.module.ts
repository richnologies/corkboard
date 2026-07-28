import { Module } from '@nestjs/common';
import { ItemsModule } from '../items/items.module.js';
import { ExperiencesModule } from '../experiences/experiences.module.js';
import { PeopleModule } from '../people/people.module.js';
import { PlacesModule } from '../places/places.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [ItemsModule, ExperiencesModule, PeopleModule, PlacesModule, ConversationsModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
