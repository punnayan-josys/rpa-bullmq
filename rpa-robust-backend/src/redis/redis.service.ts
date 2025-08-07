import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;
  private readonly redisSub: Redis;
  private readonly lockTTL = 30000; // 30 seconds
  private readonly sessionTTL = 3600; // 1 hour

  constructor() {
    // Main Redis client for commands
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
    });

    // Separate Redis client for Pub/Sub
    this.redisSub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });

    this.redisSub.on('error', (error) => {
      this.logger.error('Redis Sub connection error:', error);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
    await this.redisSub.quit();
  }

  /**
   * Acquire a distributed lock for a session
   */
  async acquireSessionLock(sessionId: string, managerId: string): Promise<boolean> {
    const lockKey = `session:lock:${sessionId}`;
    const result = await this.redis.set(lockKey, managerId, 'PX', this.lockTTL, 'NX');
    return result === 'OK';
  }

  /**
   * Release a distributed lock for a session
   */
  async releaseSessionLock(sessionId: string, managerId: string): Promise<boolean> {
    const lockKey = `session:lock:${sessionId}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, lockKey, managerId);
    return result === 1;
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return await this.redis.publish(channel, message);
  }

  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.redisSub.subscribe(channel);
    this.redisSub.on('message', (chan, message) => {
      if (chan === channel) {
        callback(message);
      }
    });
  }

  /**
   * Subscribe to a pattern
   */
  async psubscribe(pattern: string, callback: (channel: string, message: string) => void): Promise<void> {
    await this.redisSub.psubscribe(pattern);
    this.redisSub.on('pmessage', (pat, chan, message) => {
      if (pat === pattern) {
        callback(chan, message);
      }
    });
  }

  /**
   * Set connection ID for a session
   */
  async setConnectionId(sessionId: string, connectionId: string): Promise<void> {
    const key = `session:connection:${sessionId}`;
    await this.redis.set(key, connectionId, 'EX', this.sessionTTL);
  }

  /**
   * Get connection ID for a session
   */
  async getConnectionId(sessionId: string): Promise<string | null> {
    const key = `session:connection:${sessionId}`;
    return await this.redis.get(key);
  }

  /**
   * Log step completion to both capped list and sorted set
   */
  async logStepCompletion(sessionId: string, step: any): Promise<void> {
    const listKey = `session:steps:${sessionId}`;
    const sortedSetKey = `session:history:${sessionId}`;
    const stateKey = `session:state:${sessionId}`;

    const stepData = {
      id: step.id,
      action: step.action,
      timestamp: Date.now(),
      data: step.data,
    };

    // Add to capped list (keep last 100 steps)
    await this.redis.lpush(listKey, JSON.stringify(stepData));
    await this.redis.ltrim(listKey, 0, 99);

    // Add to sorted set for crash recovery
    await this.redis.zadd(sortedSetKey, stepData.timestamp, JSON.stringify(stepData));

    // Update session state
    await this.redis.hset(stateKey, {
      last_active_time: stepData.timestamp,
      total_steps: await this.redis.zcard(sortedSetKey),
      status: 'active',
    });

    // Set TTL for session data
    await this.redis.expire(listKey, this.sessionTTL);
    await this.redis.expire(sortedSetKey, this.sessionTTL);
    await this.redis.expire(stateKey, this.sessionTTL);
  }

  /**
   * Get session history for crash recovery
   */
  async getSessionHistory(sessionId: string): Promise<any[]> {
    const sortedSetKey = `session:history:${sessionId}`;
    const history = await this.redis.zrange(sortedSetKey, 0, -1);
    return history.map(item => JSON.parse(item));
  }

  /**
   * Get session state
   */
  async getSessionState(sessionId: string): Promise<any> {
    const stateKey = `session:state:${sessionId}`;
    const state = await this.redis.hgetall(stateKey);
    return state;
  }

  /**
   * Clean up all session data
   */
  async cleanupSession(sessionId: string): Promise<void> {
    const keys = [
      `session:lock:${sessionId}`,
      `session:connection:${sessionId}`,
      `session:steps:${sessionId}`,
      `session:history:${sessionId}`,
      `session:state:${sessionId}`,
    ];

    await this.redis.del(...keys);
    this.logger.log(`Cleaned up session: ${sessionId}`);
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<string[]> {
    const pattern = 'session:state:*';
    const keys = await this.redis.keys(pattern);
    return keys.map(key => key.split(':')[2]);
  }

  /**
   * Check if session exists and is active
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const stateKey = `session:state:${sessionId}`;
    const exists = await this.redis.exists(stateKey);
    if (!exists) return false;

    const state = await this.redis.hget(stateKey, 'status');
    return state === 'active';
  }

  /**
   * Update session status
   */
  async updateSessionStatus(sessionId: string, status: string, error?: string): Promise<void> {
    const stateKey = `session:state:${sessionId}`;
    const updateData: any = { status, last_active_time: Date.now() };
    if (error) {
      updateData.error = error;
    }
    await this.redis.hset(stateKey, updateData);
  }
}
