import { Test, TestingModule } from '@nestjs/testing';
import { BullMqService } from './bull-mq.service';

describe('BullMqService', () => {
  let service: BullMqService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BullMqService],
    }).compile();

    service = module.get<BullMqService>(BullMqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
