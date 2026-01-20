# ECS Auto-Scaling Configuration Guide

This guide provides step-by-step instructions for setting up auto-scaling for your ECS services.

## What is Auto-Scaling?

Auto-scaling automatically adjusts the number of running tasks based on demand:

- **Scale Up**: Add more tasks when CPU/memory usage exceeds thresholds
- **Scale Down**: Remove tasks when usage drops below thresholds
- **Cost Optimization**: Only pay for resources you're using

## Before You Start

Ensure:

- ECS service is deployed and running
- CloudWatch monitoring is enabled (Container Insights)
- IAM permissions for auto-scaling

## Setting Up Target Tracking

Target tracking scales services to maintain a specific metric value (e.g., 70% CPU utilization).

### 1. Create Auto-Scaling Target

```bash
# Register scalable target for HAProxy service
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/haproxy-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 5 \
  --region us-east-1

# Register scalable target for Nginx service
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10 \
  --region us-east-1
```

Parameters:

- `min-capacity`: Minimum tasks to keep running
- `max-capacity`: Maximum tasks allowed (cost control)

### 2. Create Scaling Policy

Create a policy to scale based on CPU utilization:

```bash
# CPU-based scaling policy for HAProxy
aws application-autoscaling put-scaling-policy \
  --policy-name haproxy-cpu-scaling \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/haproxy-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 300
  }' \
  --region us-east-1

# Memory-based scaling policy for Nginx
aws application-autoscaling put-scaling-policy \
  --policy-name nginx-memory-scaling \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 80.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageMemoryUtilization"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 300
  }' \
  --region us-east-1
```

Parameters:

- `TargetValue`: Target metric value (e.g., 70% CPU)
- `ScaleOutCooldown`: Wait time (seconds) before allowing another scale up
- `ScaleInCooldown`: Wait time (seconds) before allowing another scale down

### 3. Verify Scaling Policy

```bash
# List scaling policies
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --region us-east-1 | jq '.ScalingPolicies[] | {PolicyName, ResourceId, PolicyType}'

# Get detailed policy information
aws application-autoscaling describe-scaling-policies \
  --policy-names haproxy-cpu-scaling \
  --service-namespace ecs \
  --region us-east-1
```

## Scaling Metrics

### Available Metrics

**CPU Utilization**

- Metric: `ECSServiceAverageCPUUtilization`
- Good for: Services with variable workload
- Example target: 60-80%

**Memory Utilization**

- Metric: `ECSServiceAverageMemoryUtilization`
- Good for: Memory-intensive applications
- Example target: 70-85%

**ALB Request Count** (if using ALB)

- Metric: `ALBRequestCountPerTarget`
- Good for: HTTP services
- Example target: 1000 requests per minute

**Custom Metrics** (from CloudWatch)

- Advanced: Scale on any custom metric

### Choosing Targets

| Service                 | Metric | Target |
| ----------------------- | ------ | ------ |
| HAProxy (Load Balancer) | CPU    | 60-70% |
| Nginx (Web Server)      | CPU    | 70-80% |
| API Server              | Memory | 75-85% |
| Cache Service           | CPU    | 50-60% |

## Testing Auto-Scaling

### Generate Load

Use a load testing tool to trigger scaling:

```bash
# Install Apache Bench (ab)
# macOS: brew install ab
# Linux: sudo apt-get install apache2-utils

# Generate load on HAProxy
ab -n 10000 -c 100 http://<HAProxy-IP>:8080/

# Monitor scaling
watch -n 5 'aws ecs describe-services \
  --cluster react-app-cluster \
  --services haproxy-service \
  --region us-east-1 | jq ".services[0].desiredCount, .services[0].runningCount"'
```

### Monitor Scaling Events

Check CloudWatch for scaling activity:

```bash
# View scaling policy activity
aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --region us-east-1 \
  --query 'ScalingActivities[0:5] | sort_by(@, &EndTime) | reverse(@)' \
  | jq '.[] | {StartTime, EndTime, Cause, StatusMessage}'

# Follow scaling events in real-time
watch -n 5 'aws application-autoscaling describe-scaling-activities \
  --service-namespace ecs \
  --region us-east-1 | jq ".ScalingActivities[0] | {StartTime, Cause}"'
```

### Check Metrics in CloudWatch

View actual CPU/memory utilization:

```bash
# Get average CPU for last hour
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=react-app-cluster Name=ServiceName,Value=haproxy-service \
  --statistics Average \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --region us-east-1 | jq '.Datapoints | sort_by(.Timestamp) | .[] | {Timestamp, Average}'
```

## Advanced Configuration

### Step Scaling (More Granular Control)

Use step scaling for more precise scaling behavior:

```bash
# Create step scaling policy (scales faster at higher utilization)
aws application-autoscaling put-scaling-policy \
  --policy-name haproxy-step-scaling \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/haproxy-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type StepScaling \
  --step-scaling-policy-configuration '{
    "AdjustmentType": "PercentChangeInCapacity",
    "StepAdjustments": [
      {
        "MetricIntervalLowerBound": 0,
        "MetricIntervalUpperBound": 10,
        "ScalingAdjustment": 10
      },
      {
        "MetricIntervalLowerBound": 10,
        "MetricIntervalUpperBound": 20,
        "ScalingAdjustment": 30
      },
      {
        "MetricIntervalLowerBound": 20,
        "ScalingAdjustment": 50
      }
    ],
    "Cooldown": 300
  }' \
  --region us-east-1
```

### Scheduled Scaling

Scale at specific times (e.g., for known traffic patterns):

```bash
# Scale up before business hours (8 AM UTC)
aws application-autoscaling put-scheduled-action \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --scheduled-action-name scale-up-morning \
  --schedule 'cron(0 8 ? * MON-FRI *)' \
  --timezone UTC \
  --scalable-target-action MinCapacity=3,MaxCapacity=15 \
  --region us-east-1

# Scale down after business hours (6 PM UTC)
aws application-autoscaling put-scheduled-action \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --scheduled-action-name scale-down-evening \
  --schedule 'cron(0 18 ? * MON-FRI *)' \
  --timezone UTC \
  --scalable-target-action MinCapacity=1,MaxCapacity=5 \
  --region us-east-1
```

## Monitoring Scaling Health

### CloudWatch Alarms

Create alarms to notify you of scaling issues:

```bash
# Alarm if service can't scale due to reaching max capacity
aws cloudwatch put-metric-alarm \
  --alarm-name haproxy-max-capacity-alarm \
  --alarm-description "Alert when HAProxy reaches max capacity" \
  --metric-name RunningCount \
  --namespace AWS/ECS \
  --statistic Maximum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --dimensions Name=ClusterName,Value=react-app-cluster Name=ServiceName,Value=haproxy-service \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:alert-topic \
  --region us-east-1
```

### Cost Optimization

Monitor the impact of auto-scaling:

```bash
# Get cost estimate for current scaling
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '7 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "BlendedCost" \
  --filter file://filter.json \
  --region us-east-1
```

## Troubleshooting

### Services Not Scaling

```bash
# Check if scalable target is registered
aws application-autoscaling describe-scalable-targets \
  --service-namespace ecs \
  --resource-ids service/react-app-cluster/nginx-service \
  --region us-east-1

# Check scaling policy
aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --region us-east-1 | jq '.ScalingPolicies[] | select(.ResourceId=="service/react-app-cluster/nginx-service")'

# Check CloudWatch metrics are available
aws cloudwatch list-metrics \
  --namespace AWS/ECS \
  --dimensions Name=ServiceName,Value=nginx-service \
  --region us-east-1
```

### Scaling Too Aggressive

Adjust cooldown and target values:

```bash
# Increase scale-out cooldown to reduce rapid scaling
aws application-autoscaling put-scaling-policy \
  --policy-name nginx-memory-scaling \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 80.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageMemoryUtilization"
    },
    "ScaleOutCooldown": 300,
    "ScaleInCooldown": 600
  }' \
  --region us-east-1
```

### High Costs

Check if over-provisioning:

```bash
# View current task count
aws ecs describe-services \
  --cluster react-app-cluster \
  --services haproxy-service nginx-service \
  --region us-east-1 | jq '.services[] | {ServiceName: .serviceName, DesiredCount: .desiredCount, RunningCount: .runningCount}'

# Reduce max capacity if consistently under-utilized
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 5 \  # Reduced from 10
  --region us-east-1
```

## Disabling Auto-Scaling

If you need to stop auto-scaling:

```bash
# Deregister scalable target
aws application-autoscaling deregister-scalable-target \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --region us-east-1

# Manually set desired count
aws ecs update-service \
  --cluster react-app-cluster \
  --service nginx-service \
  --desired-count 3 \
  --region us-east-1
```

## Best Practices

1. **Start Conservative**: Begin with high target values (80%+) to avoid excessive scaling
2. **Monitor Costs**: Track how scaling affects your AWS bill
3. **Use Multiple Metrics**: Combine CPU and memory for better decisions
4. **Plan for Peak Load**: Set `max-capacity` high enough to handle peak demand
5. **Regular Reviews**: Check scaling history monthly and adjust policies
6. **Set Up Alarms**: Know when your service hits capacity limits
7. **Test Thoroughly**: Validate scaling behavior under realistic load
