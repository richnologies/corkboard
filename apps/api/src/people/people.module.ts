import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Item, ItemSchema } from '../items/item.schema.js';
import { Experience, ExperienceSchema } from '../experiences/experience.schema.js';
import { Person, PersonSchema } from './person.schema.js';
import { PeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Person.name, schema: PersonSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Experience.name, schema: ExperienceSchema },
    ]),
  ],
  controllers: [PeopleController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
