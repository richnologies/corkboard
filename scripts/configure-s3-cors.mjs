import { config } from 'dotenv';
import { resolve } from 'path';
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

config({ path: resolve(process.cwd(), '.env') });

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!region || !bucket || !accessKeyId || !secretAccessKey) {
  console.error(
    'Missing AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, or AWS_SECRET_ACCESS_KEY in .env',
  );
  process.exit(1);
}

const client = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

const corsRules = [
  {
    AllowedHeaders: ['*'],
    AllowedMethods: ['GET', 'PUT', 'HEAD'],
    AllowedOrigins: origins,
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3000,
  },
];

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: corsRules },
  }),
);

const applied = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
console.log(`Applied S3 CORS on s3://${bucket} (${region})`);
console.log(JSON.stringify(applied.CORSRules, null, 2));
