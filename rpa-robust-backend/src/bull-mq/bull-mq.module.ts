import { Module } from '@nestjs/common';
import { BullMqService } from './bull-mq.service';

@Module({
  providers: [BullMqService],
  exports: [BullMqService],
})
export class BullMqModule {}
