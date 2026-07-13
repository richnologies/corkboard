import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SharePermission } from '@org/domain';
import { HydratedDocument, Types } from 'mongoose';

export type ItemShareDocument = HydratedDocument<ItemShare>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'item_shares',
})
export class ItemShare {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  itemId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  sharedWithUserId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(SharePermission),
    default: SharePermission.View,
  })
  permission!: SharePermission;
}

export const ItemShareSchema = SchemaFactory.createForClass(ItemShare);
ItemShareSchema.index({ itemId: 1, sharedWithUserId: 1 }, { unique: true });
