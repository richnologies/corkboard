import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const VIEW_URL_TTL_SECONDS = 3600;
const UPLOAD_URL_TTL_SECONDS = 900;

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const aws = config.getOrThrow<{
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      s3Bucket: string;
    }>('app.aws');

    if (!aws.accessKeyId || !aws.secretAccessKey) {
      throw new Error(
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for photo uploads. ' +
          'Copy .env.example to .env in the repo root and set your AWS credentials.',
      );
    }

    this.bucket = aws.s3Bucket;
    this.client = new S3Client({
      region: aws.region,
      credentials: {
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
      },
      // Presigned browser PUT uploads cannot satisfy SDK checksum query params.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Photo storage: s3://${this.bucket}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot access S3 bucket "${this.bucket}". ` +
          'Check AWS credentials and that AWS_REGION matches the bucket location. ' +
          message,
      );
    }
  }

  userPrefix(userId: string): string {
    return `users/${userId}/`;
  }

  async createUploadUrl(
    userId: string,
    contentType: string,
    extension?: string,
    variant?: 'thumb',
  ): Promise<{ key: string; uploadUrl: string }> {
    const id = randomUUID();
    const key =
      variant === 'thumb'
        ? `${this.userPrefix(userId)}photos/thumbs/${id}.jpg`
        : `${this.userPrefix(userId)}photos/${id}${
            extension?.replace(/^\./, '').toLowerCase()
              ? `.${extension.replace(/^\./, '').toLowerCase()}`
              : ''
          }`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: variant === 'thumb' ? 'image/jpeg' : contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
    return { key, uploadUrl };
  }

  async createViewUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: VIEW_URL_TTL_SECONDS,
    });
  }

  /** Shared catalog object key for a cached wine bottle image. */
  catalogWineImageKey(vintageId: string, extension = 'jpg'): string {
    const safeId = vintageId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = extension.replace(/^\./, '').toLowerCase() || 'jpg';
    return `catalog/wines/${safeId}.${ext}`;
  }

  isCatalogWineKey(key: string): boolean {
    return key.startsWith('catalog/wines/');
  }

  async putObjectBuffer(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /**
   * Download a remote image and store it under the given key.
   * Returns the content type used.
   */
  async putObjectFromUrl(key: string, sourceUrl: string): Promise<string> {
    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          process.env.VIVINO_USER_AGENT ??
          'Mozilla/5.0 (compatible; Malviviendo/1.0)',
        Accept: 'image/*,*/*',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download image (${response.status}) from ${sourceUrl.slice(0, 120)}`,
      );
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throw new Error('Downloaded image was empty');
    }

    await this.putObjectBuffer(key, buffer, contentType);
    return contentType;
  }

  assertUserKey(userId: string, key: string): void {
    const prefix = this.userPrefix(userId);
    if (!key.startsWith(prefix)) {
      throw new Error('Invalid photo key');
    }
  }

  ownerIdFromKey(key: string): string | null {
    const match = key.match(/^users\/([^/]+)\//);
    return match?.[1] ?? null;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
