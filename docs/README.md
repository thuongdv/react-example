# Infrastructure Documentation Index

This directory contains comprehensive documentation for the React application infrastructure, including IaC (Infrastructure as Code), Docker containerization, and deployment guides.

## Quick Start

### First Time Deployment

```bash
# 1. Configure AWS credentials
aws configure

# 2. Initialize Pulumi
cd iac
pulumi stack init dev

# 3. Set configuration
pulumi config set serviceName react-service
pulumi config set environmentName dev
pulumi config set aws:region us-east-1

# 4. Deploy infrastructure
pulumi up

# 5. Get HAProxy public IP
../scripts/get-haproxy-ip.sh
```

For detailed steps, see [INFRASTRUCTURE_DEPLOYMENT.md](INFRASTRUCTURE_DEPLOYMENT.md).

### Local Development

```bash
# Start local deployment with Docker Compose
npm run local:start

# View logs
npm run local:logs

# Stop containers
npm run local:stop
```

See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for details.

## Documentation Guide

### Getting Started

- **[QUICK_START.md](QUICK_START.md)** - Fast track to running locally or in AWS
- **[INFRASTRUCTURE_DEPLOYMENT.md](INFRASTRUCTURE_DEPLOYMENT.md)** - Complete deployment guide with examples
- **[LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md)** - Docker Compose setup and local testing

### Configuration & Operations

- **[ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)** - All available configuration options, environment variables, and defaults
- **[HTTPS_SETUP.md](HTTPS_SETUP.md)** - SSL/TLS certificate management for local and cloud deployments
- **[ECS_AUTOSCALING.md](ECS_AUTOSCALING.md)** - Set up auto-scaling based on CPU/memory metrics

### Infrastructure & Monitoring

- **[INFRASTRUCTURE_MONITORING.md](INFRASTRUCTURE_MONITORING.md)** - CloudWatch, Container Insights, alarms, and metrics
- **[DOCKER_SECURITY.md](DOCKER_SECURITY.md)** - Image scanning, building secure containers, and best practices

### Architecture & Design

- **[ARCHITECTURE_UPDATE.md](ARCHITECTURE_UPDATE.md)** - System design, traffic flow, and component details
- **[BUILD_PUSH_CUSTOM_IMAGE.MD](BUILD_PUSH_CUSTOM_IMAGE.MD)** - Building and pushing custom HAProxy/Nginx images to ECR
- **[DOCKER_IMAGE_CHANGELOG.md](DOCKER_IMAGE_CHANGELOG.md)** - Image version history and updates

### CI/CD

- **[GITHUB_ACTIONS.md](GITHUB_ACTIONS.md)** - GitHub Actions workflows for automated testing and deployment

## Architecture Overview

```
Internet
  ↓
HAProxy (Public Subnets - ECS Fargate)
  - Ports: 8080 (HTTP → HTTPS redirect), 8443 (HTTPS)
  - Public IP assigned
  ↓
Nginx (Private Subnets - ECS Fargate)
  - Port: 80
  - No public IP
  - Accessible via Service Discovery: nginx.react-app.local
```

### Key Components

- **VPC**: 10.0.0.0/16 with public and private subnets
- **ECS Fargate**: Serverless container orchestration
- **HAProxy**: Load balancer + TLS terminator
- **Nginx**: Reverse proxy + web server
- **Service Discovery**: Private DNS for inter-service communication
- **CloudWatch**: Logs, metrics, and monitoring
- **ECR**: Docker image registry

## Helper Scripts

Located in [../scripts/](../scripts/):

### Infrastructure Management

```bash
# Get HAProxy public IP
./scripts/get-haproxy-ip.sh

# Comprehensive infrastructure operations
./scripts/infrastructure.sh status              # Show cluster/service status
./scripts/infrastructure.sh logs <service>     # View service logs
./scripts/infrastructure.sh tail <service>     # Follow logs in real-time
./scripts/infrastructure.sh scale <service> <n> # Scale service to N tasks
./scripts/infrastructure.sh health             # Check service health
./scripts/infrastructure.sh cpu-memory         # Show resource utilization
./scripts/infrastructure.sh ips                # Get public IPs
./scripts/infrastructure.sh ssh <service>      # SSH into container
```

### Container Management

```bash
# Build and push HAProxy image to ECR
./scripts/build-and-push-haproxy.sh <tag>

# Build and push Nginx image to ECR
./scripts/build-and-push-nginx.sh <tag>

# Start local deployment
./scripts/start-local.sh
```

## Common Tasks

### Deploy to AWS

```bash
cd iac
pulumi config set serviceName react-service
pulumi config set environmentName dev
pulumi up
```

### Monitor Infrastructure

```bash
# Real-time status
./scripts/infrastructure.sh status

# Follow logs
./scripts/infrastructure.sh tail haproxy

# Get metrics
./scripts/infrastructure.sh cpu-memory

# Check health
./scripts/infrastructure.sh health
```

### Scale Services

```bash
# Scale Nginx to 5 instances
./scripts/infrastructure.sh scale nginx 5

# Or via Pulumi config
pulumi config set ecs:nginx:desiredCount 5
pulumi up
```

### Update Container Images

```bash
# Build and push new HAProxy image
./scripts/build-and-push-haproxy.sh v1.1.0

# Update Pulumi to use new image
pulumi config set haproxy-image-uri 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:v1.1.0

# Deploy update
pulumi up
```

### Set Up Auto-Scaling

```bash
# See detailed guide
cat ECS_AUTOSCALING.md

# Quick setup
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/react-app-cluster/nginx-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10
```

### Monitor with CloudWatch

```bash
# View logs
aws logs tail /ecs/haproxy-service --follow

# Get metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=nginx-service

# Create dashboard (see INFRASTRUCTURE_MONITORING.md)
```

## Troubleshooting

### Services Not Starting

1. Check logs: `./scripts/infrastructure.sh tail <service>`
2. Check status: `./scripts/infrastructure.sh status`
3. Review events: `./scripts/infrastructure.sh events`
4. See [INFRASTRUCTURE_DEPLOYMENT.md#troubleshooting](INFRASTRUCTURE_DEPLOYMENT.md#troubleshooting)

### Can't Connect to HAProxy

1. Get IP: `./scripts/get-haproxy-ip.sh`
2. Check security groups allow ports 8080 and 8443
3. Verify HAProxy is healthy: `./scripts/infrastructure.sh health`
4. Test locally first: `npm run local:start` → `https://localhost`

### High CPU/Memory Usage

1. Check metrics: `./scripts/infrastructure.sh cpu-memory`
2. Increase task resources: `pulumi config set ecs:nginx:memory 1024`
3. Set up auto-scaling: See [ECS_AUTOSCALING.md](ECS_AUTOSCALING.md)
4. Review application logs: `./scripts/infrastructure.sh tail <service>`

### Service Discovery Not Working

1. Check namespace exists: See [ARCHITECTURE_UPDATE.md](ARCHITECTURE_UPDATE.md)
2. Test from container: `./scripts/infrastructure.sh ssh haproxy`
3. Inside container: `nslookup nginx.react-app.local 169.254.169.253`
4. See [INFRASTRUCTURE_DEPLOYMENT.md#service-discovery-not-working](INFRASTRUCTURE_DEPLOYMENT.md#service-discovery-not-working)

### HTTPS Certificate Issues

1. For local development: See [HTTPS_SETUP.md](HTTPS_SETUP.md)
2. For AWS testing: Use IP or temporary domain (see [HTTPS_SETUP.md](HTTPS_SETUP.md#cloud-deployment-aws-ecs))
3. For production: Use ACM + ALB or Let's Encrypt

## Configuration Examples

### Development Deployment

Minimal resources, single AZ:

```bash
pulumi config set vpc:azCount 1
pulumi config set ecs:haproxy:desiredCount 1
pulumi config set ecs:nginx:desiredCount 1
pulumi config set logging:retentionDays 7
```

### Production Deployment

High availability, multiple AZs:

```bash
pulumi config set vpc:azCount 3
pulumi config set ecs:haproxy:desiredCount 3
pulumi config set ecs:nginx:desiredCount 5
pulumi config set logging:retentionDays 30
pulumi config set logging:enableContainerInsights true
```

### High-Traffic Deployment

Large instances, aggressive scaling:

```bash
pulumi config set ecs:haproxy:cpu 1024
pulumi config set ecs:haproxy:memory 2048
pulumi config set ecs:nginx:cpu 512
pulumi config set ecs:nginx:memory 1024
# Then configure auto-scaling (see ECS_AUTOSCALING.md)
```

## Environment Variables Quick Reference

### Pulumi Config

```bash
# Required
serviceName                   # Service identifier
environmentName              # dev, staging, prod

# AWS
aws:region                   # us-east-1, eu-west-1, etc.

# VPC
vpc:cidrBlock               # Default: 10.0.0.0/16
vpc:azCount                 # Default: 2 (1-4)

# ECS Resources
ecs:haproxy:cpu             # Default: 256
ecs:haproxy:memory          # Default: 512 (MB)
ecs:haproxy:desiredCount    # Default: 1

ecs:nginx:cpu               # Default: 256
ecs:nginx:memory            # Default: 512 (MB)
ecs:nginx:desiredCount      # Default: 1

# Container Images
haproxy-image-uri          # Default: haproxy:3.3.1-alpine
nginx-image-uri            # Default: nginx:1.29.4-alpine

# Logging
logging:retentionDays      # Default: 7
logging:enableContainerInsights  # Default: true
```

See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for complete reference.

## Infrastructure as Code

### Pulumi Structure

```
iac/
├── index.ts                 # Entry point
├── package.json             # Dependencies
├── tsconfig.json
├── Pulumi.yaml              # Stack metadata
├── Pulumi.dev.yaml          # Development config
├── src/
│   ├── autotag.ts           # Automatic resource tagging
│   ├── config.ts            # Configuration validation
│   ├── deployment/
│   │   ├── factory.ts       # Service factory pattern
│   │   ├── service.ts       # Service base class
│   │   └── react-service.ts # React deployment
│   └── cloud/aws/
│       ├── ecr.ts           # ECR repositories
│       ├── ecs.ts           # ECS cluster & services
│       └── vpc.ts           # VPC & networking
```

### Key Patterns

- **Service Pattern**: All services extend `Service` base class
- **Factory Pattern**: `factory.ts` registers services
- **Auto-tagging**: Resources automatically tagged with Creator, Environment, Service
- **Configuration-driven**: All IaC parametrized via `pulumi config`

## Security Best Practices

1. **Never commit secrets**: Use Pulumi secrets or AWS Secrets Manager
2. **Keep images minimal**: Use Alpine base images
3. **Scan images**: ECR automatic scanning enabled
4. **Least privilege**: IAM roles have minimal permissions
5. **HTTPS only**: HAProxy terminates TLS, auto-redirects HTTP
6. **Logs enabled**: CloudWatch logs for audit trails
7. **Network isolation**: Private subnets for Nginx, public for HAProxy

See [DOCKER_SECURITY.md](DOCKER_SECURITY.md) for detailed guidelines.

## Cost Optimization

1. **Right-size resources**: Start with defaults, monitor actual usage
2. **Use auto-scaling**: Scale down during off-peak hours
3. **Scheduled scaling**: Scale up before business hours
4. **Monitor costs**: Regular AWS cost analysis
5. **Clean up unused resources**: Destroy stacks when not needed

See [ECS_AUTOSCALING.md](ECS_AUTOSCALING.md#cost-optimization) for details.

## Performance Tuning

1. **Container Insights**: Monitor actual utilization
2. **Adjust resources**: Based on CloudWatch metrics
3. **Configure auto-scaling**: With appropriate target values
4. **Health checks**: Fast fail detection (30s interval)
5. **Network optimization**: Properly configured security groups

See [INFRASTRUCTURE_MONITORING.md](INFRASTRUCTURE_MONITORING.md) for monitoring strategies.

## Additional Resources

- **[AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)**
- **[Pulumi AWS Provider](https://www.pulumi.com/docs/reference/pkg/aws/)**
- **[HAProxy Documentation](http://www.haproxy.org/#docs)**
- **[Nginx Documentation](https://nginx.org/en/docs/)**
- **[Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)**

## Contributing

When modifying infrastructure:

1. Test changes locally: `npm run local:start`
2. Preview in AWS: `pulumi preview`
3. Review changes carefully
4. Deploy: `pulumi up`
5. Monitor: `./scripts/infrastructure.sh status`
6. Document changes: Update relevant markdown files

## Support

For issues or questions:

1. Check the troubleshooting section in relevant guides
2. Review CloudWatch logs
3. Check AWS Console for service status
4. See [INFRASTRUCTURE_DEPLOYMENT.md#troubleshooting](INFRASTRUCTURE_DEPLOYMENT.md#troubleshooting)

---

**Last Updated**: 2026-01-20
**Infrastructure Version**: v1.0
**Compatible Pulumi**: v3.0+
