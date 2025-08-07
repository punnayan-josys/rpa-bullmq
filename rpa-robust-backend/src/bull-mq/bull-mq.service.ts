import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, QueueEvents, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class BullMqService implements OnModuleDestroy {
  private readonly logger = new Logger(BullMqService.name);
  private readonly queues: Map<string, Queue> = new Map();
  private readonly queueEvents: Map<string, QueueEvents> = new Map();
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // BullMQ requires this to be null
    });
  }

  async onModuleDestroy() {
    // Close all queues and events
    for (const [sessionId, queue] of this.queues) {
      await this.cleanupSessionQueue(sessionId);
    }
    await this.redis.quit();
  }

  /**
   * Get or create a queue for a specific session
   */
  async getQueue(sessionId: string): Promise<Queue> {
    if (this.queues.has(sessionId)) {
      return this.queues.get(sessionId)!;
    }

    const queueName = `rpa-session-${sessionId}`;
    const queue = new Queue(queueName, {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,           // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Create QueueEvents for monitoring
    const queueEvents = new QueueEvents(queueName, {
      connection: this.redis,
    });

    // Handle failed jobs
    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      this.logger.error(`Job ${jobId} failed for session ${sessionId}: ${failedReason}`);
      
      // If job has exhausted all retries, trigger session shutdown
      try {
        const job = await queue.getJob(jobId);
        if (job && job.attemptsMade >= job.opts.attempts) {
          this.logger.error(`Job ${jobId} permanently failed for session ${sessionId}. Triggering shutdown.`);
          // Emit event for session shutdown
          await this.redis.publish(`session-control:${sessionId}`, 'STOP');
        }
      } catch (error) {
        this.logger.error(`Error handling failed job ${jobId}:`, error);
      }
    });

    // Handle completed jobs
    queueEvents.on('completed', async ({ jobId }) => {
      this.logger.debug(`Job ${jobId} completed for session ${sessionId}`);
    });

    // Handle stalled jobs
    queueEvents.on('stalled', async ({ jobId }) => {
      this.logger.warn(`Job ${jobId} stalled for session ${sessionId}`);
    });

    this.queues.set(sessionId, queue);
    this.queueEvents.set(sessionId, queueEvents);

    this.logger.log(`Created queue for session: ${sessionId}`);
    return queue;
  }

  /**
   * Add a job to a session's queue
   */
  async addJob(sessionId: string, jobData: any, jobOptions?: any): Promise<Job> {
    const queue = await this.getQueue(sessionId);
    const job = await queue.add('rpa-step', jobData, {
      ...jobOptions,
      jobId: `${sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });
    
    this.logger.debug(`Added job ${job.id} to session ${sessionId}`);
    return job;
  }

  /**
   * Get job count for a session
   */
  async getJobCount(sessionId: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const queue = await this.getQueue(sessionId);
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }

  /**
   * Clean up all data for a session
   */
  async cleanupSessionQueue(sessionId: string): Promise<void> {
    const queue = this.queues.get(sessionId);
    const queueEvents = this.queueEvents.get(sessionId);

    if (queue) {
      try {
        // Obliterate the queue (removes all jobs and data)
        await queue.obliterate({ force: true });
        await queue.close();
        this.logger.log(`Obliterated queue for session: ${sessionId}`);
      } catch (error) {
        this.logger.error(`Error obliterating queue for session ${sessionId}:`, error);
      }
    }

    if (queueEvents) {
      try {
        await queueEvents.close();
      } catch (error) {
        this.logger.error(`Error closing queue events for session ${sessionId}:`, error);
      }
    }

    this.queues.delete(sessionId);
    this.queueEvents.delete(sessionId);
  }

  /**
   * Get all active session queues
   */
  getActiveQueues(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Check if a session has an active queue
   */
  hasQueue(sessionId: string): boolean {
    return this.queues.has(sessionId);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(sessionId: string): Promise<any> {
    const queue = this.queues.get(sessionId);
    if (!queue) {
      return null;
    }

    const jobCounts = await this.getJobCount(sessionId);
    const isActive = jobCounts.active > 0 || jobCounts.waiting > 0;

    return {
      sessionId,
      isActive,
      jobCounts,
      queueName: queue.name,
    };
  }

  /**
   * Pause a session's queue
   */
  async pauseQueue(sessionId: string): Promise<void> {
    const queue = this.queues.get(sessionId);
    if (queue) {
      await queue.pause();
      this.logger.log(`Paused queue for session: ${sessionId}`);
    }
  }

  /**
   * Resume a session's queue
   */
  async resumeQueue(sessionId: string): Promise<void> {
    const queue = this.queues.get(sessionId);
    if (queue) {
      await queue.resume();
      this.logger.log(`Resumed queue for session: ${sessionId}`);
    }
  }
}
