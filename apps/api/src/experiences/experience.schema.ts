import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ExperienceDocument = HydratedDocument<Experience>;

@Schema({ _id: false })
export class StructuredRatingEmbed {
  @Prop({ min: 0, max: 10 })
  food?: number;

  @Prop({ min: 0, max: 10 })
  service?: number;

  @Prop({ min: 0, max: 10 })
  atmosphere?: number;

  @Prop({ min: 0, max: 10 })
  valueForMoney?: number;

  @Prop({ min: 0, max: 10 })
  overall?: number;
}

@Schema({ _id: false })
export class ExperiencePhotoEmbed {
  @Prop({ required: true })
  key!: string;

  @Prop()
  notes?: string;
}

@Schema({ timestamps: true, collection: 'experiences' })
export class Experience {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  itemId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  visitedAt!: Date;

  @Prop({ type: StructuredRatingEmbed })
  rating?: StructuredRatingEmbed;

  @Prop()
  notes?: string;

  @Prop()
  wouldReturn?: boolean;

  @Prop({ type: [String], default: [] })
  companions!: string[];

  @Prop({ type: [ExperiencePhotoEmbed], default: [] })
  photos!: ExperiencePhotoEmbed[];
}

export const ExperienceSchema = SchemaFactory.createForClass(Experience);
ExperienceSchema.index({ itemId: 1, visitedAt: -1 });
