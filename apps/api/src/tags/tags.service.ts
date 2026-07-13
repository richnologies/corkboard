import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Item, ItemDocument } from '../items/item.schema.js';
import { SharingService } from '../sharing/sharing.service.js';

@Injectable()
export class TagsService {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    private readonly sharingService: SharingService,
  ) {}

  async findAllForUser(userId: string): Promise<{ tag: string; count: number }[]> {
    const sharedIds = await this.sharingService.findAccessibleItemIds(userId);
    const results = await this.itemModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          $or: [
            { ownerId: new Types.ObjectId(userId) },
            ...(sharedIds.length
              ? [{ _id: { $in: sharedIds.map((id) => new Types.ObjectId(id)) } }]
              : []),
          ],
          tags: { $exists: true, $ne: [] },
        },
      },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);

    return results.map((r) => ({ tag: r._id, count: r.count }));
  }
}
