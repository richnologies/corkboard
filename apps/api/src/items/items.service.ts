import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Item, ItemDocument } from './item.schema.js';
import { CreateItemDto, ItemQueryDto, UpdateItemDto } from './dto/item.dto.js';
import { SharingService } from '../sharing/sharing.service.js';
import { mapItem } from '../common/mappers.js';

@Injectable()
export class ItemsService {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @Inject(forwardRef(() => SharingService))
    private readonly sharingService: SharingService,
  ) {}

  async create(ownerId: string, dto: CreateItemDto) {
    const item = await this.itemModel.create({
      ownerId: new Types.ObjectId(ownerId),
      ...dto,
      status: dto.status ?? undefined,
    });
    return mapItem(item);
  }

  async findAll(userId: string, query: ItemQueryDto) {
    const sharedIds = await this.sharingService.findAccessibleItemIds(userId);
    const filter: FilterQuery<ItemDocument> = {
      $or: [
        { ownerId: new Types.ObjectId(userId) },
        ...(sharedIds.length
          ? [{ _id: { $in: sharedIds.map((id) => new Types.ObjectId(id)) } }]
          : []),
      ],
    };

    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.sourceType) filter['source.type'] = query.sourceType;
    if (query.referrerName) {
      filter['source.referrerName'] = new RegExp(query.referrerName, 'i');
    }
    if (query.tag) filter.tags = query.tag;
    if (query.city) filter['location.city'] = new RegExp(query.city, 'i');

    const items = await this.itemModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .exec();
    return items.map(mapItem);
  }

  async findOne(userId: string, itemId: string) {
    const item = await this.getAccessibleItem(userId, itemId);
    return mapItem(item);
  }

  async update(userId: string, itemId: string, dto: UpdateItemDto) {
    await this.assertCanEdit(userId, itemId);
    const item = await this.itemModel
      .findByIdAndUpdate(itemId, dto, { new: true })
      .exec();
    if (!item) throw new NotFoundException('Item not found');
    return mapItem(item);
  }

  async remove(userId: string, itemId: string) {
    await this.assertIsOwner(userId, itemId);
    await this.itemModel.findByIdAndDelete(itemId).exec();
  }

  async getAccessibleItem(
    userId: string,
    itemId: string,
  ): Promise<ItemDocument> {
    const item = await this.itemModel.findById(itemId).exec();
    if (!item) throw new NotFoundException('Item not found');

    const isOwner = String(item.ownerId) === userId;
    if (isOwner) return item;

    const share = await this.sharingService.findShare(itemId, userId);
    const permission = this.sharingService.getPermission(share, isOwner);
    if (!this.sharingService.canView(permission)) {
      throw new ForbiddenException('You do not have access to this item');
    }
    return item;
  }

  async assertCanEdit(userId: string, itemId: string): Promise<void> {
    const item = await this.itemModel.findById(itemId).exec();
    if (!item) throw new NotFoundException('Item not found');

    const isOwner = String(item.ownerId) === userId;
    const share = await this.sharingService.findShare(itemId, userId);
    const permission = this.sharingService.getPermission(share, isOwner);
    if (!this.sharingService.canEdit(permission)) {
      throw new ForbiddenException(
        'You do not have permission to edit this item',
      );
    }
  }

  async assertIsOwner(userId: string, itemId: string): Promise<void> {
    const item = await this.itemModel.findById(itemId).exec();
    if (!item) throw new NotFoundException('Item not found');
    if (String(item.ownerId) !== userId) {
      throw new ForbiddenException('Only the owner can perform this action');
    }
  }

  getOwnerId(item: ItemDocument): string {
    return String(item.ownerId);
  }
}
