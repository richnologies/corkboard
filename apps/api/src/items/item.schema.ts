import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ItemCategory, ItemStatus, SourceType } from '@org/domain';
import { HydratedDocument, Types } from 'mongoose';

export type ItemDocument = HydratedDocument<Item>;

@Schema({ _id: false })
export class LocationEmbed {
  @Prop()
  address?: string;

  @Prop()
  city?: string;

  @Prop()
  region?: string;

  @Prop()
  country?: string;

  @Prop()
  latitude?: number;

  @Prop()
  longitude?: number;

  @Prop()
  placeId?: string;

  @Prop()
  googlePlaceId?: string;

  @Prop()
  googleMapsUrl?: string;
}

@Schema({ _id: false })
export class SourceEmbed {
  @Prop({ type: String, required: true, enum: Object.values(SourceType) })
  type!: SourceType;

  @Prop()
  referrerName?: string;

  @Prop()
  url?: string;

  @Prop()
  notes?: string;
}

@Schema({ timestamps: true, collection: 'items' })
export class Item {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, enum: Object.values(ItemCategory) })
  category!: ItemCategory;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ItemStatus),
    default: ItemStatus.Wishlist,
  })
  status!: ItemStatus;

  @Prop({ type: LocationEmbed })
  location?: LocationEmbed;

  @Prop({ type: [String], default: [] })
  links!: string[];

  @Prop({ type: [String], default: [] })
  photoKeys!: string[];

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: SourceEmbed })
  source?: SourceEmbed;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
ItemSchema.index({ ownerId: 1, status: 1 });
ItemSchema.index({ ownerId: 1, 'source.type': 1 });
ItemSchema.index({ ownerId: 1, 'source.referrerName': 1 });
ItemSchema.index({ tags: 1 });
