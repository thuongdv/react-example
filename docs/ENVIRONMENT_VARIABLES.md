# Environment Variables Reference

This document provides a comprehensive reference for all environment variables and configuration values used in the infrastructure, Docker containers, and deployment pipeline.

## Pulumi Configuration Variables

Configure these via `pulumi config set`:

### Required Configuration

| Variable          | Description                        | Example                  |
| ----------------- | ---------------------------------- | ------------------------ |
| `serviceName`     | Name of the service being deployed | `react-service`          |
| `environmentName` | Environment identifier             | `dev`, `staging`, `prod` |
| `aws:region`      | AWS region for deployment          | `us-east-1`, `eu-west-1` |

```bash
pulumi config set serviceName react-service
pulumi config set environmentName dev
pulumi config set aws:region us-east-1
```

### Optional VPC Configuration

| Variable        | Default       | Description                  |
| --------------- | ------------- | ---------------------------- |
| `vpc:cidrBlock` | `10.0.0.0/16` | VPC CIDR block               |
| `vpc:azCount`   | `2`           | Number of availability zones |

```bash
pulumi config set vpc:cidrBlock 10.0.0.0/16
pulumi config set vpc:azCount 2
```

### Optional ECS Configuration

| Variable                   | Default | Description                  |
| -------------------------- | ------- | ---------------------------- |
| `ecs:haproxy:cpu`          | `256`   | CPU units for HAProxy task   |
| `ecs:haproxy:memory`       | `512`   | Memory (MB) for HAProxy task |
| `ecs:haproxy:desiredCount` | `1`     | Number of HAProxy tasks      |
| `ecs:nginx:cpu`            | `256`   | CPU units for Nginx task     |
| `ecs:nginx:memory`         | `512`   | Memory (MB) for Nginx task   |
| `ecs:nginx:desiredCount`   | `1`     | Number of Nginx tasks        |

```bash
# HAProxy configuration
pulumi config set ecs:haproxy:cpu 512
pulumi config set ecs:haproxy:memory 1024
pulumi config set ecs:haproxy:desiredCount 3

# Nginx configuration
pulumi config set ecs:nginx:cpu 256
pulumi config set ecs:nginx:memory 512
pulumi config set ecs:nginx:desiredCount 5
```

### Optional Image URIs

| Variable            | Default                | Description          |
| ------------------- | ---------------------- | -------------------- |
| `haproxy-image-uri` | `haproxy:3.3.1-alpine` | Custom HAProxy image |
| `nginx-image-uri`   | `nginx:1.29.4-alpine`  | Custom Nginx image   |

```bash
# Use custom images from ECR
pulumi config set haproxy-image-uri 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:v1.0.0
pulumi config set nginx-image-uri 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-nginx:v1.0.0
```

### Optional Logging Configuration

| Variable                          | Default | Description                   |
| --------------------------------- | ------- | ----------------------------- |
| `logging:retentionDays`           | `7`     | CloudWatch log retention      |
| `logging:enableContainerInsights` | `true`  | Enable ECS Container Insights |

```bash
pulumi config set logging:retentionDays 30
pulumi config set logging:enableContainerInsights true
```

## AWS Environment Variables

Set these in your shell for AWS CLI operations:

```bash
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
export AWS_DEFAULT_REGION=us-east-1
export AWS_PROFILE=myprofile  # If using AWS profiles
```

## Docker Container Environment Variables

### HAProxy Container

Set in [docker-compose.yml](../docker-compose.yml):

```yaml
environment:
  - HAPROXY_CONFIG=/usr/local/etc/haproxy/haproxy.local.cfg
```

**Available Variables** (for custom Dockerfile modifications):

- `HAPROXY_CONFIG`: Path to HAProxy configuration file
- `LOG_LEVEL`: Log verbosity (default: info)
- `MAX_CONNECTIONS`: Maximum concurrent connections

### Nginx Container

Set in [docker-compose.yml](../docker-compose.yml):

```yaml
environment:
  - NGINX_WORKER_PROCESSES=auto
```

**Available Variables**:

- `NGINX_WORKER_PROCESSES`: Number of worker processes (default: auto)
- `NGINX_WORKER_CONNECTIONS`: Connections per worker (default: 1024)

## ECS Task Environment Variables

Variables passed to ECS tasks at runtime:

### All Services

```bash
# Set via Pulumi config or ECS task definition
ENVIRONMENT=dev
SERVICE_NAME=haproxy-service
LOG_GROUP=/ecs/haproxy-service
REGION=us-east-1
```

### HAProxy-Specific

```bash
HAPROXY_CERT_PATH=/usr/local/etc/haproxy/certs/haproxy.pem
HAPROXY_CONFIG_PATH=/usr/local/etc/haproxy/haproxy.cfg
HAPROXY_LOG_LEVEL=info
```

### Nginx-Specific

```bash
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf
NGINX_BACKEND_HOST=nginx.react-app.local
NGINX_BACKEND_PORT=80
```

## Build Script Environment Variables

Use these when running build scripts:

```bash
# Set ECR repository (required for push scripts)
ECR_REGISTRY=123456789.dkr.ecr.us-east-1.amazonaws.com

# Set image tags
IMAGE_TAG=v1.0.0
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(git rev-parse --short HEAD)

# Push scripts will use:
# - haproxy-image-uri from Pulumi config
# - nginx-image-uri from Pulumi config
```

### Build Example

```bash
# Build with metadata
docker build \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  --build-arg VERSION=1.0.0 \
  -t react-app-haproxy:1.0.0 \
  -f docker/Dockerfile.haproxy \
  .
```

## Configuration Precedence

Pulumi configuration is resolved in this order (highest to lowest priority):

1. **Command-line flags**: `pulumi config set key value`
2. **Pulumi.env.yaml**: Stack-specific config file
3. **Environment variables**: `PULUMI_* ` variables
4. **Default values**: Hardcoded in [iac/src/config.ts](../iac/src/config.ts)

Example with environment variables:

```bash
# Set via environment
export PULUMI_CONFIG_SERVICENAME=react-service
export PULUMI_CONFIG_ENVIRONMENTNAME=prod

# This takes precedence over Pulumi.dev.yaml
pulumi up
```

## Stack-Specific Configuration

Create stack-specific config files for different environments:

### Development Stack (Pulumi.dev.yaml)

```yaml
config:
  serviceName: react-service
  environmentName: dev
  aws:region: us-east-1
  vpc:cidrBlock: 10.0.0.0/16
  vpc:azCount: 1
  ecs:haproxy:cpu: 256
  ecs:haproxy:memory: 512
  ecs:haproxy:desiredCount: 1
  ecs:nginx:cpu: 256
  ecs:nginx:memory: 512
  ecs:nginx:desiredCount: 1
  logging:retentionDays: 7
```

### Production Stack (Pulumi.prod.yaml)

```yaml
config:
  serviceName: react-service
  environmentName: prod
  aws:region: us-east-1
  vpc:cidrBlock: 10.0.0.0/16
  vpc:azCount: 3
  ecs:haproxy:cpu: 512
  ecs:haproxy:memory: 1024
  ecs:haproxy:desiredCount: 3
  ecs:nginx:cpu: 256
  ecs:nginx:memory: 512
  ecs:nginx:desiredCount: 5
  logging:retentionDays: 30
  logging:enableContainerInsights: true
```

Use with:

```bash
pulumi stack select prod
pulumi up
```

## Secrets Management

For sensitive values, use Pulumi secrets:

```bash
# Set secret value (encrypted in state file)
pulumi config set --secret db-password "my-secret-password"
pulumi config set --secret api-key "sk_live_..."

# Retrieve secret (only accessible in code via config)
pulumi config get --secret api-key
```

Secrets are encrypted and stored securely in your Pulumi state backend.

## Health Check Configuration

Health checks use environment-specific endpoints:

```bash
# HAProxy health check endpoint
/health

# Expected response (200 OK)
HTTP/1.1 200 OK

# Nginx health check endpoint
/health

# ECS health check command
CMD-SHELL, wget -qO- http://127.0.0.1:8080/health || exit 1
```

Configure in ECS task definition:

```typescript
healthCheck: {
  command: [
    "CMD-SHELL",
    `wget -qO- http://127.0.0.1:${healthCheckPort}/health || exit 1`,
  ],
  interval: 30,        // seconds
  timeout: 10,         // seconds
  retries: 5,          // max failures
  startPeriod: 120,    // grace period
}
```

## CloudWatch Logs Configuration

Log group naming convention:

```
/ecs/{service-name}
```

Examples:

- `/ecs/haproxy-service`
- `/ecs/nginx-service`
- `/ecs/react-app-service`

Log configuration in tasks:

```json
{
  "logDriver": "awslogs",
  "options": {
    "awslogs-group": "/ecs/haproxy-service",
    "awslogs-region": "us-east-1",
    "awslogs-stream-prefix": "ecs"
  }
}
```

## Example Deployments

### Development Deployment

```bash
cd iac
pulumi stack init dev
pulumi config set serviceName react-service
pulumi config set environmentName dev
pulumi config set aws:region us-east-1
pulumi config set vpc:azCount 1
pulumi up
```

### Production Deployment

```bash
cd iac
pulumi stack init prod
pulumi config set serviceName react-service
pulumi config set environmentName prod
pulumi config set aws:region us-east-1
pulumi config set vpc:azCount 3
pulumi config set ecs:haproxy:desiredCount 3
pulumi config set ecs:nginx:desiredCount 5
pulumi config set haproxy-image-uri 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:v1.0.0
pulumi config set nginx-image-uri 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-nginx:v1.0.0
pulumi up
```

## Validation and Defaults

The configuration is validated when you run `pulumi up`:

- Required fields must be provided (serviceName, environmentName, aws:region)
- CIDR blocks are validated as valid IP ranges
- AZ count must be between 1 and 4
- CPU/memory values must be valid ECS Fargate combinations
- Retention days must be positive

View validation in [iac/src/config.ts](../iac/src/config.ts#L107).
