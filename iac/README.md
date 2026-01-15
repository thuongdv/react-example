# React App AWS Infrastructure with Pulumi

This Pulumi project deploys a complete AWS infrastructure for running a React application using:

- **VPC** with public and private subnets across 2 availability zones
- **HAProxy** as a load balancer running on ECS Fargate (public subnets)
- **Nginx** as a reverse proxy and static file server running on ECS Fargate (private subnets)
- **Application Load Balancer (ALB)** for distributing traffic to HAProxy
- **ECR repositories** for container images
- **ECS Cluster** with Fargate launch type

## Architecture Overview

```
Internet
   ↓
HAProxy Service (ECS Fargate - Public Subnets with Public IP)
   ↓
Nginx Service (ECS Fargate - Private Subnets)
   ↓
React App (Static Files)
```

## Directory Structure

```
iac/
├── index.ts                           # Main Pulumi stack file
├── src/
│   ├── deployment/
│   │   └── react-service.ts          # ReactService class (extends Service)
│   └── cloud/
│       └── aws/
│           ├── vpc.ts                # VPC, subnets, security groups
│           ├── ecs.ts                # ECS cluster, services, roles
│           └── ecr.ts                # ECR repositories
└── docker/
    ├── Dockerfile.haproxy             # HAProxy Dockerfile (sample)
    ├── Dockerfile.nginx               # Nginx Dockerfile (sample)
    ├── haproxy.cfg                    # HAProxy configuration
    └── nginx.conf                     # Nginx configuration
```

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI configured
3. Pulumi CLI installed
4. Node.js and npm installed
5. Docker (for building images)

## Setup & Deployment

### 1. Install Dependencies

```bash
cd iac
npm install
```

### 2. Create a Pulumi Stack

```bash
pulumi stack init dev
pulumi config set aws:region us-east-1
```

### 3. Build Docker Images (Optional)

If you have your own HAProxy and Nginx Docker images, build them and push to ECR:

```bash
# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=us-east-1

# Build HAProxy image
docker build -f docker/Dockerfile.haproxy -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/react-app-haproxy:latest .
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/react-app-haproxy:latest

# Build Nginx image
docker build -f docker/Dockerfile.nginx -t $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/react-app-nginx:latest .
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/react-app-nginx:latest
```

### 4. Deploy Infrastructure

```bash
pulumi up
```

This will:

- Create a VPC with public and private subnets
- Set up security groups for HAProxy and Nginx
- Create ECR repositories for both images
- Create an ECS cluster with Fargate capacity
- Deploy HAProxy service in public subnets
- Deploy Nginx service in private subnets
- Create an ALB and route traffic

### 5. Access Your Application

After deployment, HAProxy will be running in public subnets with public IPs. You can find the HAProxy service endpoint in the ECS console or via AWS CLI:

```bash
aws ecs describe-services --cluster react-app-cluster --services haproxy-service --region us-east-1
```

The public IP(s) of the HAProxy Fargate tasks will be your entry point. Access your app at:

```
http://<HAPROXY_PUBLIC_IP>
```

## Configuration

You can customize the deployment by setting Pulumi config values:

```bash
# Use custom HAProxy image URI
pulumi config set haproxy-image-uri <YOUR_ECR_URI>:latest

# Use custom Nginx image URI
pulumi config set nginx-image-uri <YOUR_ECR_URI>:latest
```

## File Descriptions

### cloud/aws/vpc.ts

Creates and configures:

- VPC with CIDR block 10.0.0.0/16
- 2 public subnets (10.0.0.0/24, 10.0.1.0/24)
- 2 private subnets (10.0.100.0/24, 10.0.101.0/24)
- Internet Gateway for public subnets
- NAT Gateway for private subnet outbound traffic
- Route tables and security groups

**Security Groups:**

- Public: Allows HTTP/HTTPS from internet, routes to Nginx
- Private: Allows traffic only from public security group

### cloud/aws/ecs.ts

Creates and configures:

- ECS cluster with Container Insights enabled
- Task execution and task IAM roles
- ECS services for HAProxy and Nginx
- Application Load Balancer
- Target groups and listeners
- CloudWatch logging

**Key Functions:**

- `createEcsCluster()`: Creates ECS cluster with Fargate capacity provider
- `createEcsService()`: Creates containerized services on Fargate
- `createTaskRole()` / `createTaskExecutionRole()`: Creates IAM roles for ECS tasks

### cloud/aws/ecr.ts

Creates ECR repositories:

- Image scanning on push enabled
- Mutable image tags
- Repositories for HAProxy and Nginx

### src/deployment/react-service.ts

Orchestrates the entire deployment:

- Calls VPC creation
- Creates ECR repositories
- Creates ECS cluster and services
- Sets up load balancing
- Exports stack outputs
- Provides deployment logging

### docker/

Sample Dockerfiles and configurations:

- **Dockerfile.haproxy**: Multi-stage HAProxy setup
- **Dockerfile.nginx**: Nginx with React app static files
- **haproxy.cfg**: HAProxy load balancer configuration
- **nginx.conf**: Nginx reverse proxy and static file serving

## Network Flow

1. **Internet** → **HAProxy (Port 80 on public IP)** - Load balancer in public subnets with Fargate
2. **HAProxy** → **Nginx (Port 80)** - Reverse proxy in private subnets via security group rules
3. **Nginx** → **React App** - Static files served from /usr/share/nginx/html

## Security Features

1. **Network Isolation**: Private subnets with NAT Gateway for outbound connectivity
2. **Security Groups**: Restrictive ingress/egress rules
3. **IAM Roles**: Task roles with minimal required permissions
4. **Image Scanning**: ECR repositories scan images on push
5. **Fargate**: No EC2 instance management overhead

## Monitoring & Logging

- ECS Container Insights enabled for cluster monitoring
- CloudWatch Log Groups created for each service
- 7-day log retention by default
- ALB health checks on /health endpoint

## Cleanup

To destroy all infrastructure:

```bash
pulumi destroy
```

This will:

- Delete all ECS services
- Remove the ECS cluster
- Delete the VPC and all subnets
- Remove security groups
- Delete ECR repositories (if empty)
- Clean up all related resources

## Next Steps

1. Build and push your HAProxy image to ECR
2. Build and push your Nginx image to ECR
3. Configure HAProxy to properly route to Nginx
4. Update Nginx to serve your React application
5. Set up custom domain names with Route53
6. Add HTTPS certificates with ACM
7. Configure auto-scaling policies for ECS services

## Troubleshooting

### Check Service Logs

```bash
aws logs tail /ecs/haproxy-service --follow
aws logs tail /ecs/nginx-service --follow
```

### Check ECS Service Status

```bash
aws ecs list-services --cluster react-app-cluster
aws ecs describe-services --cluster react-app-cluster --services haproxy-service nginx-service
```

### Check ALB Target Health

```bash
aws elbv2 describe-target-health --target-group-arn <TARGET_GROUP_ARN>
```

## Support

For issues or questions, refer to:

- [Pulumi AWS Documentation](https://www.pulumi.com/docs/reference/pkg/aws/)
- [AWS ECS Fargate Documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/launch_types.html)
- [HAProxy Documentation](http://www.haproxy.org/)
- [Nginx Documentation](https://nginx.org/en/docs/)

## AI Coding Agent Instructions

For comprehensive guidance on working with this codebase (including architecture, workflows, conventions, and troubleshooting), see the [GitHub Copilot instructions](../.github/copilot-instructions.md).
