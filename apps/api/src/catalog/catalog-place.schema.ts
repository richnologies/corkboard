import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ItemCategory } from '@org/domain';
import { HydratedDocument } from 'mongoose';
import {
  LocationEmbed,
  PlaceDetailsEmbed,
} from '../items/item.schema.js';

export type CatalogPlaceDocument = HydratedDocument<CatalogPlace>;

@Schema({ timestamps: true, collection: 'catalog_places' })
export class CatalogPlace {
  /** Google Place ID or `osm:{lat},{lon}` */
  @Prop({ required: true, unique: true, index: true })
  externalId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  nameEn?: string;

  @Prop({ trim: true })
  nameEs?: string;

  @Prop({ type: String, required: true, enum: Object.values(ItemCategory) })
  category!: ItemCategory;

  @Prop({ type: LocationEmbed, required: true })
  location!: LocationEmbed;

  @Prop({ type: PlaceDetailsEmbed })
  place?: PlaceDetailsEmbed;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CatalogPlaceSchema = SchemaFactory.createForClass(CatalogPlace);
