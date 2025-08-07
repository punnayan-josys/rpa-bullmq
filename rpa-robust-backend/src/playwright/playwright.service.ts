import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { BullMqService } from '../bull-mq/bull-mq.service';
import { EventsGateway } from '../events/events.gateway';
import { v4 as uuidv4 } from 'uuid';

interface WorkerInfo {
  worker: Worker;
  sessionId: string;
  isProcessing: boolean;
  createdAt: Date;
}

@Injectable()
export class PlaywrightService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightService.name);
  private readonly managerId: string;
  private readonly maxWorkers: number;
  private readonly activeWorkers: Map<string, WorkerInfo> = new Map();
  private readonly workerCount = 0;

  constructor(
    private readonly redisService: RedisService,
    private readonly bullMqService: BullMqService,
    private readonly eventsGateway: EventsGateway,
  ) {
    this.managerId = uuidv4();
    this.maxWorkers = parseInt(process.env.MAX_WORKERS_PER_CONTAINER || '5', 10);
    this.logger.log(`Worker Manager initialized with ID: ${this.managerId}, Max Workers: ${this.maxWorkers}`);
  }

  async onModuleInit() {
    // Subscribe to new session announcements
    await this.redisService.subscribe('new-sessions-channel', (message) => {
      this.handleNewSession(message);
    });

    // Subscribe to session control messages
    await this.redisService.psubscribe('session-control:*', (channel, message) => {
      const sessionId = channel.split(':')[1];
      this.handleSessionControl(sessionId, message);
    });

    this.logger.log('Worker Manager subscribed to Redis channels');
  }

  async onModuleDestroy() {
    // Stop all active workers
    for (const [sessionId, workerInfo] of this.activeWorkers) {
      await this.stopWorker(sessionId);
    }
    this.logger.log('Worker Manager shutdown complete');
  }

  /**
   * Handle new session announcements
   */
  private async handleNewSession(sessionId: string) {
    this.logger.log(`Received new session announcement: ${sessionId}`);

    // Check if we have capacity
    if (this.activeWorkers.size >= this.maxWorkers) {
      this.logger.warn(`No capacity for session ${sessionId}. Current workers: ${this.activeWorkers.size}/${this.maxWorkers}`);
      return;
    }

    // Check if session is already being handled
    if (this.activeWorkers.has(sessionId)) {
      this.logger.warn(`Session ${sessionId} is already being handled by this manager`);
      return;
    }

    // Try to acquire the session lock
    const lockAcquired = await this.redisService.acquireSessionLock(sessionId, this.managerId);
    if (!lockAcquired) {
      this.logger.warn(`Failed to acquire lock for session ${sessionId}`);
      return;
    }

    this.logger.log(`Acquired lock for session ${sessionId}, spawning worker`);
    await this.spawnWorker(sessionId);
  }

  /**
   * Handle session control messages
   */
  private async handleSessionControl(sessionId: string, message: string) {
    this.logger.log(`Received control message for session ${sessionId}: ${message}`);

    if (message === 'STOP') {
      await this.stopWorker(sessionId);
    }
  }

  /**
   * Spawn a new worker for a session with crash recovery
   */
  private async spawnWorker(sessionId: string): Promise<void> {
    try {
      this.logger.log(`Spawning worker for session: ${sessionId}`);

      // CRASH RECOVERY: Check if session has existing history
      const sessionHistory = await this.redisService.getSessionHistory(sessionId);
      const sessionState = await this.redisService.getSessionState(sessionId);

      if (sessionHistory.length > 0) {
        this.logger.log(`CRASH RECOVERY: Session ${sessionId} has ${sessionHistory.length} historical steps. Rebuilding state...`);
        
        // Simulate rebuilding browser state from history
        await this.rebuildBrowserState(sessionId, sessionHistory);
        
        this.logger.log(`CRASH RECOVERY: Successfully rebuilt state for session ${sessionId}`);
      } else {
        this.logger.log(`New session ${sessionId}, no recovery needed`);
      }

      // Create the BullMQ Worker
      const queue = await this.bullMqService.getQueue(sessionId);
      const worker = new Worker(
        queue.name,
        async (job: Job) => {
          return await this.processRpaStep(job, sessionId);
        },
        {
          connection: this.bullMqService['redis'], // This redis instance now has maxRetriesPerRequest: null
          concurrency: 1, // Ensure FIFO processing
        }
      );

      // Handle worker events
      worker.on('completed', async (job: Job) => {
        this.logger.debug(`Worker completed job ${job.id} for session ${sessionId}`);
      });

      worker.on('failed', async (job: Job, err: Error) => {
        this.logger.error(`Worker failed job ${job.id} for session ${sessionId}:`, err);
      });

      worker.on('error', async (err: Error) => {
        this.logger.error(`Worker error for session ${sessionId}:`, err);
        await this.stopWorker(sessionId);
      });

      // Store worker info
      this.activeWorkers.set(sessionId, {
        worker,
        sessionId,
        isProcessing: false,
        createdAt: new Date(),
      });

      this.logger.log(`Successfully spawned worker for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error spawning worker for session ${sessionId}:`, error);
      await this.redisService.releaseSessionLock(sessionId, this.managerId);
    }
  }

  /**
   * Rebuild browser state from historical steps (Crash Recovery)
   */
  private async rebuildBrowserState(sessionId: string, history: any[]): Promise<void> {
    this.logger.log(`Rebuilding browser state for session ${sessionId} with ${history.length} steps`);

    // Sort history by timestamp to ensure correct order
    const sortedHistory = history.sort((a, b) => a.timestamp - b.timestamp);

    // Simulate browser state reconstruction
    for (const step of sortedHistory) {
      this.logger.debug(`Replaying step: ${step.action} for session ${sessionId}`);
      
      // Simulate the time it would take to execute the step
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update progress
      await this.redisService.updateSessionStatus(sessionId, 'recovering', `Replayed ${step.action}`);
    }

    this.logger.log(`Completed state reconstruction for session ${sessionId}`);
  }

  /**
   * Process an RPA step (Worker processor function)
   */
  private async processRpaStep(job: Job, sessionId: string): Promise<any> {
    const workerInfo = this.activeWorkers.get(sessionId);
    if (!workerInfo) {
      throw new Error(`No worker found for session ${sessionId}`);
    }

    workerInfo.isProcessing = true;
    const stepData = job.data;

    try {
      this.logger.log(`Processing RPA step for session ${sessionId}: ${stepData.action}`);

      // Simulate RPA work (in real implementation, this would use Playwright)
      await this.simulateRpaWork(stepData);

      // Log step completion to Redis (this is the crash recovery point)
      await this.redisService.logStepCompletion(sessionId, {
        id: job.id,
        action: stepData.action,
        data: stepData.data,
      });

      // Notify client via WebSocket
      const connectionId = await this.redisService.getConnectionId(sessionId);
      if (connectionId) {
        await this.eventsGateway.notifyStepCompleted(connectionId, {
          sessionId,
          stepId: job.id,
          action: stepData.action,
          status: 'completed',
          timestamp: Date.now(),
        });
      }

      this.logger.log(`Completed RPA step for session ${sessionId}: ${stepData.action}`);
      return { success: true, stepId: job.id };

    } catch (error) {
      this.logger.error(`Error processing RPA step for session ${sessionId}:`, error);
      
      // Update session status with error
      await this.redisService.updateSessionStatus(sessionId, 'error', error.message);
      
      throw error;
    } finally {
      workerInfo.isProcessing = false;
    }
  }

  /**
   * Simulate RPA work (replace with actual Playwright implementation)
   */
  private async simulateRpaWork(stepData: any): Promise<void> {
    const { action, data } = stepData;
    
    // Simulate different types of RPA actions
    switch (action) {
      case 'navigate':
        this.logger.debug(`Navigating to: ${data.url}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;
      
      case 'click':
        this.logger.debug(`Clicking element: ${data.selector}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        break;
      
      case 'type':
        this.logger.debug(`Typing text: ${data.text}`);
        await new Promise(resolve => setTimeout(resolve, 800));
        break;
      
      case 'wait':
        this.logger.debug(`Waiting for: ${data.condition}`);
        await new Promise(resolve => setTimeout(resolve, data.duration || 1000));
        break;
      
      default:
        this.logger.debug(`Executing action: ${action}`);
        await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Stop a worker and clean up
   */
  private async stopWorker(sessionId: string): Promise<void> {
    const workerInfo = this.activeWorkers.get(sessionId);
    if (!workerInfo) {
      this.logger.warn(`No worker found for session ${sessionId}`);
      return;
    }

    try {
      this.logger.log(`Stopping worker for session: ${sessionId}`);

      // Close the worker
      await workerInfo.worker.close();

      // Clean up session data
      await this.bullMqService.cleanupSessionQueue(sessionId);
      await this.redisService.cleanupSession(sessionId);

      // Release the lock
      await this.redisService.releaseSessionLock(sessionId, this.managerId);

      // Remove from active workers
      this.activeWorkers.delete(sessionId);

      this.logger.log(`Successfully stopped worker for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error stopping worker for session ${sessionId}:`, error);
    }
  }

  /**
   * Get worker statistics
   */
  getWorkerStats(): any {
    const activeWorkers = Array.from(this.activeWorkers.values());
    const processingWorkers = activeWorkers.filter(w => w.isProcessing);

    return {
      managerId: this.managerId,
      maxWorkers: this.maxWorkers,
      activeWorkers: this.activeWorkers.size,
      processingWorkers: processingWorkers.length,
      availableCapacity: this.maxWorkers - this.activeWorkers.size,
      sessions: activeWorkers.map(w => ({
        sessionId: w.sessionId,
        isProcessing: w.isProcessing,
        createdAt: w.createdAt,
      })),
    };
  }

  /**
   * Force stop all workers (for graceful shutdown)
   */
  async stopAllWorkers(): Promise<void> {
    this.logger.log('Stopping all workers...');
    const sessionIds = Array.from(this.activeWorkers.keys());
    
    for (const sessionId of sessionIds) {
      await this.stopWorker(sessionId);
    }
  }
}
