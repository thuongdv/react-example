# Infrastructure Deployment Guide

This guide provides step-by-step instructions for deploying the React application infrastructure to AWS using Pulumi.

## Prerequisites

Before deploying, ensure you have:

- **Pulumi CLI**: [Install latest version](https://www.pulumi.com/docs/get-started/install/)
- **AWS CLI**: v2.x configured with credentials
- **Node.js**: v18+ with npm
- **Docker**: For building and testing container images locally
- **AWS Account**: With appropriate IAM permissions

Verify installations:

```bash
pulumi version
aws --version
node --version
npm --version
docker --version
```

## AWS IAM Permissions

Your AWS user or role requires permissions for:

- ECS (Elastic Container Service)
- EC2 (VPC, subnets, security groups, NAT gateways)
- ECR (Elastic Container Registry)
- CloudWatch (logs, log groups)
- Service Discovery
- IAM (roles and policies)
- Elastic IPs and Network Interfaces

## Initial Setup

### 1. Configure AWS Credentials

```bash
# Using AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1
```

### 2. Initialize Pulumi Stack

```bash
cd iac

# Create a new stack for your environment
pulumi stack init dev

# Or select existing stack
pulumi stack select dev
```

### 3. Configure Stack Parameters

Set required configuration values:

```bash
# Required configurations
pulumi config set serviceName react-service
pulumi config set environmentName dev
pulumi config set aws:region us-east-1

# Optional: Custom image URIs (if pushing to ECR first)
# pulumi config set haproxy-image-uri 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:latest
# pulumi config set nginx-image-uri 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-nginx:latest

# Optional: VPC and ECS customization
# pulumi config set vpc:azCount 2
# pulumi config set ecs:haproxy:desiredCount 2
# pulumi config set ecs:nginx:desiredCount 3
```

View all configured values:

```bash
pulumi config
```

## Deployment Process

### 1. Preview Changes

Before deploying, see what Pulumi will create:

```bash
pulumi preview
```

Review the resource plan. Look for:

- VPC, subnets, and security groups
- ECR repositories
- ECS cluster and services
- CloudWatch log groups
- Service Discovery namespace

### 2. Deploy Infrastructure

Deploy all resources:

```bash
pulumi up
```

You'll be prompted to review the changes. Type `yes` to proceed.

**Deployment time**: 3-5 minutes

### 3. Verify Deployment

After deployment completes, check stack outputs:

```bash
pulumi stack output
```

Key outputs:

- `vpcId`: Your VPC identifier
- `clusterName`: ECS cluster name
- `haproxyServiceName` / `nginxServiceName`: Service names
- `nginxServiceDiscoveryDns`: Internal DNS name for Nginx (`nginx.react-app.local`)

### 4. Get HAProxy Public IP

Find the public IP assigned to HAProxy:

```bash
# List ECS tasks
aws ecs list-tasks --cluster react-app-cluster --service-name haproxy-service --region us-east-1

# Get task details (replace TASK_ARN)
aws ecs describe-tasks --cluster react-app-cluster --tasks <TASK_ARN> --region us-east-1

# Extract public IP from network interface
aws ec2 describe-network-interfaces --network-interface-ids <ENI_ID> --region us-east-1 | jq '.NetworkInterfaces[0].Association.PublicIp'
```

Or use this helper script:

```bash
./scripts/get-haproxy-ip.sh
```

## Testing the Deployment

### 1. Test HTTP Redirect

```bash
# Should redirect to HTTPS with 301 status
curl -i http://<HAProxy-IP>:8080/

# Expected response:
# HTTP/1.1 301 Moved Permanently
# Location: https://<HAProxy-IP>:8443/
```

### 2. Test HTTPS Connection

```bash
# Accept self-signed certificate (for testing)
curl -k https://<HAProxy-IP>:8443/

# Or with verbose output
curl -k -v https://<HAProxy-IP>:8443/
```

### 3. Check Service Logs

View HAProxy logs:

```bash
aws logs tail /ecs/haproxy-service --follow --region us-east-1
```

View Nginx logs:

```bash
aws logs tail /ecs/nginx-service --follow --region us-east-1
```

### 4. Verify Service Discovery

Inside HAProxy container, verify Nginx is discoverable:

```bash
# Get HAProxy task ID
aws ecs describe-tasks --cluster react-app-cluster --tasks <TASK_ARN> --region us-east-1

# Exec into container (requires ECS Exec enabled)
aws ecs execute-command \
  --cluster react-app-cluster \
  --task <TASK_ID> \
  --container haproxy-service \
  --interactive \
  --command "/bin/sh"

# Inside container, test DNS resolution
nslookup nginx.react-app.local 169.254.169.253
```

## Updating Deployment

### Update Container Images

To deploy a new version of HAProxy or Nginx:

```bash
# Build and push new HAProxy image
./scripts/build-and-push-haproxy.sh v2.0.0

# Set Pulumi to use new image
pulumi config set haproxy-image-uri <ECR_URL>:v2.0.0

# Deploy update
pulumi up
```

### Scale Services

Change desired task count:

```bash
# Scale Nginx to 3 instances
pulumi config set ecs:nginx:desiredCount 3

# Deploy
pulumi up
```

### Modify Resource Sizes

Change CPU/memory allocation:

```bash
# Increase HAProxy memory to 1024 MB
pulumi config set ecs:haproxy:memory 1024

# Deploy
pulumi up
```

## Monitoring

### CloudWatch Container Insights

View cluster metrics in AWS Console:

- ECS → Clusters → react-app-cluster → Container Insights

Metrics monitored:

- CPU/Memory utilization
- Task count and status
- Network performance

### CloudWatch Logs

View structured logs for each service:

- HAProxy: `/ecs/haproxy-service`
- Nginx: `/ecs/nginx-service`

Filter logs by level:

```bash
# View errors and warnings
aws logs filter-log-events \
  --log-group-name /ecs/haproxy-service \
  --filter-pattern "ERROR WARN" \
  --region us-east-1
```

## Troubleshooting

### Services Not Healthy

Check CloudWatch logs and ECS task status:

```bash
# List tasks
aws ecs list-tasks --cluster react-app-cluster --region us-east-1

# Describe task to see status
aws ecs describe-tasks --cluster react-app-cluster --tasks <TASK_ARN> --region us-east-1 | jq '.tasks[0].lastStatus, .tasks[0].taskStatus'
```

### Service Discovery Not Working

Verify namespace and services exist:

```bash
# List namespaces
aws servicediscovery list-namespaces

# List services
aws servicediscovery list-services --filters Name=NAMESPACE_ID,Values=<NAMESPACE_ID>

# Check service instances
aws servicediscovery discover-instances --namespace-name react-app.local --service-name nginx
```

### Can't Connect to HAProxy

1. Verify security group allows traffic on 8080 and 8443
2. Check HAProxy task is running and healthy
3. Ensure public IP is assigned to ENI

```bash
# Verify security group rules
aws ec2 describe-security-groups --group-ids <SG_ID> --region us-east-1 | jq '.SecurityGroups[0].IpPermissions'
```

## Cleanup

### Destroy Stack

Remove all AWS resources:

```bash
pulumi destroy
```

**Warning**: This will delete the VPC, ECS cluster, ECR repositories, and all related resources. Data loss is permanent.

### Remove Pulumi Stack

After destroying resources:

```bash
pulumi stack rm dev
```

## Advanced Configuration

### Multi-AZ Deployment

For high availability, deploy across multiple availability zones:

```bash
pulumi config set vpc:azCount 3
pulumi up
```

### Custom VPC CIDR

Deploy to a different CIDR block:

```bash
pulumi config set vpc:cidrBlock 172.16.0.0/16
pulumi up
```

### Production Configuration Example

```bash
pulumi config set environmentName prod
pulumi config set ecs:haproxy:desiredCount 3
pulumi config set ecs:nginx:desiredCount 5
pulumi config set logging:retentionDays 30
pulumi config set logging:enableContainerInsights true
pulumi up
```

## Additional Resources

- [Pulumi AWS Documentation](https://www.pulumi.com/docs/reference/pkg/aws/)
- [ECS Fargate Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_size.html)
- [AWS VPC Design](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Introduction.html)
- [Service Discovery in Amazon ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html)
