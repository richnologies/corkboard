import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { CatalogKind, ExperienceVisibility } from '@org/domain';
import { HydratedDocument, Types } from 'mongoose';

export type ExperienceDocument = HydratedDocument<Experience>;

@Schema({ _id: false })
export class StructuredRatingEmbed {
  @Prop({ min: 1, max: 5 })
  overall?: number;
}

@Schema({ _id: false })
export class ExperiencePhotoEmbed {
  @Prop({ required: true })
  key!: string;

  @Prop()
  thumbKey?: string;

  @Prop()
  notes?: string;

  @Prop()
  aiDescription?: string;
}

@Schema({ timestamps: true, collection: 'experiences' })
export class Experience {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'Item' })
  itemId!: Types.ObjectId;

  /** Denormalized shared catalog ref from the library entry */
  @Prop({ type: Types.ObjectId, index: true })
  catalogId?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(CatalogKind) })
  catalogKind?: CatalogKind;

  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  authorId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(ExperienceVisibility),
    default: ExperienceVisibility.Shared,
  })
  visibility!: ExperienceVisibility;

  @Prop({ type: [Types.ObjectId], default: [], ref: 'User' })
  participantUserIds!: Types.ObjectId[];

  @Prop({ required: true })
  visitedAt!: Date;

  @Prop({ type: StructuredRatingEmbed })
  rating?: StructuredRatingEmbed;

  @Prop()
  notes?: string;

  @Prop()
  wouldReturn?: boolean;

  @Prop({ type: [Types.ObjectId], default: [], ref: 'Person' })
  companionPersonIds!: Types.ObjectId[];

  /** Wine items tasted / linked during this visit */
  @Prop({ type: [Types.ObjectId], default: [], ref: 'Item', index: true })
  wineItemIds!: Types.ObjectId[];

  @Prop({ type: [ExperiencePhotoEmbed], default: [] })
  photos!: ExperiencePhotoEmbed[];

  @Prop()
  itemName?: string;

  @Prop()
  searchText?: string;

  @Prop({ type: [Number], default: undefined })
  searchEmbedding?: number[];

  @Prop()
  searchIndexedAt?: Date;
}

export const ExperienceSchema = SchemaFactory.createForClass(Experience);
ExperienceSchema.index({ itemId: 1, visitedAt: -1 });
ExperienceSchema.index({ catalogId: 1, visitedAt: -1 });
ExperienceSchema.index({ wineItemIds: 1, visitedAt: -1 });
ExperienceSchema.index({ authorId: 1, visitedAt: -1 });
ExperienceSchema.index({ participantUserIds: 1 });
ExperienceSchema.index({ searchText: 'text' });
