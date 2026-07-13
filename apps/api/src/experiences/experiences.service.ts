import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Experience, ExperienceDocument } from './experience.schema.js';
import {
  CreateExperienceDto,
  UpdateExperienceDto,
} from './dto/experience.dto.js';
import { ItemsService } from '../items/items.service.js';
import { mapExperience } from '../common/mappers.js';
import { S3Service } from '../storage/s3.service.js';

@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    @Inject(forwardRef(() => ItemsService))
    private readonly itemsService: ItemsService,
    private readonly s3Service: S3Service,
  ) {}

  async create(userId: string, itemId: string, dto: CreateExperienceDto) {
    await this.itemsService.getAccessibleItem(userId, itemId);
    this.validatePhotoKeys(userId, dto.photos?.map((p) => p.key) ?? []);

    const experience = await this.experienceModel.create({
      itemId,
      userId,
      visitedAt: new Date(dto.visitedAt),
      rating: dto.rating,
      notes: dto.notes,
      wouldReturn: dto.wouldReturn,
      companions: dto.companions ?? [],
      photos: dto.photos ?? [],
    });
    return mapExperience(experience);
  }

  async findByItem(userId: string, itemId: string) {
    await this.itemsService.getAccessibleItem(userId, itemId);
    const experiences = await this.experienceModel
      .find({ itemId })
      .sort({ visitedAt: -1 })
      .exec();
    return experiences.map(mapExperience);
  }

  async update(userId: string, experienceId: string, dto: UpdateExperienceDto) {
    const experience = await this.experienceModel.findById(experienceId).exec();
    if (!experience) throw new NotFoundException('Experience not found');
    await this.itemsService.assertCanEdit(userId, String(experience.itemId));

    if (dto.photos !== undefined) {
      this.validatePhotoKeysForUpdate(userId, experience, dto.photos);
      const newKeys = new Set(dto.photos.map((p) => p.key));
      for (const old of experience.photos ?? []) {
        if (!newKeys.has(old.key)) {
          try {
            await this.s3Service.deleteObject(old.key);
          } catch {
            // ignore missing objects
          }
        }
      }
    }

    if (dto.visitedAt) experience.visitedAt = new Date(dto.visitedAt);
    if (dto.rating !== undefined) experience.rating = dto.rating;
    if (dto.notes !== undefined) experience.notes = dto.notes;
    if (dto.wouldReturn !== undefined) experience.wouldReturn = dto.wouldReturn;
    if (dto.companions !== undefined) experience.companions = dto.companions;
    if (dto.photos !== undefined) experience.photos = dto.photos;

    await experience.save();
    return mapExperience(experience);
  }

  async assertCanViewPhoto(userId: string, key: string): Promise<void> {
    try {
      this.s3Service.assertUserKey(userId, key);
      return;
    } catch {
      // not owned by this user — check shared item access
    }

    const experience = await this.experienceModel
      .findOne({ 'photos.key': key })
      .exec();
    if (!experience) {
      throw new BadRequestException('Invalid photo key');
    }

    await this.itemsService.getAccessibleItem(userId, String(experience.itemId));
  }

  async remove(userId: string, experienceId: string) {
    const experience = await this.experienceModel.findById(experienceId).exec();
    if (!experience) throw new NotFoundException('Experience not found');
    await this.itemsService.assertCanEdit(userId, String(experience.itemId));

    for (const photo of experience.photos ?? []) {
      try {
        await this.s3Service.deleteObject(photo.key);
      } catch {
        // ignore missing objects
      }
    }

    await this.experienceModel.findByIdAndDelete(experienceId).exec();
  }

  private validatePhotoKeys(userId: string, keys: string[]) {
    for (const key of keys) {
      try {
        this.s3Service.assertUserKey(userId, key);
      } catch {
        throw new BadRequestException(`Invalid photo key: ${key}`);
      }
    }
  }

  private validatePhotoKeysForUpdate(
    userId: string,
    experience: ExperienceDocument,
    photos: { key: string }[],
  ) {
    const existingKeys = new Set(experience.photos.map((p) => p.key));
    for (const photo of photos) {
      if (existingKeys.has(photo.key)) continue;
      try {
        this.s3Service.assertUserKey(userId, photo.key);
      } catch {
        throw new BadRequestException(`Invalid photo key: ${photo.key}`);
      }
    }
  }
}
