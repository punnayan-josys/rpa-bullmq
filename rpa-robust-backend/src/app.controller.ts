import { Controller, Get, Param, Post, Body, Logger, Query, Delete } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { BullMqService } from './bull-mq/bull-mq.service';
import { PlaywrightService } from './playwright/playwright.service';
import { EventsGateway } from './events/events.gateway';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly bullMqService: BullMqService,
    private readonly playwrightService: PlaywrightService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  @Get()
  getHello(): string {
    return 'RPA Backend is running! 🚀';
  }

  @Get('health')
  getHealth(): any {
    return {
      status: 'healthy',
      timestamp: Date.now(),
      services: {
        redis: 'connected',
        bullmq: 'active',
        playwright: 'running',
      },
    };
  }

  // ========================================
  // REDIS TESTING ENDPOINTS
  // ========================================

  @Post('test/redis/session')
  async testRedisSession(@Body() data: { sessionId: string; connectionId: string }) {
    try {
      await this.redisService.setConnectionId(data.sessionId, data.connectionId);
      await this.redisService.updateSessionStatus(data.sessionId, 'active');
      
      return {
        success: true,
        message: 'Session created in Redis',
        sessionId: data.sessionId,
        connectionId: data.connectionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Redis session test failed:', error);
      throw error;
    }
  }

  @Post('test/redis/step')
  async testRedisStep(@Body() data: { sessionId: string; step: any }) {
    try {
      await this.redisService.logStepCompletion(data.sessionId, data.step);
      
      return {
        success: true,
        message: 'Step logged to Redis',
        sessionId: data.sessionId,
        step: data.step,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Redis step test failed:', error);
      throw error;
    }
  }

  @Get('test/redis/lock/:sessionId/:managerId')
  async testRedisLock(@Param('sessionId') sessionId: string, @Param('managerId') managerId: string) {
    try {
      const acquired = await this.redisService.acquireSessionLock(sessionId, managerId);
      
      if (acquired) {
        // Release lock after 5 seconds for testing
        setTimeout(async () => {
          await this.redisService.releaseSessionLock(sessionId, managerId);
          this.logger.log(`Lock released for session ${sessionId}`);
        }, 5000);
      }
      
      return {
        success: true,
        sessionId,
        managerId,
        lockAcquired: acquired,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Redis lock test failed:', error);
      throw error;
    }
  }

  @Post('test/redis/publish')
  async testRedisPublish(@Body() data: { channel: string; message: string }) {
    try {
      const subscribers = await this.redisService.publish(data.channel, data.message);
      
      return {
        success: true,
        channel: data.channel,
        message: data.message,
        subscribers,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Redis publish test failed:', error);
      throw error;
    }
  }

  // ========================================
  // BULLMQ TESTING ENDPOINTS
  // ========================================

  @Post('test/bullmq/queue')
  async testBullMqQueue(@Body() data: { sessionId: string; jobData: any }) {
    try {
      const job = await this.bullMqService.addJob(data.sessionId, data.jobData);
      const jobCounts = await this.bullMqService.getJobCount(data.sessionId);
      
      return {
        success: true,
        message: 'Job added to queue',
        sessionId: data.sessionId,
        jobId: job.id,
        jobData: data.jobData,
        jobCounts,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('BullMQ queue test failed:', error);
      throw error;
    }
  }

  @Get('test/bullmq/stats/:sessionId')
  async testBullMqStats(@Param('sessionId') sessionId: string) {
    try {
      const stats = await this.bullMqService.getQueueStats(sessionId);
      const jobCounts = await this.bullMqService.getJobCount(sessionId);
      
      return {
        success: true,
        sessionId,
        stats,
        jobCounts,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('BullMQ stats test failed:', error);
      throw error;
    }
  }

  @Post('test/bullmq/pause/:sessionId')
  async testBullMqPause(@Param('sessionId') sessionId: string) {
    try {
      await this.bullMqService.pauseQueue(sessionId);
      
      return {
        success: true,
        message: 'Queue paused',
        sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('BullMQ pause test failed:', error);
      throw error;
    }
  }

  @Post('test/bullmq/resume/:sessionId')
  async testBullMqResume(@Param('sessionId') sessionId: string) {
    try {
      await this.bullMqService.resumeQueue(sessionId);
      
      return {
        success: true,
        message: 'Queue resumed',
        sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('BullMQ resume test failed:', error);
      throw error;
    }
  }

  // ========================================
  // WORKER MANAGER TESTING ENDPOINTS
  // ========================================

  @Get('test/worker/stats')
  async testWorkerStats() {
    try {
      const stats = this.playwrightService.getWorkerStats();
      
      return {
        success: true,
        workerStats: stats,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Worker stats test failed:', error);
      throw error;
    }
  }

  @Post('test/worker/simulate-crash/:sessionId')
  async testWorkerCrash(@Param('sessionId') sessionId: string) {
    try {
      // Simulate a crash by publishing a STOP signal
      await this.redisService.publish(`session-control:${sessionId}`, 'STOP');
      
      return {
        success: true,
        message: 'Crash simulation triggered',
        sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Worker crash test failed:', error);
      throw error;
    }
  }

  @Post('test/worker/announce-session')
  async testWorkerAnnouncement(@Body() data: { sessionId: string }) {
    try {
      // Announce a new session to test worker claiming
      await this.redisService.publish('new-sessions-channel', data.sessionId);
      
      return {
        success: true,
        message: 'Session announcement sent',
        sessionId: data.sessionId,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Worker announcement test failed:', error);
      throw error;
    }
  }

  // ========================================
  // CRASH RECOVERY TESTING ENDPOINTS
  // ========================================

  @Post('test/recovery/setup/:sessionId')
  async testRecoverySetup(@Param('sessionId') sessionId: string) {
    try {
      // Create a session with some history for recovery testing
      const steps = [
        { action: 'navigate', data: { url: 'https://example.com' } },
        { action: 'click', data: { selector: '#button1' } },
        { action: 'type', data: { text: 'Hello World', selector: '#input1' } },
        { action: 'wait', data: { duration: 2000 } },
      ];

      for (const step of steps) {
        await this.redisService.logStepCompletion(sessionId, {
          id: `step-${Date.now()}`,
          action: step.action,
          data: step.data,
        });
      }

      const history = await this.redisService.getSessionHistory(sessionId);
      
      return {
        success: true,
        message: 'Recovery test data created',
        sessionId,
        stepsCreated: steps.length,
        history,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Recovery setup test failed:', error);
      throw error;
    }
  }

  @Get('test/recovery/history/:sessionId')
  async testRecoveryHistory(@Param('sessionId') sessionId: string) {
    try {
      const history = await this.redisService.getSessionHistory(sessionId);
      const state = await this.redisService.getSessionState(sessionId);
      
      return {
        success: true,
        sessionId,
        history,
        state,
        historyCount: history.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Recovery history test failed:', error);
      throw error;
    }
  }

  // ========================================
  // SESSION MANAGEMENT TESTING ENDPOINTS
  // ========================================

  @Get('sessions')
  async getAllSessions(): Promise<any> {
    try {
      const activeSessions = await this.redisService.getActiveSessions();
      const sessionDetails = await Promise.all(
        activeSessions.map(async (sessionId) => {
          const [state, jobCounts] = await Promise.all([
            this.redisService.getSessionState(sessionId),
            this.bullMqService.getJobCount(sessionId),
          ]);
          return {
            sessionId,
            state,
            jobCounts,
          };
        })
      );

      return {
        totalSessions: activeSessions.length,
        sessions: sessionDetails,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Error getting all sessions:', error);
      throw error;
    }
  }

  @Get('session/:sessionId/history')
  async getSessionHistory(@Param('sessionId') sessionId: string): Promise<any> {
    try {
      const history = await this.redisService.getSessionHistory(sessionId);
      const state = await this.redisService.getSessionState(sessionId);

      return {
        sessionId,
        history,
        state,
        count: history.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error getting history for session ${sessionId}:`, error);
      throw error;
    }
  }

  @Get('session/:sessionId/completed')
  async getSessionCompleted(@Param('sessionId') sessionId: string): Promise<any> {
    try {
      const jobCounts = await this.bullMqService.getJobCount(sessionId);
      const state = await this.redisService.getSessionState(sessionId);

      return {
        sessionId,
        jobCounts,
        state,
        isActive: jobCounts.active > 0 || jobCounts.waiting > 0,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error getting completed status for session ${sessionId}:`, error);
      throw error;
    }
  }

  @Get('session/:sessionId/status')
  async getSessionStatus(@Param('sessionId') sessionId: string): Promise<any> {
    try {
      const [state, jobCounts, queueStats] = await Promise.all([
        this.redisService.getSessionState(sessionId),
        this.bullMqService.getJobCount(sessionId),
        this.bullMqService.getQueueStats(sessionId),
      ]);

      return {
        sessionId,
        state,
        jobCounts,
        queueStats,
        isActive: await this.redisService.isSessionActive(sessionId),
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error getting status for session ${sessionId}:`, error);
      throw error;
    }
  }

  @Post('session/:sessionId/cleanup')
  async cleanupSession(@Param('sessionId') sessionId: string): Promise<any> {
    try {
      await this.redisService.cleanupSession(sessionId);
      await this.bullMqService.cleanupSessionQueue(sessionId);

      return {
        sessionId,
        status: 'cleaned',
        message: 'Session data cleaned up successfully',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error cleaning up session ${sessionId}:`, error);
      throw error;
    }
  }

  // ========================================
  // RPA STEP TESTING ENDPOINTS
  // ========================================

  @Post('test/step')
  async testStep(@Body() stepData: any): Promise<any> {
    try {
      const testSessionId = 'test-session-' + Date.now();
      
      // Create a test session
      await this.redisService.updateSessionStatus(testSessionId, 'test');
      
      // Add a test job
      const job = await this.bullMqService.addJob(testSessionId, stepData);
      
      return {
        sessionId: testSessionId,
        jobId: job.id,
        stepData,
        status: 'test_job_created',
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Error creating test step:', error);
      throw error;
    }
  }

  @Post('test/rpa/navigate')
  async testRpaNavigate(@Body() data: { sessionId: string; url: string }): Promise<any> {
    try {
      const step = {
        action: 'navigate',
        data: { url: data.url },
        timestamp: Date.now(),
      };

      const job = await this.bullMqService.addJob(data.sessionId, step);
      
      return {
        success: true,
        sessionId: data.sessionId,
        jobId: job.id,
        step,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('RPA navigate test failed:', error);
      throw error;
    }
  }

  @Post('test/rpa/click')
  async testRpaClick(@Body() data: { sessionId: string; selector: string }): Promise<any> {
    try {
      const step = {
        action: 'click',
        data: { selector: data.selector },
        timestamp: Date.now(),
      };

      const job = await this.bullMqService.addJob(data.sessionId, step);
      
      return {
        success: true,
        sessionId: data.sessionId,
        jobId: job.id,
        step,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('RPA click test failed:', error);
      throw error;
    }
  }

  @Post('test/rpa/type')
  async testRpaType(@Body() data: { sessionId: string; text: string; selector: string }): Promise<any> {
    try {
      const step = {
        action: 'type',
        data: { text: data.text, selector: data.selector },
        timestamp: Date.now(),
      };

      const job = await this.bullMqService.addJob(data.sessionId, step);
      
      return {
        success: true,
        sessionId: data.sessionId,
        jobId: job.id,
        step,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('RPA type test failed:', error);
      throw error;
    }
  }

  // ========================================
  // SYSTEM MONITORING ENDPOINTS
  // ========================================

  @Get('workers/stats')
  async getWorkerStats(): Promise<any> {
    try {
      const workerStats = this.playwrightService.getWorkerStats();
      const activeSessions = this.eventsGateway.getActiveSessions();

      return {
        workerStats,
        activeSessions,
        totalActiveSessions: activeSessions.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Error getting worker stats:', error);
      throw error;
    }
  }

  @Get('system/info')
  async getSystemInfo(): Promise<any> {
    try {
      const [activeSessions, workerStats, activeQueues] = await Promise.all([
        this.redisService.getActiveSessions(),
        Promise.resolve(this.playwrightService.getWorkerStats()),
        Promise.resolve(this.bullMqService.getActiveQueues()),
      ]);

      return {
        system: {
          activeSessions: activeSessions.length,
          activeQueues: activeQueues.length,
          workerStats,
        },
        redis: {
          connected: true,
          activeSessions,
        },
        bullmq: {
          activeQueues,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Error getting system info:', error);
      throw error;
    }
  }

  // ========================================
  // COMPREHENSIVE TESTING ENDPOINTS
  // ========================================

  @Post('test/full-workflow')
  async testFullWorkflow(@Body() data: { sessionId: string }): Promise<any> {
    try {
      const sessionId = data.sessionId || 'workflow-test-' + Date.now();
      
      // 1. Create session
      await this.redisService.updateSessionStatus(sessionId, 'active');
      
      // 2. Add multiple RPA steps
      const steps = [
        { action: 'navigate', data: { url: 'https://example.com' } },
        { action: 'wait', data: { duration: 1000 } },
        { action: 'click', data: { selector: '#login-button' } },
        { action: 'type', data: { text: 'testuser', selector: '#username' } },
        { action: 'type', data: { text: 'password123', selector: '#password' } },
        { action: 'click', data: { selector: '#submit' } },
        { action: 'wait', data: { duration: 2000 } },
      ];

      const jobs = [];
      for (const step of steps) {
        const job = await this.bullMqService.addJob(sessionId, step);
        jobs.push({ step, jobId: job.id });
      }

      // 3. Get final stats
      const [jobCounts, history] = await Promise.all([
        this.bullMqService.getJobCount(sessionId),
        this.redisService.getSessionHistory(sessionId),
      ]);

      return {
        success: true,
        message: 'Full workflow test completed',
        sessionId,
        stepsCreated: steps.length,
        jobs,
        jobCounts,
        historyCount: history.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Full workflow test failed:', error);
      throw error;
    }
  }

  @Post('test/crash-recovery-simulation')
  async testCrashRecoverySimulation(@Body() data: { sessionId: string }): Promise<any> {
    try {
      const sessionId = data.sessionId || 'crash-test-' + Date.now();
      
      // 1. Create session with history
      await this.redisService.updateSessionStatus(sessionId, 'active');
      
      // 2. Add some steps to create history
      const steps = [
        { action: 'navigate', data: { url: 'https://google.com' } },
        { action: 'type', data: { text: 'test search', selector: 'input[name="q"]' } },
        { action: 'click', data: { selector: 'input[name="btnK"]' } },
      ];

      for (const step of steps) {
        await this.redisService.logStepCompletion(sessionId, {
          id: `step-${Date.now()}`,
          action: step.action,
          data: step.data,
        });
      }

      // 3. Simulate crash by publishing STOP signal
      await this.redisService.publish(`session-control:${sessionId}`, 'STOP');
      
      // 4. Wait a moment, then announce new session (simulating recovery)
      setTimeout(async () => {
        await this.redisService.publish('new-sessions-channel', sessionId);
      }, 2000);

      const history = await this.redisService.getSessionHistory(sessionId);
      
      return {
        success: true,
        message: 'Crash recovery simulation initiated',
        sessionId,
        stepsCreated: steps.length,
        historyCount: history.length,
        recoveryTriggered: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Crash recovery simulation failed:', error);
      throw error;
    }
  }

  @Delete('test/cleanup-all')
  async cleanupAllTestData(): Promise<any> {
    try {
      const activeSessions = await this.redisService.getActiveSessions();
      const cleanupResults = [];

      for (const sessionId of activeSessions) {
        if (sessionId.startsWith('test-') || sessionId.startsWith('workflow-') || sessionId.startsWith('crash-')) {
          await this.redisService.cleanupSession(sessionId);
          await this.bullMqService.cleanupSessionQueue(sessionId);
          cleanupResults.push({ sessionId, status: 'cleaned' });
        }
      }

      return {
        success: true,
        message: 'All test data cleaned up',
        sessionsCleaned: cleanupResults.length,
        cleanupResults,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Cleanup all test data failed:', error);
      throw error;
    }
  }
}
