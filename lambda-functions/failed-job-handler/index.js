const { QueueEvents } = require('bullmq');
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
});

// This service needs to be a long-running process, so it's better as a Fargate service
// But for Lambda, we'll implement a version that processes recent failures

exports.handler = async (event, context) => {
  console.log('Failed Job Handler started');
  
  try {
    let totalFailuresProcessed = 0;
    let sessionsTerminated = 0;
    
    // Scan for failed jobs in all session queues
    let cursor = '0';
    
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'bull:rpa-session-*:failed', 'COUNT', 100);
      cursor = nextCursor;
      
      for (const key of keys) {
        try {
          // Extract session ID from queue name
          const queueName = key.split(':')[1];
          const sessionId = queueName.replace('rpa-session-', '');
          
          // Get failed jobs for this session
          const failedJobs = await redis.lrange(key, 0, -1);
          
          for (const jobData of failedJobs) {
            totalFailuresProcessed++;
            
            try {
              const job = JSON.parse(jobData);
              
              // Check if this is a permanently failed job (exhausted all retries)
              if (job.attemptsMade >= (job.opts?.attempts || 3)) {
                console.log(`Job ${job.id} for session ${sessionId} has permanently failed: ${job.failedReason}`);
                
                // Update session status
                await redis.hset(`session:state:${sessionId}`, {
                  'status': 'failed',
                  'error': job.failedReason,
                  'failed_job_id': job.id,
                  'last_active_time': Date.now(),
                });
                
                // Trigger session shutdown
                await redis.publish(`session-control:${sessionId}`, 'STOP');
                
                sessionsTerminated++;
                console.log(`Session ${sessionId} terminated due to permanent job failure`);
              }
            } catch (parseError) {
              console.error(`Error parsing job data:`, parseError);
            }
          }
        } catch (error) {
          console.error(`Error processing failed jobs for key ${key}:`, error);
        }
      }
    } while (cursor !== '0');
    
    console.log(`Failed Job Handler completed. Processed: ${totalFailuresProcessed}, Sessions terminated: ${sessionsTerminated}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Failed job handler completed successfully',
        totalFailuresProcessed,
        sessionsTerminated,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } catch (error) {
    console.error('Error in failed job handler:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error in failed job handler',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  } finally {
    await redis.quit();
  }
};

// For Fargate deployment, this would be a long-running service:
/*
const queueEvents = new QueueEvents('rpa-steps-queue', {
  connection: { 
    host: process.env.REDIS_HOST, 
    port: parseInt(process.env.REDIS_PORT) || 6379 
  }
});

queueEvents.on('failed', async ({ jobId, failedReason }) => {
  try {
    // We need to get the job to extract sessionId
    // This requires creating a temporary queue object
    const tempQueue = new Queue('temp', { connection: queueEvents.connection });
    const job = await tempQueue.getJob(jobId);
    
    if (job && job.data.sessionId) {
      const sessionId = job.data.sessionId;
      
      if (job.attemptsMade >= job.opts.attempts) {
        console.log(`Job ${jobId} for session ${sessionId} has permanently failed. Triggering shutdown.`);
        
        await redis.hset(`session:state:${sessionId}`, 'status', 'failed', 'error', failedReason);
        await redis.publish(`session-control:${sessionId}`, 'STOP');
      }
    }
    
    await tempQueue.close();
  } catch (error) {
    console.error(`Error handling failed job ${jobId}:`, error);
  }
});

console.log('Failed Job Handler service started...');
*/
