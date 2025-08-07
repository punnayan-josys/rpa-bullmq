import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { RedisModule } from '../redis/redis.module';
import { BullMqModule } from '../bull-mq/bull-mq.module';

@Module({
  imports: [RedisModule, BullMqModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
