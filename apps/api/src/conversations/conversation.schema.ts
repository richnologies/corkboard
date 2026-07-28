import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ _id: false })
export class ConversationMessageEmbed {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true, enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @Prop({ required: true })
  content!: string;

  @Prop({ type: [String], default: [] })
  photoKeys!: string[];

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: true })
  createdAt!: Date;
}

@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: [ConversationMessageEmbed], default: [] })
  messages!: ConversationMessageEmbed[];
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ ownerId: 1, updatedAt: -1 });
