import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { BullMqService } from '../bull-mq/bull-mq.service';
import { v4 as uuidv4 } from 'uuid';

interface RpaStep {
  action: string;
  data: any;
  timestamp?: number;
}

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  namespace: '/rpa'
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private readonly clientSessions: Map<string, string> = new Map(); // connectionId -> sessionId

  constructor(
    private readonly redisService: RedisService,
    private readonly bullMqService: BullMqService,
  ) {}

  async handleConnection(client: Socket) {
    const connectionId = client.id;
    const sessionId = uuidv4();
    
    this.logger.log(`Client connected: ${connectionId}, assigned session: ${sessionId}`);
    
    // Store the session mapping
    this.clientSessions.set(connectionId, sessionId);
    
    // Store connection ID in Redis
    await this.redisService.setConnectionId(sessionId, connectionId);
    
    // Initialize session state
    await this.redisService.updateSessionStatus(sessionId, 'connected');
    
    // Announce new session to worker managers
    await this.redisService.publish('new-sessions-channel', sessionId);
    
    // Send session info to client
    client.emit('sessionCreated', {
      sessionId,
      connectionId,
      status: 'connected',
      timestamp: Date.now(),
    });
    
    this.logger.log(`Session ${sessionId} created and announced to worker managers`);
  }

  async handleDisconnect(client: Socket) {
    const connectionId = client.id;
    const sessionId = this.clientSessions.get(connectionId);
    
    if (sessionId) {
      this.logger.log(`Client disconnected: ${connectionId}, session: ${sessionId}`);
      
      // Publish STOP signal to trigger graceful shutdown
      await this.redisService.publish(`session-control:${sessionId}`, 'STOP');
      
      // Clean up client mapping
      this.clientSessions.delete(connectionId);
      
      this.logger.log(`Session ${sessionId} shutdown signal sent`);
    }
  }

  @SubscribeMessage('recordStep')
  async handleRecordStep(
    @ConnectedSocket() client: Socket,
    @MessageBody() step: RpaStep,
  ) {
    const connectionId = client.id;
    const sessionId = this.clientSessions.get(connectionId);
    
    if (!sessionId) {
      client.emit('error', { message: 'No active session found' });
      return;
    }

    try {
      this.logger.log(`Recording step for session ${sessionId}: ${step.action}`);
      
      // Add timestamp if not provided
      const stepWithTimestamp = {
        ...step,
        timestamp: step.timestamp || Date.now(),
      };
      
      // Add job to the session's queue
      const job = await this.bullMqService.addJob(sessionId, stepWithTimestamp, {
        priority: 1,
        delay: 0,
      });
      
      // Acknowledge step received
      client.emit('stepQueued', {
        sessionId,
        stepId: job.id,
        action: step.action,
        status: 'queued',
        timestamp: Date.now(),
      });
      
      this.logger.log(`Step queued for session ${sessionId}: ${step.action} (Job ID: ${job.id})`);
      
    } catch (error) {
      this.logger.error(`Error recording step for session ${sessionId}:`, error);
      client.emit('error', { 
        message: 'Failed to record step',
        error: error.message 
      });
    }
  }

  @SubscribeMessage('getSessionStatus')
  async handleGetSessionStatus(@ConnectedSocket() client: Socket) {
    const connectionId = client.id;
    const sessionId = this.clientSessions.get(connectionId);
    
    if (!sessionId) {
      client.emit('error', { message: 'No active session found' });
      return;
    }

    try {
      const [sessionState, jobCounts] = await Promise.all([
        this.redisService.getSessionState(sessionId),
        this.bullMqService.getJobCount(sessionId),
      ]);
      
      client.emit('sessionStatus', {
        sessionId,
        state: sessionState,
        jobCounts,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      this.logger.error(`Error getting session status for ${sessionId}:`, error);
      client.emit('error', { 
        message: 'Failed to get session status',
        error: error.message 
      });
    }
  }

  @SubscribeMessage('getSessionHistory')
  async handleGetSessionHistory(@ConnectedSocket() client: Socket) {
    const connectionId = client.id;
    const sessionId = this.clientSessions.get(connectionId);
    
    if (!sessionId) {
      client.emit('error', { message: 'No active session found' });
      return;
    }

    try {
      const history = await this.redisService.getSessionHistory(sessionId);
      
      client.emit('sessionHistory', {
        sessionId,
        history,
        count: history.length,
        timestamp: Date.now(),
      });
      
    } catch (error) {
      this.logger.error(`Error getting session history for ${sessionId}:`, error);
      client.emit('error', { 
        message: 'Failed to get session history',
        error: error.message 
      });
    }
  }

  @SubscribeMessage('pauseSession')
  async handlePauseSession(@ConnectedSocket() client: Socket) {
    const connectionId = client.id;
    const sessionId = this.clientSessions.get(connectionId);
    
    if (!sessionId) {
      client.emit('error', { message: 'No active session found' });
      return;
    }

    try {
      await this.bullMqService.pauseQueue(sessionId);
      await this.redisService.updateSessionStatus(sessionId, 'paused');
      
      client.emit('sessionPaused', {
        sessionId,
        status: 'paused',
        timestamp: Date.now(),
      });
      
    } catch (error) {
      this.logger.error(`Error pausing session ${sessionId}:`, error);
      client.emit('error', { 
        message: 'Failed to pause session',
        error: error.message 
      });
    }
  }

  @SubscribeMessage('resumeSession')
  async handleResumeSession(@ConnectedSocket() client: Socket) {
    const connectionId = client.id;
    const sessionId = this.clientSessions.get(connectionId);
    
    if (!sessionId) {
      client.emit('error', { message: 'No active session found' });
      return;
    }

    try {
      await this.bullMqService.resumeQueue(sessionId);
      await this.redisService.updateSessionStatus(sessionId, 'active');
      
      client.emit('sessionResumed', {
        sessionId,
        status: 'active',
        timestamp: Date.now(),
      });
      
    } catch (error) {
      this.logger.error(`Error resuming session ${sessionId}:`, error);
      client.emit('error', { 
        message: 'Failed to resume session',
        error: error.message 
      });
    }
  }

  /**
   * Notify client about step completion (called by PlaywrightService)
   */
  async notifyStepCompleted(connectionId: string, data: any): Promise<void> {
    try {
      const client = this.server.sockets.sockets.get(connectionId);
      if (client) {
        client.emit('stepCompleted', data);
        this.logger.debug(`Notified client ${connectionId} about step completion`);
      } else {
        this.logger.warn(`Client ${connectionId} not found for step completion notification`);
      }
    } catch (error) {
      this.logger.error(`Error notifying client ${connectionId} about step completion:`, error);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.clientSessions.values());
  }

  /**
   * Get session ID for a connection
   */
  getSessionId(connectionId: string): string | undefined {
    return this.clientSessions.get(connectionId);
  }
}
