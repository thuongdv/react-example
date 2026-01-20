#!/bin/bash

# Helper script for common infrastructure operations
# Usage: ./scripts/infrastructure.sh <command> [options]

set -e

REGION="${AWS_REGION:-us-east-1}"
CLUSTER="react-app-cluster"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function print_header() {
  echo -e "${BLUE}=== $1 ===${NC}"
}

function print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

function print_error() {
  echo -e "${RED}✗ $1${NC}"
}

function print_info() {
  echo -e "${YELLOW}ℹ $1${NC}"
}

function show_help() {
  cat << EOF
Infrastructure Helper Script

Usage: ./scripts/infrastructure.sh <command> [options]

Commands:
  status              Show cluster and service status
  logs <service>      View logs for a service (haproxy, nginx)
  tail <service>      Follow logs for a service
  scale <service> <n> Scale service to N tasks
  restart <service>   Restart a service (recreate tasks)
  cpu-memory          Show CPU and memory metrics
  health              Check service health status
  ips                 Get public IPs of all tasks
  ssh <service>       SSH into a container (requires ECS Exec)
  events              Show recent service events
  help                Show this help message

Examples:
  ./scripts/infrastructure.sh status
  ./scripts/infrastructure.sh logs haproxy
  ./scripts/infrastructure.sh scale nginx 3
  ./scripts/infrastructure.sh cpu-memory
EOF
}

function get_status() {
  print_header "Cluster Status: $CLUSTER"

  aws ecs describe-clusters \
    --clusters "$CLUSTER" \
    --region "$REGION" \
    --query 'clusters[0].[clusterName, status, registeredContainerInstancesCount, runningCount, pendingCount]' \
    --output table

  print_header "Service Status"

  aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services haproxy-service nginx-service \
    --region "$REGION" \
    --query 'services[].[serviceName, status, desiredCount, runningCount, pendingCount]' \
    --output table

  print_header "Task Status"

  local task_arns=$(aws ecs list-tasks \
    --cluster "$CLUSTER" \
    --region "$REGION" \
    --query 'taskArns[]' \
    --output text)

  if [ -z "$task_arns" ]; then
    print_info "No running tasks found"
  else
    aws ecs describe-tasks \
      --cluster "$CLUSTER" \
      --tasks $task_arns \
      --region "$REGION" \
      --query 'tasks[].[taskArn, lastStatus, taskStatus]' \
      --output table
  fi
}

function view_logs() {
  local service="$1"

  if [ -z "$service" ]; then
    print_error "Service name required"
    echo "Usage: ./scripts/infrastructure.sh logs <service>"
    echo "Services: haproxy, nginx"
    exit 1
  fi

  local log_group="/ecs/${service}-service"

  print_header "Recent Logs: $log_group"

  aws logs tail "$log_group" --max-items 50 --region "$REGION"
}

function follow_logs() {
  local service="$1"

  if [ -z "$service" ]; then
    print_error "Service name required"
    exit 1
  fi

  local log_group="/ecs/${service}-service"

  print_header "Following Logs: $log_group (Ctrl+C to stop)"

  aws logs tail "$log_group" --follow --region "$REGION"
}

function scale_service() {
  local service="$1"
  local count="$2"

  if [ -z "$service" ] || [ -z "$count" ]; then
    print_error "Service name and desired count required"
    echo "Usage: ./scripts/infrastructure.sh scale <service> <count>"
    exit 1
  fi

  local service_name="${service}-service"

  print_info "Scaling $service_name to $count tasks..."

  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$service_name" \
    --desired-count "$count" \
    --region "$REGION" \
    --no-cli-pager > /dev/null

  print_success "Service update initiated"
  echo "Use './scripts/infrastructure.sh status' to monitor progress"
}

function restart_service() {
  local service="$1"

  if [ -z "$service" ]; then
    print_error "Service name required"
    echo "Usage: ./scripts/infrastructure.sh restart <service>"
    exit 1
  fi

  local service_name="${service}-service"

  print_info "Restarting $service_name (this will recreate all tasks)..."

  # Get current desired count
  local desired_count=$(aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services "$service_name" \
    --region "$REGION" \
    --query 'services[0].desiredCount' \
    --output text)

  # Force new deployment
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$service_name" \
    --force-new-deployment \
    --region "$REGION" \
    --no-cli-pager > /dev/null

  print_success "Service restart initiated"
  print_info "Desired count: $desired_count. Monitoring status..."
  
  sleep 2
  get_status
}

function show_cpu_memory() {
  print_header "CPU & Memory Utilization (Last Hour)"

  aws cloudwatch get-metric-statistics \
    --namespace AWS/ECS \
    --metric-name CPUUtilization \
    --dimensions Name=ClusterName,Value="$CLUSTER" \
    --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
    --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
    --period 300 \
    --statistics Average,Maximum \
    --region "$REGION" \
    --query 'Datapoints | sort_by(@, &Timestamp)' \
    --output table | head -10

  echo ""

  aws cloudwatch get-metric-statistics \
    --namespace AWS/ECS \
    --metric-name MemoryUtilization \
    --dimensions Name=ClusterName,Value="$CLUSTER" \
    --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S)" \
    --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
    --period 300 \
    --statistics Average,Maximum \
    --region "$REGION" \
    --query 'Datapoints | sort_by(@, &Timestamp)' \
    --output table | head -10
}

function check_health() {
  print_header "Health Check Status"

  aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services haproxy-service nginx-service \
    --region "$REGION" \
    --query 'services[].[serviceName, deployments[0].status, deployments[0].runningCount, deployments[0].desiredCount]' \
    --output table

  print_header "Task Health"

  aws ecs list-tasks --cluster "$CLUSTER" --region "$REGION" --query 'taskArns[]' --output text | \
    xargs -I {} aws ecs describe-tasks \
      --cluster "$CLUSTER" \
      --tasks {} \
      --region "$REGION" \
      --query 'tasks[].[taskArn, healthStatus, lastStatus]' \
      --output table
}

function get_ips() {
  print_header "Public IPs"

  for service in haproxy-service nginx-service; do
    local task_arn=$(aws ecs list-tasks \
      --cluster "$CLUSTER" \
      --service-name "$service" \
      --region "$REGION" \
      --query 'taskArns[0]' \
      --output text)

    if [ -z "$task_arn" ] || [ "$task_arn" == "None" ]; then
      print_info "No running tasks for $service"
      continue
    fi

    local eni_id=$(aws ecs describe-tasks \
      --cluster "$CLUSTER" \
      --tasks "$task_arn" \
      --region "$REGION" \
      --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
      --output text)

    if [ -z "$eni_id" ]; then
      print_info "No ENI for $service"
      continue
    fi

    local public_ip=$(aws ec2 describe-network-interfaces \
      --network-interface-ids "$eni_id" \
      --region "$REGION" \
      --query 'NetworkInterfaces[0].Association.PublicIp' \
      --output text 2>/dev/null || echo "N/A")

    echo "$service: $public_ip"
  done
}

function exec_container() {
  local service="$1"

  if [ -z "$service" ]; then
    print_error "Service name required"
    exit 1
  fi

  local service_name="${service}-service"
  local task_arn=$(aws ecs list-tasks \
    --cluster "$CLUSTER" \
    --service-name "$service_name" \
    --region "$REGION" \
    --query 'taskArns[0]' \
    --output text)

  if [ -z "$task_arn" ] || [ "$task_arn" == "None" ]; then
    print_error "No running tasks found"
    exit 1
  fi

  local task_id=$(echo "$task_arn" | awk -F'/' '{print $NF}')

  print_info "Connecting to container in $service_name..."
  echo "Note: Type 'exit' to disconnect"
  echo ""

  aws ecs execute-command \
    --cluster "$CLUSTER" \
    --task "$task_id" \
    --container "$service_name" \
    --interactive \
    --command "/bin/sh" \
    --region "$REGION"
}

function show_events() {
  print_header "Recent Service Events"

  aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services haproxy-service nginx-service \
    --region "$REGION" \
    --query 'services[].events[0:5] | []' \
    --output table
}

# Main script
command="${1:-help}"

case "$command" in
  status)
    get_status
    ;;
  logs)
    view_logs "$2"
    ;;
  tail)
    follow_logs "$2"
    ;;
  scale)
    scale_service "$2" "$3"
    ;;
  restart)
    restart_service "$2"
    ;;
  cpu-memory)
    show_cpu_memory
    ;;
  health)
    check_health
    ;;
  ips)
    get_ips
    ;;
  ssh)
    exec_container "$2"
    ;;
  events)
    show_events
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    print_error "Unknown command: $command"
    echo ""
    show_help
    exit 1
    ;;
esac
