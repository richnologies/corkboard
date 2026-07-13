import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemShare, ItemShareDocument } from './share.schema.js';
import { SharePermission } from '@org/domain';
import { ShareItemDto } from './dto/share.dto.js';
import { UsersService } from '../users/users.service.js';
import { ItemsService } from '../items/items.service.js';
import { EmailService } from '../email/email.service.js';
import { mapShare } from '../common/mappers.js';

@Injectable()
export class SharingService {
  constructor(
    @InjectModel(ItemShare.name)
    private readonly shareModel: Model<ItemShareDocument>,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ItemsService))
    private readonly itemsService: ItemsService,
    private readonly emailService: EmailService,
  ) {}

  async shareItem(ownerId: string, itemId: string, dto: ShareItemDto) {
    await this.itemsService.assertIsOwner(ownerId, itemId);
    const recipient = await this.usersService.findByEmail(dto.email);
    if (!recipient) {
      throw new NotFoundException('User with that email was not found');
    }
    if (recipient.id === ownerId) {
      throw new BadRequestException('You cannot share an item with yourself');
    }

    const share = await this.shareModel
      .findOneAndUpdate(
        { itemId, sharedWithUserId: recipient.id },
        {
          itemId,
          ownerId,
          sharedWithUserId: recipient.id,
          permission: dto.permission,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    const owner = await this.usersService.findById(ownerId);
    const item = await this.itemsService.findOne(ownerId, itemId);
    if (owner) {
      await this.emailService.sendItemShared(
        recipient.email,
        owner.displayName,
        item.name,
      );
    }

    return mapShare(share!);
  }

  async listShares(ownerId: string, itemId: string) {
    await this.itemsService.assertIsOwner(ownerId, itemId);
    const shares = await this.shareModel.find({ itemId }).exec();
    return shares.map(mapShare);
  }

  async revokeShare(ownerId: string, itemId: string, sharedWithUserId: string) {
    await this.itemsService.assertIsOwner(ownerId, itemId);
    await this.shareModel.deleteOne({ itemId, sharedWithUserId }).exec();
  }

  findAccessibleItemIds(userId: string): Promise<string[]> {
    return this.shareModel
      .find({ sharedWithUserId: userId })
      .distinct('itemId')
      .exec()
      .then((ids) => ids.map(String));
  }

  findShare(itemId: string, userId: string): Promise<ItemShareDocument | null> {
    return this.shareModel.findOne({ itemId, sharedWithUserId: userId }).exec();
  }

  getPermission(
    share: ItemShareDocument | null,
    isOwner: boolean,
  ): 'owner' | SharePermission | null {
    if (isOwner) return 'owner';
    return share?.permission ?? null;
  }

  canView(permission: 'owner' | SharePermission | null): boolean {
    return (
      permission === 'owner' ||
      permission === SharePermission.View ||
      permission === SharePermission.Edit
    );
  }

  canEdit(permission: 'owner' | SharePermission | null): boolean {
    return permission === 'owner' || permission === SharePermission.Edit;
  }
}
