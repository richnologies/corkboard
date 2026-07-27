import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // /config/.env is the Docker bind-mount used in production
      envFilePath: ['.env.local', '.env', '/config/.env'],
    }),
  ],
})
export class AppConfigModule {}
