# Quick Deployment Guide

## Final Architecture

### Traffic Flow (Corrected)

```
Internet (0.0.0.0/0)
         ↓
    HTTP Port 80
         ↓
HAProxy Service (ECS Fargate in Public Subnets)
    Has Public IP
         ↓
    Security Group Rules
         ↓
Nginx Service (ECS Fargate in Private Subnets)
    No Public IP
         ↓
React Application (Static Files)
```

## Code Structure (Final)

```
iac/
├── index.ts                                  # Main entry - instantiates ReactService
├── package.json                              # Dependencies
├── tsconfig.json                             # TypeScript config
├── Pulumi.yaml                               # Stack configuration
├── Pulumi.dev.yaml                           # Dev environment config
│
├── src/
│   ├── autotag.ts                           # Auto-tagging utilities
│   │
│   ├── deployment/                          # Deployment orchestration
│   │   ├── service.ts                       # Abstract Service base class
│   │   ├── factory.ts                       # Service factory
│   │   └── react-service.ts                 # ReactService class (extends Service)
│   │
│   └── cloud/                               # Cloud provider code
│       └── aws/                             # AWS-specific implementations
│           ├── vpc.ts                       # VPC, subnets, security groups
│           ├── ecs.ts                       # ECS cluster, services, IAM roles
│           └── ecr.ts                       # ECR repositories
│
└── docker/
    ├── Dockerfile.haproxy                   # HAProxy container image
    ├── Dockerfile.nginx                     # Nginx container image
    ├── haproxy.cfg                          # HAProxy configuration
    └── nginx.conf                           # Nginx configuration
```

## Class Hierarchy

```
Service (abstract)
    ↓
    implements deploy(): Promise<outputs>
    ↓
ReactService (concrete)
    ↓
    creates: VPC, ECR, ECS Cluster, HAProxy Service, Nginx Service
    ↓
    exports: vpcId, clusterName, service names, repo URLs, security groups
```

## Deployment Steps

### 1. Install Dependencies

```bash
cd iac
npm install
```

### 2. Initialize Pulumi Stack

```bash
pulumi stack init dev
pulumi config set aws:region us-east-1
```

### 3. Review What Will Be Created

```bash
pulumi preview
```

### 4. Deploy Infrastructure

```bash
pulumi up
```

### 5. Get HAProxy Public IP

```bash
# List the tasks
aws ecs list-tasks --cluster react-app-cluster --service-name haproxy-service --region us-east-1

# Get task details
aws ecs describe-tasks --cluster react-app-cluster --tasks <TASK_ARN> --region us-east-1 --query 'tasks[*].{TaskArn:taskArn, PublicIP:attachments[0].details[?name==`publicIpv4Address`].value[0]}'
```

### 6. Access Application

```
http://<HAPROXY_PUBLIC_IP>
```

### 7. Build and Push Docker Images

```bash
# Get AWS account ID and ECR URLs from stack outputs
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=us-east-1

# Get repositories from Pulumi outputs
HAPROXY_REPO=$(pulumi stack output haproxyRepoUrl)
NGINX_REPO=$(pulumi stack output nginxRepoUrl)

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push HAProxy
docker build -f docker/Dockerfile.haproxy -t $HAPROXY_REPO:latest .
docker push $HAPROXY_REPO:latest

# Build and push Nginx
docker build -f docker/Dockerfile.nginx -t $NGINX_REPO:latest .
docker push $NGINX_REPO:latest
```

## Stack Outputs

After `pulumi up`, the following values are exported and can be accessed:

```bash
pulumi stack output vpcId              # VPC identifier
pulumi stack output clusterName        # ECS cluster name
pulumi stack output haproxyServiceName # HAProxy service name
pulumi stack output nginxServiceName   # Nginx service name
pulumi stack output haproxyRepoUrl     # HAProxy ECR repository
pulumi stack output nginxRepoUrl       # Nginx ECR repository
pulumi stack output publicSecurityGroupId
pulumi stack output privateSecurityGroupId
pulumi stack output publicSubnets      # Number of public subnets
pulumi stack output privateSubnets     # Number of private subnets
```

## Key Components

### VPC Resources

- **VPC**: 10.0.0.0/16
- **Public Subnets** (2): HAProxy runs here
  - 10.0.0.0/24 (AZ1)
  - 10.0.1.0/24 (AZ2)
- **Private Subnets** (2): Nginx runs here
  - 10.0.100.0/24 (AZ1)
  - 10.0.101.0/24 (AZ2)
- **NAT Gateway**: For private subnet outbound traffic
- **Internet Gateway**: For public subnet internet access

### Security Groups

- **Public SG**: Allows HTTP/HTTPS from 0.0.0.0/0
- **Private SG**: Allows HTTP/HTTPS only from Public SG

### ECS Services

- **HAProxy**: 2 Fargate tasks (256 CPU, 512 MB)
- **Nginx**: 2 Fargate tasks (256 CPU, 512 MB)
- Both services have CloudWatch logging enabled
- 7-day log retention

## HAProxy Configuration

The sample `haproxy.cfg` file:

```
frontend frontend
    bind *:80
    default_backend backend_nginx

backend backend_nginx
    balance roundrobin
    server nginx nginx:80 check
```

Update this to route to the Nginx service DNS name:

```
server nginx <nginx-service-dns>:80 check
```

## Nginx Configuration

The sample `nginx.conf` includes:

- Static file serving from `/usr/share/nginx/html`
- Reverse proxy for `/api/` endpoints
- Health check endpoint at `/health`
- Gzip compression

## Debugging

### Check ECS Task Logs

```bash
aws logs tail /ecs/haproxy-service --follow
aws logs tail /ecs/nginx-service --follow
```

### Check ECS Service Status

```bash
aws ecs describe-services --cluster react-app-cluster --services haproxy-service nginx-service
```

### List Running Tasks

```bash
aws ecs list-tasks --cluster react-app-cluster
```

### Get Task Details (including public IP)

```bash
aws ecs describe-tasks --cluster react-app-cluster --tasks <TASK_ARN>
```

## Cleanup

Remove all infrastructure:

```bash
pulumi destroy
```

Confirm when prompted.

## Important Notes

1. **HAProxy Public IP**: The HAProxy tasks will have elastic network interfaces with public IPs assigned
2. **Nginx Access**: Nginx is in private subnets and accessible only via HAProxy
3. **Cost**: Running 2 replicas of each service will incur AWS charges
4. **Security**: Update security groups if you need to restrict access
5. **Logs**: CloudWatch logs are retained for 7 days by default

## Troubleshooting

### HAProxy tasks not running

- Check CloudWatch logs
- Verify Docker image exists in ECR
- Check IAM permissions for task execution role

### Cannot reach HAProxy

- Verify task has public IP assigned
- Check security group allows port 80
- Verify Internet Gateway is attached to VPC

### Nginx not responding

- Check private subnet security group allows traffic from public SG
- Verify HAProxy config routes to correct Nginx endpoint
- Check Nginx CloudWatch logs

## Next Steps

1. ✅ Deploy infrastructure (`pulumi up`)
2. Push Docker images to ECR
3. Configure HAProxy to route to Nginx
4. Test end-to-end connectivity
5. Set up Route53 DNS (optional)
6. Add ACM certificates for HTTPS (optional)
7. Configure auto-scaling policies (optional)
