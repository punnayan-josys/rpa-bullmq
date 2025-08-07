# RPA (Robotic Process Automation) Backend System

A robust, scalable RPA backend system built with NestJS, Redis, BullMQ, and deployed on AWS Fargate with comprehensive crash recovery and monitoring capabilities.

## 🏗️ Architecture Overview

### Core Components

1. **NestJS Backend** - Main application server with WebSocket support
2. **Redis** - Session management, pub/sub, and crash recovery state
3. **BullMQ** - Job queue management with per-session queues
4. **Worker Manager** - Distributed worker management with crash recovery
5. **AWS Fargate** - Containerized deployment with auto-scaling
6. **Lambda Functions** - Supporting services (idle session reaper, etc.)

### Key Features

- ✅ **Crash Recovery** - Automatic state reconstruction from Redis history
- ✅ **Distributed Locking** - Prevents race conditions across multiple containers
- ✅ **Auto-scaling** - Scales based on CPU utilization and session load
- ✅ **Session Management** - Isolated sessions with individual queues
- ✅ **Real-time Communication** - WebSocket-based client communication
- ✅ **Monitoring & Health Checks** - Comprehensive system monitoring
- ✅ **Graceful Shutdown** - Proper cleanup on session termination

## 📁 Project Structure

```
RPA-POC/
├── rpa-robust-backend/          # Main NestJS application
│   ├── src/
│   │   ├── redis/              # Redis service for session management
│   │   ├── bull-mq/            # BullMQ service for job queues
│   │   ├── playwright/         # Worker manager with crash recovery
│   │   ├── events/             # WebSocket gateway
│   │   └── app.controller.ts   # REST API endpoints
│   ├── Dockerfile              # Container configuration
│   └── healthcheck.js          # Health check script
├── lambda-functions/           # AWS Lambda functions
│   ├── idle-reaper/           # Terminates idle sessions
│   └── failed-job-handler/    # Handles permanently failed jobs
├── aws-deployment/            # AWS deployment configurations
│   ├── ecs-task-definition.json
│   ├── ecs-service.json
│   └── autoscaling-policy.json
└── deploy.sh                  # Automated deployment script
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Docker Desktop
- AWS CLI configured with appropriate permissions
- Redis instance (ElastiCache recommended)

### Local Development

1. **Clone and install dependencies:**
   ```bash
   cd rpa-robust-backend
   npm install
   ```

2. **Set environment variables:**
   ```bash
   export REDIS_HOST=localhost
   export REDIS_PORT=6379
   export REDIS_PASSWORD=your_redis_password
   export MAX_WORKERS_PER_CONTAINER=5
   ```

3. **Start the application:**
   ```bash
   npm run start:dev
   ```

4. **Test the API:**
   ```bash
   curl http://localhost:3000/health
   ```

## 🏭 Production Deployment

### Step 1: AWS Infrastructure Setup

1. **Create VPC and Security Groups:**
   ```bash
   # Create VPC with public and private subnets
   aws ec2 create-vpc --cidr-block 10.0.0.0/16
   
   # Create security groups for ECS and Redis
   aws ec2 create-security-group --group-name rpa-ecs-sg --description "RPA ECS Security Group"
   aws ec2 create-security-group --group-name rpa-redis-sg --description "RPA Redis Security Group"
   ```

2. **Deploy ElastiCache Redis:**
   ```bash
   # Create Redis subnet group
   aws elasticache create-subnet-group \
     --subnet-group-name rpa-redis-subnet-group \
     --subnet-ids subnet-xxxxxxxxx subnet-yyyyyyyyy
   
   # Create Redis cluster
   aws elasticache create-replication-group \
     --replication-group-id rpa-redis \
     --replication-group-description "RPA Redis Cluster" \
     --node-group-id rpa-redis-node \
     --subnet-group-name rpa-redis-subnet-group \
     --cache-node-type cache.t3.micro \
     --num-cache-nodes 1
   ```

3. **Create IAM Roles:**
   ```bash
   # Create ECS task execution role
   aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://trust-policy.json
   aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
   
   # Create RPA task role
   aws iam create-role --role-name rpa-task-role --assume-role-policy-document file://trust-policy.json
   aws iam attach-role-policy --role-name rpa-task-role --policy-arn arn:aws:iam::aws:policy/AmazonElastiCacheFullAccess
   ```

### Step 2: Deploy the Application

1. **Run the deployment script:**
   ```bash
   ./deploy.sh
   ```

   This script will:
   - Build and push Docker image to ECR
   - Create ECS cluster and service
   - Configure auto-scaling
   - Deploy Lambda functions
   - Set up monitoring

2. **Verify deployment:**
   ```bash
   # Check ECS service status
   aws ecs describe-services --cluster rpa-cluster --services rpa-backend-service
   
   # Check Lambda functions
   aws lambda list-functions --query 'Functions[?contains(FunctionName, `rpa`)].FunctionName'
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_HOST` | Redis server hostname | localhost |
| `REDIS_PORT` | Redis server port | 6379 |
| `REDIS_PASSWORD` | Redis authentication password | - |
| `MAX_WORKERS_PER_CONTAINER` | Maximum workers per container | 5 |
| `NODE_ENV` | Node.js environment | production |

### Auto-scaling Configuration

The system uses CPU-based auto-scaling:
- **Target CPU Utilization:** 70%
- **Min Capacity:** 1 task
- **Max Capacity:** 10 tasks
- **Scale-out Cooldown:** 5 minutes
- **Scale-in Cooldown:** 5 minutes

## 📊 Monitoring and Health Checks

### Health Check Endpoints

- `GET /health` - Basic health check
- `GET /system/info` - System status and statistics
- `GET /workers/stats` - Worker manager statistics
- `GET /sessions` - All active sessions

### CloudWatch Metrics

The system automatically publishes metrics to CloudWatch:
- CPU and Memory utilization
- Active sessions count
- Job queue statistics
- Error rates

### Logging

All logs are sent to CloudWatch Logs:
- Application logs: `/ecs/rpa-backend`
- Container logs: `/ecs/rpa-backend/ecs`

## 🔄 Crash Recovery Logic

### How It Works

1. **State Persistence:** Every RPA step is logged to Redis in two formats:
   - Capped list (last 100 steps) for quick access
   - Sorted set (complete history) for crash recovery

2. **Recovery Process:**
   - When a new worker starts for a session, it checks for existing history
   - If history exists, it enters "recovery mode"
   - All historical steps are replayed to rebuild browser state
   - Only after recovery does it start processing new jobs

3. **Recovery Points:**
   - Step completion is logged immediately after execution
   - This ensures no work is lost even if the worker crashes mid-step

### Example Recovery Flow

```javascript
// Worker starts for session "abc-123"
const history = await redisService.getSessionHistory("abc-123");

if (history.length > 0) {
  console.log("CRASH RECOVERY: Rebuilding state...");
  
  // Replay all historical steps
  for (const step of history) {
    await simulateRpaWork(step);
  }
  
  console.log("Recovery complete, starting new jobs");
}
```

## 🔌 API Reference

### WebSocket Events

Connect to: `ws://your-domain/rpa`

#### Client → Server
- `recordStep` - Record a new RPA step
- `getSessionStatus` - Get current session status
- `getSessionHistory` - Get session history
- `pauseSession` - Pause session processing
- `resumeSession` - Resume session processing

#### Server → Client
- `sessionCreated` - Session created successfully
- `stepQueued` - Step added to queue
- `stepCompleted` - Step execution completed
- `sessionStatus` - Session status update
- `sessionHistory` - Session history data

### REST API Endpoints

- `GET /` - Application status
- `GET /health` - Health check
- `GET /sessions` - List all active sessions
- `GET /session/:id/history` - Get session history
- `GET /session/:id/status` - Get session status
- `GET /workers/stats` - Worker statistics
- `POST /test/step` - Create test step
- `GET /system/info` - System information

## 💰 Cost Estimation

### Monthly Costs (Small Scale)

| Service | Configuration | Monthly Cost |
|---------|---------------|--------------|
| **Fargate** | 2 tasks × 1 vCPU, 2GB RAM | ~$30-50 |
| **ElastiCache** | cache.t3.micro | ~$15-20 |
| **Lambda** | Idle reaper (runs every 5 min) | ~$1-2 |
| **API Gateway** | REST API + WebSocket | ~$5-10 |
| **CloudWatch** | Logs + Metrics | ~$5-10 |
| **Data Transfer** | Minimal | ~$1-5 |

**Total Estimated Cost: $60-100/month**

### Cost Optimization Tips

1. **Use Spot Instances:** Can reduce Fargate costs by 50-70%
2. **Right-size containers:** Monitor actual resource usage
3. **Implement session timeouts:** Reduce idle resource consumption
4. **Use reserved instances:** For predictable workloads

## 🛠️ Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   ```bash
   # Check Redis connectivity
   aws elasticache describe-replication-groups --replication-group-id rpa-redis
   ```

2. **ECS Tasks Not Starting**
   ```bash
   # Check task definition
   aws ecs describe-task-definition --task-definition rpa-backend
   
   # Check service events
   aws ecs describe-services --cluster rpa-cluster --services rpa-backend-service
   ```

3. **Auto-scaling Not Working**
   ```bash
   # Check scaling policies
   aws application-autoscaling describe-scaling-policies --service-namespace ecs
   ```

### Debug Commands

```bash
# View application logs
aws logs tail /ecs/rpa-backend --follow

# Check Redis keys
redis-cli -h your-redis-host keys "session:*"

# Monitor ECS service
aws ecs describe-services --cluster rpa-cluster --services rpa-backend-service

# Test WebSocket connection
wscat -c ws://your-domain/rpa
```

## 🔐 Security Considerations

1. **Network Security:**
   - All services run in private subnets
   - Redis access restricted to ECS tasks
   - Load balancer in public subnet with security groups

2. **Authentication:**
   - Redis password stored in AWS Secrets Manager
   - IAM roles for service permissions
   - No hardcoded credentials

3. **Data Protection:**
   - Session data automatically expires
   - Sensitive data encrypted in transit
   - Regular security updates

## 📈 Scaling Considerations

### Horizontal Scaling
- Multiple ECS tasks can handle different sessions
- Redis pub/sub distributes work across containers
- Auto-scaling based on CPU utilization

### Vertical Scaling
- Increase CPU/Memory per task
- Adjust `MAX_WORKERS_PER_CONTAINER`
- Optimize Redis configuration

### Performance Tuning
- Monitor Redis memory usage
- Adjust job queue settings
- Optimize worker concurrency

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review CloudWatch logs
3. Open an issue on GitHub
4. Contact the development team

---

**Built with ❤️ using NestJS, Redis, BullMQ, and AWS**
# rpa-bullmq
