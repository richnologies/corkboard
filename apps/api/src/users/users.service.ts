import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  create(
    data: Pick<User, 'email' | 'passwordHash' | 'displayName'>,
  ): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  findByIds(ids: string[]): Promise<UserDocument[]> {
    return this.userModel.find({ _id: { $in: ids } }).exec();
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, { passwordHash }, { new: true })
      .exec();
  }
}
