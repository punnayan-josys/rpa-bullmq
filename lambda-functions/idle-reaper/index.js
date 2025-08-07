const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS) || (30 * 60 * 1000); // 30 minutes default

exports.handler = async (event, context) => {
  console.log('Idle Session Reaper started');
  
  try {
    let totalSessionsChecked = 0;
    let sessionsTerminated = 0;
    
    // Use a cursor to scan keys without blocking Redis
    let cursor = '0';
    
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'session:state:*', 'COUNT', 100);
      cursor = nextCursor;
      
      for (const key of keys) {
        totalSessionsChecked++;
        const sessionId = key.split(':')[2];
        
        try {
          const lastActiveTime = await redis.hget(key, 'last_active_time');
          const status = await redis.hget(key, 'status');
          
          if (lastActiveTime && status !== 'terminated') {
            const timeSinceLastActive = Date.now() - parseInt(lastActiveTime);
            
            if (timeSinceLastActive > IDLE_TIMEOUT_MS) {
              console.log(`Session ${sessionId} is idle for ${Math.round(timeSinceLastActive / 1000)}s. Triggering shutdown.`);
              
              // Publish the same stop signal our gateway uses
              await redis.publish(`session-control:${sessionId}`, 'STOP');
              
              // Update status to indicate termination
              await redis.hset(key, 'status', 'terminated', 'termination_reason', 'idle_timeout');
              
              sessionsTerminated++;
            }
          }
        } catch (error) {
          console.error(`Error processing session ${sessionId}:`, error);
        }
      }
    } while (cursor !== '0');
    
    console.log(`Idle Session Reaper completed. Checked: ${totalSessionsChecked}, Terminated: ${sessionsTerminated}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Idle session reaper completed successfully',
        totalSessionsChecked,
        sessionsTerminated,
        idleTimeoutMs: IDLE_TIMEOUT_MS,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } catch (error) {
    console.error('Error in idle session reaper:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error in idle session reaper',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  } finally {
    await redis.quit();
  }
};
