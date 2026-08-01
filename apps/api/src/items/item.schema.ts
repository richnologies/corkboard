import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ItemCategory, ItemStatus, SourceType } from '@org/domain';
import { HydratedDocument, Types } from 'mongoose';

export type ItemDocument = HydratedDocument<Item>;

@Schema({ _id: false })
export class LocationEmbed {
  @Prop()
  address?: string;

  @Prop()
  addressEn?: string;

  @Prop()
  addressEs?: string;

  @Prop()
  city?: string;

  @Prop()
  cityEn?: string;

  @Prop()
  cityEs?: string;

  @Prop()
  region?: string;

  @Prop()
  regionEn?: string;

  @Prop()
  regionEs?: string;

  @Prop()
  country?: string;

  @Prop()
  countryEn?: string;

  @Prop()
  countryEs?: string;

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
export class WineDetailsEmbed {
  @Prop()
  vivinoWineId?: string;

  @Prop()
  vivinoVintageId?: string;

  @Prop()
  vivinoUrl?: string;

  @Prop()
  winery?: string;

  @Prop({ type: [String], default: undefined })
  grapes?: string[];

  @Prop({ type: [String], default: undefined })
  grapesEn?: string[];

  @Prop({ type: [String], default: undefined })
  grapesEs?: string[];

  @Prop()
  region?: string;

  @Prop()
  regionEn?: string;

  @Prop()
  regionEs?: string;

  @Prop()
  country?: string;

  @Prop()
  countryEn?: string;

  @Prop()
  countryEs?: string;

  @Prop()
  style?: string;

  @Prop()
  styleEn?: string;

  @Prop()
  styleEs?: string;

  @Prop()
  alcoholPercentage?: number;

  @Prop({ type: [String], default: undefined })
  allergens?: string[];

  @Prop({ type: [String], default: undefined })
  allergensEn?: string[];

  @Prop({ type: [String], default: undefined })
  allergensEs?: string[];

  @Prop()
  description?: string;

  @Prop()
  descriptionEn?: string;

  @Prop()
  descriptionEs?: string;

  @Prop()
  price?: number;

  @Prop()
  priceCurrency?: string;

  @Prop()
  rating?: number;

  @Prop()
  year?: string;

  @Prop()
  imageUrl?: string;

  @Prop()
  imageKey?: string;
}

@Schema({ _id: false })
export class SourceEmbed {
  @Prop({ type: String, required: true, enum: Object.values(SourceType) })
  type!: SourceType;

  @Prop()
  referrerName?: string;

  @Prop({ type: Types.ObjectId })
  referrerPersonId?: Types.ObjectId;

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

  @Prop({ trim: true })
  nameEn?: string;

  @Prop({ trim: true })
  nameEs?: string;

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

  @Prop({ type: WineDetailsEmbed })
  wine?: WineDetailsEmbed;

  @Prop({ type: [String], default: [] })
  links!: string[];

  @Prop({ type: [String], default: [] })
  photoKeys!: string[];

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: SourceEmbed })
  source?: SourceEmbed;

  @Prop({ trim: true })
  rejectionReason?: string;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
ItemSchema.index({ ownerId: 1, status: 1 });
ItemSchema.index({ ownerId: 1, 'source.type': 1 });
ItemSchema.index({ ownerId: 1, 'source.referrerPersonId': 1 });
ItemSchema.index({ ownerId: 1, 'wine.vivinoWineId': 1 });
ItemSchema.index({ tags: 1 });
