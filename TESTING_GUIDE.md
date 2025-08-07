# RPA System Testing Guide

This guide provides comprehensive testing endpoints for each component and strategy of the RPA system. Use these endpoints to validate the functionality and demonstrate the POC capabilities.

## 🚀 Quick Start

### 1. Start the Application
```bash
cd rpa-robust-backend
npm run start:dev
```

### 2. Test Basic Health
```bash
curl http://localhost:3000/health
```

## 📋 Testing Categories

### 1. **Redis Testing** - State Management & Coordination
### 2. **BullMQ Testing** - Job Queue Management  
### 3. **Worker Manager Testing** - Distributed Worker Management
### 4. **Crash Recovery Testing** - Fault Tolerance
### 5. **Session Management Testing** - Session Lifecycle
### 6. **RPA Step Testing** - Automation Actions
### 7. **System Monitoring** - Observability
### 8. **Comprehensive Workflows** - End-to-End Testing

---

## 🔴 1. REDIS TESTING

### Test Session Creation
```bash
curl -X POST http://localhost:3000/test/redis/session \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-001",
    "connectionId": "conn-123"
  }'
```

### Test Step Logging
```bash
curl -X POST http://localhost:3000/test/redis/step \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-001",
    "step": {
      "id": "step-001",
      "action": "navigate",
      "data": {"url": "https://example.com"}
    }
  }'
```

### Test Distributed Locking
```bash
# Test lock acquisition
curl http://localhost:3000/test/redis/lock/test-session-001/manager-001

# Test lock conflict (should fail)
curl http://localhost:3000/test/redis/lock/test-session-001/manager-002
```

### Test Pub/Sub Messaging
```bash
curl -X POST http://localhost:3000/test/redis/publish \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "test-channel",
    "message": "Hello from Redis Pub/Sub!"
  }'
```

---

## 🔵 2. BULLMQ TESTING

### Test Job Queue Creation
```bash
curl -X POST http://localhost:3000/test/bullmq/queue \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-001",
    "jobData": {
      "action": "click",
      "data": {"selector": "#button1"}
    }
  }'
```

### Test Queue Statistics
```bash
curl http://localhost:3000/test/bullmq/stats/test-session-001
```

### Test Queue Pause/Resume
```bash
# Pause queue
curl -X POST http://localhost:3000/test/bullmq/pause/test-session-001

# Resume queue
curl -X POST http://localhost:3000/test/bullmq/resume/test-session-001
```

---

## 🟡 3. WORKER MANAGER TESTING

### Test Worker Statistics
```bash
curl http://localhost:3000/test/worker/stats
```

### Test Worker Crash Simulation
```bash
curl -X POST http://localhost:3000/test/worker/simulate-crash/test-session-001
```

### Test Session Announcement
```bash
curl -X POST http://localhost:3000/test/worker/announce-session \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "new-session-001"
  }'
```

---

## 🟢 4. CRASH RECOVERY TESTING

### Setup Recovery Test Data
```bash
curl -X POST http://localhost:3000/test/recovery/setup/recovery-test-001
```

### Check Recovery History
```bash
curl http://localhost:3000/test/recovery/history/recovery-test-001
```

### Simulate Crash Recovery
```bash
curl -X POST http://localhost:3000/test/crash-recovery-simulation \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "crash-test-001"
  }'
```

---

## 🟣 5. SESSION MANAGEMENT TESTING

### Get All Sessions
```bash
curl http://localhost:3000/sessions
```

### Get Session History
```bash
curl http://localhost:3000/session/test-session-001/history
```

### Get Session Status
```bash
curl http://localhost:3000/session/test-session-001/status
```

### Get Session Completion Status
```bash
curl http://localhost:3000/session/test-session-001/completed
```

### Cleanup Session
```bash
curl -X POST http://localhost:3000/session/test-session-001/cleanup
```

---

## 🟠 6. RPA STEP TESTING

### Test Navigation Step
```bash
curl -X POST http://localhost:3000/test/rpa/navigate \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "rpa-test-001",
    "url": "https://google.com"
  }'
```

### Test Click Step
```bash
curl -X POST http://localhost:3000/test/rpa/click \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "rpa-test-001",
    "selector": "#search-button"
  }'
```

### Test Type Step
```bash
curl -X POST http://localhost:3000/test/rpa/type \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "rpa-test-001",
    "text": "Hello World",
    "selector": "#search-input"
  }'
```

### Test Generic Step
```bash
curl -X POST http://localhost:3000/test/step \
  -H "Content-Type: application/json" \
  -d '{
    "action": "wait",
    "data": {"duration": 5000}
  }'
```

---

## 🔵 7. SYSTEM MONITORING TESTING

### Get Worker Statistics
```bash
curl http://localhost:3000/workers/stats
```

### Get System Information
```bash
curl http://localhost:3000/system/info
```

---

## 🎯 8. COMPREHENSIVE WORKFLOW TESTING

### Test Full RPA Workflow
```bash
curl -X POST http://localhost:3000/test/full-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "workflow-test-001"
  }'
```

### Test Crash Recovery Workflow
```bash
curl -X POST http://localhost:3000/test/crash-recovery-simulation \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "crash-workflow-001"
  }'
```

### Cleanup All Test Data
```bash
curl -X DELETE http://localhost:3000/test/cleanup-all
```

---

## 📊 Testing Scenarios

### Scenario 1: Basic RPA Session
1. Create a session
2. Add navigation step
3. Add click step
4. Add type step
5. Check session status
6. Cleanup session

```bash
# 1. Create session
curl -X POST http://localhost:3000/test/redis/session \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "basic-test", "connectionId": "conn-001"}'

# 2. Add navigation
curl -X POST http://localhost:3000/test/rpa/navigate \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "basic-test", "url": "https://example.com"}'

# 3. Add click
curl -X POST http://localhost:3000/test/rpa/click \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "basic-test", "selector": "#button1"}'

# 4. Add type
curl -X POST http://localhost:3000/test/rpa/type \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "basic-test", "text": "Hello", "selector": "#input1"}'

# 5. Check status
curl http://localhost:3000/session/basic-test/status

# 6. Cleanup
curl -X POST http://localhost:3000/session/basic-test/cleanup
```

### Scenario 2: Crash Recovery Demo
1. Setup recovery data
2. Simulate crash
3. Check recovery history
4. Verify state reconstruction

```bash
# 1. Setup recovery data
curl -X POST http://localhost:3000/test/recovery/setup/crash-demo-001

# 2. Check history before crash
curl http://localhost:3000/test/recovery/history/crash-demo-001

# 3. Simulate crash
curl -X POST http://localhost:3000/test/crash-recovery-simulation \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "crash-demo-001"}'

# 4. Check recovery after crash
curl http://localhost:3000/test/recovery/history/crash-demo-001
```

### Scenario 3: Distributed Worker Management
1. Create multiple sessions
2. Check worker distribution
3. Simulate worker crash
4. Verify session reassignment

```bash
# 1. Create multiple sessions
for i in {1..3}; do
  curl -X POST http://localhost:3000/test/redis/session \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"distributed-test-$i\", \"connectionId\": \"conn-$i\"}"
done

# 2. Announce sessions to workers
for i in {1..3}; do
  curl -X POST http://localhost:3000/test/worker/announce-session \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"distributed-test-$i\"}"
done

# 3. Check worker stats
curl http://localhost:3000/test/worker/stats

# 4. Simulate crash on one session
curl -X POST http://localhost:3000/test/worker/simulate-crash/distributed-test-1

# 5. Check worker stats again
curl http://localhost:3000/test/worker/stats
```

---

## 🔍 Expected Results

### Redis Testing
- ✅ Session creation should return success
- ✅ Step logging should store data in Redis
- ✅ Lock acquisition should work (first request succeeds, second fails)
- ✅ Pub/Sub should return subscriber count

### BullMQ Testing
- ✅ Job creation should return job ID
- ✅ Queue stats should show job counts
- ✅ Pause/resume should work without errors

### Worker Manager Testing
- ✅ Worker stats should show current state
- ✅ Crash simulation should trigger cleanup
- ✅ Session announcement should be published

### Crash Recovery Testing
- ✅ Recovery setup should create history
- ✅ History should be retrievable
- ✅ Crash simulation should trigger recovery process

### Session Management Testing
- ✅ Session listing should show active sessions
- ✅ Session status should show current state
- ✅ Cleanup should remove session data

### RPA Step Testing
- ✅ Step creation should return job ID
- ✅ Different step types should work
- ✅ Job queue should contain the steps

### System Monitoring Testing
- ✅ Worker stats should show current workers
- ✅ System info should show overall status

---

## 🐛 Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   ```bash
   # Check if Redis is running
   redis-cli ping
   
   # Set environment variables
   export REDIS_HOST=localhost
   export REDIS_PORT=6379
   ```

2. **Port Already in Use**
   ```bash
   # Kill process on port 3000
   lsof -ti:3000 | xargs kill -9
   ```

3. **Module Not Found Errors**
   ```bash
   # Reinstall dependencies
   npm install
   ```

### Debug Commands

```bash
# Check application logs
npm run start:dev

# Test Redis connectivity
redis-cli -h localhost ping

# Check all endpoints
curl http://localhost:3000/health
curl http://localhost:3000/system/info
```

---

## 📈 Performance Testing

### Load Testing
```bash
# Test multiple concurrent sessions
for i in {1..10}; do
  curl -X POST http://localhost:3000/test/redis/session \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"load-test-$i\", \"connectionId\": \"conn-$i\"}" &
done
wait

# Check system performance
curl http://localhost:3000/system/info
```

### Stress Testing
```bash
# Create many jobs quickly
for i in {1..50}; do
  curl -X POST http://localhost:3000/test/bullmq/queue \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"stress-test\", \"jobData\": {\"action\": \"test\", \"data\": {\"index\": $i}}}" &
done
wait

# Check queue performance
curl http://localhost:3000/test/bullmq/stats/stress-test
```

---

This testing guide covers all major components and strategies of the RPA system. Use these endpoints to validate functionality and demonstrate the POC capabilities to stakeholders.
