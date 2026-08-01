import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { WineDetails } from '@org/domain';
import { WineSearchResult } from './vivino.js';

export type WineSearchCacheDocument = HydratedDocument<WineSearchCache>;
export type WineDetailsCacheDocument = HydratedDocument<WineDetailsCache>;

@Schema({ timestamps: true, collection: 'wine_search_cache' })
export class WineSearchCache {
  @Prop({ required: true, unique: true, index: true })
  queryKey!: string;

  @Prop({ type: [Object], default: [] })
  results!: WineSearchResult[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const WineSearchCacheSchema = SchemaFactory.createForClass(WineSearchCache);

@Schema({ timestamps: true, collection: 'wine_details_cache' })
export class WineDetailsCache {
  @Prop({ index: true })
  vivinoWineId?: string;

  @Prop({ required: true, unique: true, index: true })
  vivinoVintageId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: Object, required: true })
  wine!: WineDetails;

  /** When set, ChatGPT web enrichment has already been applied for this vintage. */
  @Prop()
  enrichedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WineDetailsCacheSchema =
  SchemaFactory.createForClass(WineDetailsCache);

WineDetailsCacheSchema.index({ vivinoWineId: 1 });
