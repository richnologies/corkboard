import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const aws = config.getOrThrow<{
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      s3Bucket: string;
    }>('app.aws');

    this.bucket = aws.s3Bucket;
    this.client = new S3Client({
      region: aws.region,
      credentials:
        aws.accessKeyId && aws.secretAccessKey
          ? {
              accessKeyId: aws.accessKeyId,
              secretAccessKey: aws.secretAccessKey,
            }
          : undefined,
    });
  }

  async createUploadUrl(
    userId: string,
    contentType: string,
    extension?: string,
  ): Promise<{ key: string; uploadUrl: string }> {
    const key = `users/${userId}/${randomUUID()}${extension ? `.${extension}` : ''}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: 900,
    });
    return { key, uploadUrl };
  }

  async createViewUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  assertUserKey(userId: string, key: string): void {
    const prefix = `users/${userId}/`;
    if (!key.startsWith(prefix)) {
      throw new Error('Invalid photo key');
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
