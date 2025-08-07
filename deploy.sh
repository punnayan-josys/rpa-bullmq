#!/bin/bash

# RPA Backend AWS Deployment Script
# This script deploys the complete RPA system to AWS

set -e

# Configuration
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY="rpa-backend"
ECS_CLUSTER="rpa-cluster"
ECS_SERVICE="rpa-backend-service"
TASK_DEFINITION="rpa-backend"

echo "🚀 Starting RPA Backend Deployment to AWS"
echo "Region: $AWS_REGION"
echo "Account: $AWS_ACCOUNT_ID"

# Step 1: Build and push Docker image to ECR
echo "📦 Building and pushing Docker image..."

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION || \
aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION

# Get ECR login token
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build Docker image
docker build -t $ECR_REPOSITORY .

# Tag and push image
docker tag $ECR_REPOSITORY:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest

echo "✅ Docker image pushed successfully"

# Step 2: Create ECS cluster if it doesn't exist
echo "🏗️ Setting up ECS cluster..."

aws ecs describe-clusters --clusters $ECS_CLUSTER --region $AWS_REGION || \
aws ecs create-cluster --cluster-name $ECS_CLUSTER --region $AWS_REGION

echo "✅ ECS cluster ready"

# Step 3: Register task definition
echo "📋 Registering task definition..."

# Update task definition with actual values
sed -i.bak "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" aws-deployment/ecs-task-definition.json
sed -i.bak "s/REGION/$AWS_REGION/g" aws-deployment/ecs-task-definition.json

aws ecs register-task-definition \
  --cli-input-json file://aws-deployment/ecs-task-definition.json \
  --region $AWS_REGION

echo "✅ Task definition registered"

# Step 4: Create or update ECS service
echo "🔧 Setting up ECS service..."

# Check if service exists
SERVICE_EXISTS=$(aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION --query 'services[0].status' --output text 2>/dev/null || echo "NONE")

if [ "$SERVICE_EXISTS" = "ACTIVE" ]; then
  echo "📝 Updating existing service..."
  aws ecs update-service \
    --cluster $ECS_CLUSTER \
    --service $ECS_SERVICE \
    --task-definition $TASK_DEFINITION \
    --region $AWS_REGION
else
  echo "🆕 Creating new service..."
  # Update service configuration with actual values
  sed -i.bak "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" aws-deployment/ecs-service.json
  sed -i.bak "s/REGION/$AWS_REGION/g" aws-deployment/ecs-service.json
  
  aws ecs create-service \
    --cli-input-json file://aws-deployment/ecs-service.json \
    --region $AWS_REGION
fi

echo "✅ ECS service configured"

# Step 5: Set up autoscaling
echo "⚖️ Configuring autoscaling..."

# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/$ECS_CLUSTER/$ECS_SERVICE \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10 \
  --region $AWS_REGION

# Put scaling policy
aws application-autoscaling put-scaling-policy \
  --cli-input-json file://aws-deployment/autoscaling-policy.json \
  --region $AWS_REGION

echo "✅ Autoscaling configured"

# Step 6: Deploy Lambda functions
echo "🔧 Deploying Lambda functions..."

# Deploy idle reaper
cd lambda-functions/idle-reaper
zip -r idle-reaper.zip .
aws lambda create-function \
  --function-name rpa-idle-reaper \
  --runtime nodejs18.x \
  --role arn:aws:iam::$AWS_ACCOUNT_ID:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://idle-reaper.zip \
  --timeout 300 \
  --environment Variables="{REDIS_HOST=$REDIS_HOST,REDIS_PORT=6379,IDLE_TIMEOUT_MS=1800000}" \
  --region $AWS_REGION || \
aws lambda update-function-code \
  --function-name rpa-idle-reaper \
  --zip-file fileb://idle-reaper.zip \
  --region $AWS_REGION

# Set up EventBridge rule for idle reaper (runs every 5 minutes)
aws events put-rule \
  --name rpa-idle-reaper-schedule \
  --schedule-expression "rate(5 minutes)" \
  --region $AWS_REGION

aws events put-targets \
  --rule rpa-idle-reaper-schedule \
  --targets "Id"="1","Arn"="arn:aws:lambda:$AWS_REGION:$AWS_ACCOUNT_ID:function:rpa-idle-reaper" \
  --region $AWS_REGION

cd ../..

echo "✅ Lambda functions deployed"

# Step 7: Wait for service to be stable
echo "⏳ Waiting for service to stabilize..."

aws ecs wait services-stable \
  --cluster $ECS_CLUSTER \
  --services $ECS_SERVICE \
  --region $AWS_REGION

echo "✅ Service is stable"

# Step 8: Get service URL
echo "🌐 Getting service URL..."

SERVICE_URL=$(aws elbv2 describe-target-groups \
  --names rpa-backend \
  --region $AWS_REGION \
  --query 'TargetGroups[0].LoadBalancerArns[0]' \
  --output text 2>/dev/null || echo "Not available")

echo "🎉 Deployment completed successfully!"
echo "Service URL: $SERVICE_URL"
echo "ECS Cluster: $ECS_CLUSTER"
echo "ECS Service: $ECS_SERVICE"

# Clean up temporary files
rm -f aws-deployment/*.bak
rm -f lambda-functions/idle-reaper/idle-reaper.zip

echo "🧹 Cleanup completed"
