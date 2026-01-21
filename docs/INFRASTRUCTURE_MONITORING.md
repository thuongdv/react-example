# Infrastructure Monitoring Guide

This guide provides comprehensive monitoring strategies for your ECS infrastructure deployed with Pulumi.

## Overview

The infrastructure includes three layers of monitoring:

1. **ECS Container Insights**: Cluster, service, and task metrics
2. **CloudWatch Logs**: Application and system logs from containers
3. **Custom Metrics**: Application-specific monitoring

## Container Insights Setup

Container Insights is automatically enabled in the ECS cluster configuration. Monitor your infrastructure in the AWS Console:

### Access Container Insights

1. Go to AWS Console → CloudWatch
2. Select "Container Insights" from the sidebar
3. Choose your cluster: `react-app-cluster`

### Available Metrics

**Cluster Metrics**

- CPU utilization (%)
- Memory utilization (%)
- Task count (desired vs. running)
- Service count
- Network bytes in/out

**Service Metrics**

- CPU and memory per service
- Task health status
- Deployment status
- Network performance

**Task Metrics**

- CPU and memory per task
- Task status and uptime
- Network I/O
- Container logs

### CloudWatch Dashboard

Create a custom dashboard for your services:

```bash
# Create dashboard with common metrics
aws cloudwatch put-dashboard \
  --dashboard-name react-app-dashboard \
  --dashboard-body '{
    "widgets": [
      {
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/ECS", "CPUUtilization", {"stat": "Average"}],
            [".", "MemoryUtilization", {"stat": "Average"}]
          ],
          "period": 300,
          "stat": "Average",
          "region": "us-east-1",
          "title": "Cluster Performance"
        }
      }
    ]
  }' \
  --region us-east-1
```

## CloudWatch Logs

View application logs from containers:

### Log Groups

Logs are automatically created for each service:

```
/ecs/haproxy-service
/ecs/nginx-service
```

### View Logs via CLI

```bash
# View recent logs for HAProxy
aws logs tail /ecs/haproxy-service --follow

# View logs from last hour with grep filter
aws logs filter-log-events \
  --log-group-name /ecs/haproxy-service \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --end-time $(date +%s)000 | jq '.events[] | .message'

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/haproxy-service \
  --filter-pattern "ERROR"

# Show last 20 log lines
aws logs tail /ecs/haproxy-service --max-items 20
```

### Log Insights Queries

CloudWatch Logs Insights enables powerful querying:

```sql
-- Count errors by level
fields @message
| filter @message like /ERROR/
| stats count() as error_count by @timestamp

-- Find slow requests (HAProxy example)
fields response_time
| filter response_time > 1000
| stats avg(response_time), max(response_time), pct(response_time, 95) as p95

-- Requests per minute
fields @timestamp
| stats count() as requests_per_minute by bin(1m)

-- Memory usage over time
fields @memoryUtilization
| stats avg(@memoryUtilization), max(@memoryUtilization) by bin(5m)

-- Failed health checks
fields @message
| filter @message like /health/
| filter @message like /FAIL/
| stats count() by @timestamp
```

Access Logs Insights in AWS Console:

1. CloudWatch → Logs → Insights
2. Select log group
3. Enter query and click "Run query"

### Log Retention

Logs are automatically retained for the configured period (default: 7 days):

```bash
# View log group retention
aws logs describe-log-groups \
  --log-group-name-prefix /ecs \
  --region us-east-1 | jq '.logGroups[] | {logGroupName, retentionInDays}'

# Change retention (update in Pulumi config)
pulumi config set logging:retentionDays 30
pulumi up
```

## Metrics and Alarms

### Key Metrics to Monitor

**HAProxy (Load Balancer)**

- CPU utilization: Should be < 80% under normal load
- Memory utilization: Should be < 70%
- Task health: All tasks should be healthy
- Network traffic: Monitor ingress/egress bytes

**Nginx (Web Server)**

- CPU utilization: Should be < 80%
- Memory utilization: Should be < 70%
- Task count: Running count should match desired count
- Request latency: Monitor response times

### Create Alarms

```bash
# Alarm for high CPU on HAProxy
aws cloudwatch put-metric-alarm \
  --alarm-name haproxy-high-cpu \
  --alarm-description "Alert when HAProxy CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=ServiceName,Value=haproxy-service Name=ClusterName,Value=react-app-cluster \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:alerts \
  --region us-east-1

# Alarm for task failures
aws cloudwatch put-metric-alarm \
  --alarm-name nginx-task-failures \
  --alarm-description "Alert if Nginx tasks are failing" \
  --metric-name TaskCount \
  --namespace AWS/ECS \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=ServiceName,Value=nginx-service Name=ClusterName,Value=react-app-cluster Name=ServiceMetricName,Value=RunningCount \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:alerts \
  --region us-east-1
```

### View Alarms

```bash
# List all alarms
aws cloudwatch describe-alarms --region us-east-1

# Get alarm status
aws cloudwatch describe-alarms \
  --alarm-names haproxy-high-cpu \
  --query 'MetricAlarms[0].[AlarmName, StateValue, StateReason]' \
  --region us-east-1
```

## Health Checks

### ECS Health Checks

Services perform periodic health checks:

```bash
# View health check status
aws ecs describe-services \
  --cluster react-app-cluster \
  --services haproxy-service nginx-service \
  --region us-east-1 | jq '.services[] | {serviceName, deploymentConfiguration: .deploymentConfiguration, runningCount: .runningCount, desiredCount: .desiredCount}'

# Get unhealthy tasks
aws ecs describe-services \
  --cluster react-app-cluster \
  --services nginx-service \
  --region us-east-1 | jq '.services[].deployments[] | select(.status=="PRIMARY")'
```

### Health Check Endpoint

Both services expose a `/health` endpoint:

```bash
# Test HAProxy health
curl -k https://<HAProxy-IP>:8443/health

# Test Nginx health (internal)
aws ecs execute-command \
  --cluster react-app-cluster \
  --task <TASK_ID> \
  --container nginx-service \
  --command "curl -f http://127.0.0.1:80/health" \
  --region us-east-1
```

## Service Monitoring

### Get Service Status

```bash
# Detailed service status
aws ecs describe-services \
  --cluster react-app-cluster \
  --services haproxy-service nginx-service \
  --region us-east-1 | jq '.services[] | {
    serviceName,
    status,
    desiredCount,
    runningCount,
    pendingCount,
    deployments: [.deployments[] | {status, runningCount, desiredCount}]
  }'

# Watch service status in real-time
watch -n 5 'aws ecs describe-services \
  --cluster react-app-cluster \
  --services haproxy-service nginx-service \
  --region us-east-1 | jq ".services[] | {serviceName: .serviceName, status: .status, running: .runningCount, desired: .desiredCount}"'
```

### Event Monitoring

Services emit events to CloudWatch Events:

```bash
# View service events
aws ecs describe-services \
  --cluster react-app-cluster \
  --services nginx-service \
  --region us-east-1 | jq '.services[0].events[0:10] | .[] | {createdAt: .createdAt, message: .message}'

# Get latest 5 events for all services
aws ecs list-tasks --cluster react-app-cluster --region us-east-1 | \
  jq -r '.taskArns[]' | \
  head -5 | \
  xargs -I {} aws ecs describe-tasks \
    --cluster react-app-cluster \
    --tasks {} \
    --region us-east-1 | \
  jq '.tasks[] | {taskArn, lastStatus, createdAt}'
```

## Performance Monitoring

### CPU and Memory Trends

```bash
# Get 1-week CPU trend
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=haproxy-service Name=ClusterName,Value=react-app-cluster \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Maximum \
  --region us-east-1 | jq '.Datapoints | sort_by(.Timestamp) | .[] | {Timestamp, Average, Maximum}'

# Get memory trend
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name MemoryUtilization \
  --dimensions Name=ServiceName,Value=nginx-service Name=ClusterName,Value=react-app-cluster \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Maximum \
  --region us-east-1 | jq '.Datapoints | sort_by(.Timestamp) | .[] | {Timestamp, Average, Maximum}'
```

### Network I/O Monitoring

```bash
# Network bytes in (ingress)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name NetworkBytesIn \
  --dimensions Name=ServiceName,Value=haproxy-service \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1 | jq '.Datapoints | sort_by(.Timestamp) | .[] | {Timestamp, BytesIn: .Sum}'

# Network bytes out (egress)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name NetworkBytesOut \
  --dimensions Name=ServiceName,Value=haproxy-service \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region us-east-1 | jq '.Datapoints | sort_by(.Timestamp) | .[] | {Timestamp, BytesOut: .Sum}'
```

## Troubleshooting with Monitoring

### Services Unhealthy

```bash
# Check task status
aws ecs list-tasks --cluster react-app-cluster --service-name nginx-service --region us-east-1 | \
  xargs -I {} aws ecs describe-tasks --cluster react-app-cluster --tasks {} --region us-east-1 | \
  jq '.tasks[] | {taskArn, lastStatus, healthStatus, stoppedCode, stoppedReason}'

# Check logs for errors
aws logs filter-log-events \
  --log-group-name /ecs/nginx-service \
  --filter-pattern "ERROR" \
  --start-time $(date -d '15 minutes ago' +%s)000 \
  --region us-east-1 | jq '.events[] | {timestamp: .timestamp, message: .message}'
```

### High Resource Usage

```bash
# Identify which task is using most CPU
aws ecs describe-tasks \
  --cluster react-app-cluster \
  --tasks <task-arn> \
  --region us-east-1 | \
  jq '.tasks[] | {taskArn, cpu: .cpu, memory: .memory, containers: .containers[] | {name, image}}'

# Consider scaling
pulumi config set ecs:nginx:memory 1024
pulumi up
```

### Deployment Issues

```bash
# Check deployment events
aws ecs describe-services \
  --cluster react-app-cluster \
  --services haproxy-service \
  --region us-east-1 | jq '.services[0] | {deployments, events: .events[0:5]}'

# Check task logs during deployment
aws logs tail /ecs/haproxy-service --follow --since 10m
```

## Recommended Monitoring Schedule

| Frequency     | Task                                                          |
| ------------- | ------------------------------------------------------------- |
| **Real-time** | Dashboard view during deployments, monitor critical alarms    |
| **Hourly**    | Check alarm status, scan logs for errors                      |
| **Daily**     | Review service health, check performance trends               |
| **Weekly**    | Analyze CPU/memory usage, plan scaling needs                  |
| **Monthly**   | Review all metrics, optimize configurations, archive old logs |

## Cost Monitoring

Monitor your AWS costs related to infrastructure:

```bash
# Get ECS Fargate costs for last 30 days
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "BlendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --filter file://ecs-filter.json \
  --region us-east-1 | jq '.ResultsByTime[] | {TimePeriod: .TimePeriod.Start, Groups: .Groups[] | {Service: .Keys[0], Cost: .Metrics.BlendedCost.Amount}}'
```

Create `ecs-filter.json`:

```json
{
  "Dimensions": {
    "Key": "SERVICE",
    "Values": ["Amazon EC2 Container Service"]
  }
}
```

## Additional Resources

- [CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)
- [ECS Container Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
- [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)
- [ECS Best Practices - Monitoring](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/get-ecs-monitoring.html)
