import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  jwtSecret: process.env['JWT_SECRET'] ?? 'change-me-in-production',
  jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
  mongoUri: process.env['MONGODB_URI'] ?? 'mongodb://corkboard:a7K9mP2xR8vN4dQ5tL3wC6jH1yF7@r4.ricardosanchez.dev:48231/corkboard',
  aws: {
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    s3Bucket: process.env['AWS_S3_BUCKET'] ?? 'corkboard-uploads',
    sesFromEmail: process.env['AWS_SES_FROM_EMAIL'] ?? 'noreply@corkboard.app',
  },
  corsOrigins: (process.env['CORS_ORIGINS'] ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim()),
  nominatimUserAgent:
    process.env['NOMINATIM_USER_AGENT'] ??
    'Malviviendo/1.0 (personal recommendations app)',
  google: {
    mapsApiKey: process.env['GOOGLE_MAPS_API_KEY'],
  },
  openai: {
    apiKey: process.env['OPENAI_API_KEY'],
    model: process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
    embeddingModel:
      process.env['OPENAI_EMBEDDING_MODEL'] ?? 'text-embedding-3-small',
  },
}));
