# Architecture Update Summary

## Changes Made

### 1. **Corrected Traffic Flow**

- **Original**: Internet → ALB → HAProxy → Nginx
- **Updated**: Internet → HAProxy → Nginx (Direct access to HAProxy in public subnets)
- HAProxy runs on Fargate with public IP assignment in public subnets
- No ALB required - HAProxy acts as the entry point

### 2. **Refactored Code Structure**

- Moved AWS infrastructure code to `iac/src/cloud/aws/` (existing folder structure)
  - `vpc.ts` - VPC, subnets, security groups, NAT Gateway
  - `ecs.ts` - ECS cluster, services, IAM roles (removed ALB, load balancer, target group code)
  - `ecr.ts` - ECR repositories

### 3. **ReactService Class Structure**

- `ReactService` now extends abstract `Service` class
- Implements `deploy()` method as required by Service interface
- Uses `this.pulumiConfig` to access configuration values
- Returns typed output dictionary

### 4. **Main Entry Point**

- `iac/index.ts` instantiates `ReactService` with Pulumi config
- Calls `deploy()` method and exports all outputs
- Clean async handling with proper Promise chaining

## Architecture Details

### Traffic Flow

```
Internet (0.0.0.0/0)
    ↓
HAProxy Service (ECS Fargate, Public Subnets, Public IPs)
Port 80 (accessible via public IP)
    ↓ (via Security Group rules)
Nginx Service (ECS Fargate, Private Subnets, No Public IPs)
Port 80 (internally routed)
    ↓
React App (Static Files)
```

### VPC Structure

- **VPC CIDR**: 10.0.0.0/16
- **Public Subnets**: 10.0.0.0/24, 10.0.1.0/24 (2 AZs)
  - HAProxy runs here with public IPs
  - Internet Gateway for internet access
- **Private Subnets**: 10.0.100.0/24, 10.0.101.0/24 (2 AZs)
  - Nginx runs here without public IPs
  - NAT Gateway for outbound connectivity

### Security Groups

- **Public SG**:
  - Ingress: HTTP (80) and HTTPS (443) from 0.0.0.0/0
  - Egress: All traffic
  - Used by: HAProxy
- **Private SG**:
  - Ingress: HTTP (80) and HTTPS (443) from Public SG only
  - Egress: All traffic
  - Used by: Nginx

### ECS Services

- **HAProxy Service**:
  - 2 Fargate tasks (CPU: 256, Memory: 512MB)
  - Public subnets with public IP assignment
  - Accessible from internet on port 80
- **Nginx Service**:
  - 2 Fargate tasks (CPU: 256, Memory: 512MB)
  - Private subnets without public IPs
  - Accessible only from HAProxy via security group

## File Organization

```
iac/
├── index.ts                               # Main stack - instantiates ReactService
├── src/
│   ├── deployment/
│   │   ├── react-service.ts              # ReactService class (extends Service)
│   │   ├── service.ts                    # Abstract Service base class
│   │   └── factory.ts                    # Service factory
│   └── cloud/
│       └── aws/
│           ├── vpc.ts                    # VPC resources
│           ├── ecs.ts                    # ECS cluster and services
│           └── ecr.ts                    # ECR repositories
└── docker/
    ├── Dockerfile.haproxy                # HAProxy image
    ├── Dockerfile.nginx                  # Nginx image
    ├── haproxy.cfg                       # HAProxy config
    └── nginx.conf                        # Nginx config
```

## Configuration

Pulumi config values (optional):

- `haproxy-image-uri`: Custom HAProxy ECR image URI
- `nginx-image-uri`: Custom Nginx ECR image URI
- `aws:region`: AWS region (configured separately)

## Stack Outputs

```
vpcId: VPC ID
clusterName: ECS cluster name
haproxyServiceName: HAProxy service name
nginxServiceName: Nginx service name
haproxyRepoUrl: HAProxy ECR repository URL
nginxRepoUrl: Nginx ECR repository URL
publicSecurityGroupId: Public security group ID
privateSecurityGroupId: Private security group ID
publicSubnets: Number of public subnets (2)
privateSubnets: Number of private subnets (2)
```

## Deployment Access

After deployment, find HAProxy public IPs:

```bash
# List ECS tasks with their public IPs
aws ecs list-tasks --cluster react-app-cluster --service-name haproxy-service
aws ecs describe-tasks --cluster react-app-cluster --tasks <TASK_ARN> --query 'tasks[*].attachments[?name==`ElasticNetworkInterface`].details[?name==`networkInterfaceId`]'

# Get the ENI and its public IP
aws ec2 describe-network-interfaces --network-interface-ids <ENI_ID>
```

Access application at: `http://<HAPROXY_PUBLIC_IP>`

## Benefits of This Architecture

✅ **Simpler**: No ALB overhead
✅ **Direct Access**: HAProxy directly accessible from internet
✅ **Cost Effective**: Fewer AWS resources
✅ **Scalable**: Easy to adjust task counts
✅ **Secure**: Private subnets for Nginx
✅ **HA**: Multi-AZ, multi-task deployment
✅ **Monitored**: CloudWatch logging enabled

## Next Steps

1. Build HAProxy and Nginx Docker images
2. Push to ECR repositories
3. Deploy: `pulumi up`
4. Find HAProxy public IPs and test access
5. Configure HAProxy to route to Nginx service DNS
6. Monitor CloudWatch logs
