#!/bin/bash

# Helper script to get HAProxy public IP
# Usage: ./scripts/get-haproxy-ip.sh [region]

set -e

REGION="${1:-us-east-1}"
CLUSTER="react-app-cluster"
SERVICE="haproxy-service"

echo "Fetching HAProxy public IP from AWS..."

# Get task ARN
TASK_ARN=$(aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --region "$REGION" \
  --query 'taskArns[0]' \
  --output text)

if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" == "None" ]; then
  echo "Error: No running tasks found for $SERVICE in cluster $CLUSTER"
  exit 1
fi

echo "Task ARN: $TASK_ARN"

# Get ENI ID from task
ENI_ID=$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION" \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
  --output text)

if [ -z "$ENI_ID" ]; then
  echo "Error: Could not find ENI ID for task"
  exit 1
fi

echo "ENI ID: $ENI_ID"

# Get public IP from ENI
PUBLIC_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids "$ENI_ID" \
  --region "$REGION" \
  --query 'NetworkInterfaces[0].Association.PublicIp' \
  --output text)

if [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" == "None" ]; then
  echo "Error: Could not find public IP for ENI"
  echo "Note: The task might not have a public IP assigned yet"
  exit 1
fi

echo "Public IP: $PUBLIC_IP"
echo ""
echo "Test the deployment:"
echo "  HTTP (redirects to HTTPS):  curl -i http://$PUBLIC_IP:8080/"
echo "  HTTPS (with self-signed):   curl -k https://$PUBLIC_IP:8443/"
