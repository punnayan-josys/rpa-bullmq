import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { BullMqModule } from './bull-mq/bull-mq.module';
import { EventsModule } from './events/events.module';
import { PlaywrightService } from './playwright/playwright.service';

@Module({
  imports: [
    RedisModule,
    BullMqModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PlaywrightService,
  ],
})
export class AppModule {}
