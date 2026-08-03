import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { WineDetailsEmbed } from '../items/item.schema.js';

export type CatalogWineDocument = HydratedDocument<CatalogWine>;

@Schema({ timestamps: true, collection: 'catalog_wines' })
export class CatalogWine {
  /**
   * Primary external key: vivinoVintageId, or vivinoWineId, or `local:{slug}`.
   */
  @Prop({ required: true, unique: true, index: true })
  externalId!: string;

  @Prop({ index: true })
  vivinoWineId?: string;

  @Prop({ index: true })
  vivinoVintageId?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  nameEn?: string;

  @Prop({ trim: true })
  nameEs?: string;

  @Prop({ type: WineDetailsEmbed, required: true })
  wine!: WineDetailsEmbed;

  /** When ChatGPT web enrichment has been applied for this wine. */
  @Prop()
  enrichedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CatalogWineSchema = SchemaFactory.createForClass(CatalogWine);
CatalogWineSchema.index({ vivinoWineId: 1 });
CatalogWineSchema.index({ vivinoVintageId: 1 });
