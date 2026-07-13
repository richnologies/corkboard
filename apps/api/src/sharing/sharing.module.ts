import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemShare, ItemShareSchema } from './share.schema.js';
import { SharingService } from './sharing.service.js';
import { SharingController } from './sharing.controller.js';
import { UsersModule } from '../users/users.module.js';
import { ItemsModule } from '../items/items.module.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ItemShare.name, schema: ItemShareSchema },
    ]),
    UsersModule,
    forwardRef(() => ItemsModule),
    EmailModule,
  ],
  controllers: [SharingController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
