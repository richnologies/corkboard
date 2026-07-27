import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PersonType } from '@org/domain';
import { HydratedDocument, Types } from 'mongoose';

export type PersonDocument = HydratedDocument<Person>;

@Schema({ timestamps: true, collection: 'people' })
export class Person {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true, index: true })
  nameKey!: string;

  @Prop({ type: String, required: true, enum: Object.values(PersonType) })
  type!: PersonType;

  @Prop({ type: Types.ObjectId })
  linkedUserId?: Types.ObjectId;
}

export const PersonSchema = SchemaFactory.createForClass(Person);
PersonSchema.index({ ownerId: 1, nameKey: 1 }, { unique: true });
