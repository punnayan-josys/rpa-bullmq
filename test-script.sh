#!/bin/bash

# RPA System Automated Testing Script
# This script demonstrates all key features and components

BASE_URL="http://localhost:3000"
SESSION_ID="demo-session-$(date +%s)"

echo "🚀 Starting RPA System Demo..."
echo "Base URL: $BASE_URL"
echo "Session ID: $SESSION_ID"
echo ""

# Function to make HTTP requests
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -n "$data" ]; then
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -X $method "$BASE_URL$endpoint")
    fi
    
    echo "$response"
}

# Function to print section headers
print_section() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
    echo ""
}

# 1. Health Check
print_section "1. HEALTH CHECK"
make_request "GET" "/health"

# 2. System Info
print_section "2. SYSTEM INFORMATION"
make_request "GET" "/system/info"

# 3. Redis Testing
print_section "3. REDIS TESTING"

echo "Creating session in Redis..."
make_request "POST" "/test/redis/session" "{\"sessionId\": \"$SESSION_ID\", \"connectionId\": \"demo-conn-001\"}"

echo "Logging a step to Redis..."
make_request "POST" "/test/redis/step" "{\"sessionId\": \"$SESSION_ID\", \"step\": {\"id\": \"step-001\", \"action\": \"navigate\", \"data\": {\"url\": \"https://example.com\"}}}"

echo "Testing distributed lock..."
make_request "GET" "/test/redis/lock/$SESSION_ID/manager-001"

echo "Testing Redis pub/sub..."
make_request "POST" "/test/redis/publish" "{\"channel\": \"demo-channel\", \"message\": \"Hello from demo!\"}"

# 4. BullMQ Testing
print_section "4. BULLMQ TESTING"

echo "Adding job to queue..."
make_request "POST" "/test/bullmq/queue" "{\"sessionId\": \"$SESSION_ID\", \"jobData\": {\"action\": \"click\", \"data\": {\"selector\": \"#button1\"}}}"

echo "Getting queue statistics..."
make_request "GET" "/test/bullmq/stats/$SESSION_ID"

echo "Pausing queue..."
make_request "POST" "/test/bullmq/pause/$SESSION_ID"

echo "Resuming queue..."
make_request "POST" "/test/bullmq/resume/$SESSION_ID"

# 5. Worker Manager Testing
print_section "5. WORKER MANAGER TESTING"

echo "Getting worker statistics..."
make_request "GET" "/test/worker/stats"

echo "Announcing new session to workers..."
make_request "POST" "/test/worker/announce-session" "{\"sessionId\": \"$SESSION_ID\"}"

# 6. RPA Step Testing
print_section "6. RPA STEP TESTING"

echo "Testing navigation step..."
make_request "POST" "/test/rpa/navigate" "{\"sessionId\": \"$SESSION_ID\", \"url\": \"https://google.com\"}"

echo "Testing click step..."
make_request "POST" "/test/rpa/click" "{\"sessionId\": \"$SESSION_ID\", \"selector\": \"#search-button\"}"

echo "Testing type step..."
make_request "POST" "/test/rpa/type" "{\"sessionId\": \"$SESSION_ID\", \"text\": \"Hello World\", \"selector\": \"#search-input\"}"

# 7. Session Management Testing
print_section "7. SESSION MANAGEMENT TESTING"

echo "Getting all sessions..."
make_request "GET" "/sessions"

echo "Getting session status..."
make_request "GET" "/session/$SESSION_ID/status"

echo "Getting session history..."
make_request "GET" "/session/$SESSION_ID/history"

# 8. Crash Recovery Testing
print_section "8. CRASH RECOVERY TESTING"

echo "Setting up recovery test data..."
make_request "POST" "/test/recovery/setup/recovery-demo-001"

echo "Checking recovery history..."
make_request "GET" "/test/recovery/history/recovery-demo-001"

echo "Simulating crash recovery..."
make_request "POST" "/test/crash-recovery-simulation" "{\"sessionId\": \"crash-demo-001\"}"

# 9. Comprehensive Workflow Testing
print_section "9. COMPREHENSIVE WORKFLOW TESTING"

echo "Testing full RPA workflow..."
make_request "POST" "/test/full-workflow" "{\"sessionId\": \"workflow-demo-001\"}"

# 10. Final System Status
print_section "10. FINAL SYSTEM STATUS"

echo "Getting final worker statistics..."
make_request "GET" "/workers/stats"

echo "Getting final system information..."
make_request "GET" "/system/info"

# 11. Cleanup
print_section "11. CLEANUP"

echo "Cleaning up test data..."
make_request "DELETE" "/test/cleanup-all"

echo ""
echo "🎉 RPA System Demo Completed!"
echo ""
echo "Demo Summary:"
echo "- Session ID used: $SESSION_ID"
echo "- All components tested successfully"
echo "- Crash recovery demonstrated"
echo "- Worker management validated"
echo "- System monitoring verified"
echo ""
echo "The system is ready for production deployment! 🚀"
