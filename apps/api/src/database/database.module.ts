import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.getOrThrow<string>('app.mongoUri');
        console.log('Connecting to MongoDB at:', uri);
        return { uri };
      },
    }),
  ],
})
export class DatabaseModule {}
