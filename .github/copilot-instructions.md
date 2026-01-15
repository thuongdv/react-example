# React Example - AI Coding Agent Instructions

## Project Overview

React SPA with Vite deployed to AWS ECS Fargate using Pulumi IaC. Traffic flows: **Internet → HAProxy (public) → Nginx (private) → React app**.

## Architecture

### Traffic Flow (Critical)

- **HAProxy**: ECS Fargate in public subnets with public IPs, port 8080 exposed to internet
- **Nginx**: ECS Fargate in private subnets, no public IPs, accessible only from HAProxy via security groups
- **No ALB**: HAProxy acts as entry point and load balancer
- Service discovery: Nginx accessible at `nginx.react-app.local` via AWS Cloud Map

### Network Topology

- VPC CIDR: `10.0.0.0/16`
- Public subnets: `10.0.0.0/24`, `10.0.1.0/24` (HAProxy)
- Private subnets: `10.0.100.0/24`, `10.0.101.0/24` (Nginx)
- NAT Gateway for private subnet outbound traffic

## IaC Structure & Patterns

### Service Registration Pattern

New services must be registered in [iac/src/deployment/factory.ts](iac/src/deployment/factory.ts):

```typescript
const registeredServices = {
  "react-service": ReactService,
};
```

### Abstract Service Pattern

All deployment classes extend `Service` base class [iac/src/deployment/service.ts](iac/src/deployment/service.ts):

- Constructor receives `pulumi.Config`
- Must implement `deploy(): Promise<{ [key: string]: pulumi.Input<string> }>`
- Access config via `this.pulumiConfig.get("key")` or `this.pulumiConfig.require("key")`

### Auto-tagging

All AWS resources automatically tagged via [iac/src/autotag.ts](iac/src/autotag.ts) with Creator, PulumiStack, Environment, Service.

## Developer Workflows

### Local Development

```bash
npm run dev                 # React dev server (port 5173)
npm run local:start         # Build React + start Docker Compose (HAProxy on :8080)
npm run local:logs          # View container logs
npm run local:stop          # Stop containers
```

### AWS Deployment

```bash
cd iac
pulumi stack init dev
pulumi config set aws:region us-east-1
pulumi config set serviceName react-service
pulumi config set environmentName dev
pulumi up
```

### Custom Container Images

Use scripts in [scripts/](scripts/):

- `build-and-push-haproxy.sh` - Builds/pushes HAProxy image to ECR
- `build-and-push-nginx.sh` - Builds/pushes Nginx image to ECR
  Override default images with Pulumi config:

```bash
pulumi config set haproxy-image-uri <ecr-repo-url>:tag
pulumi config set nginx-image-uri <ecr-repo-url>:tag
```

### Getting HAProxy Public IP

```bash
aws ecs list-tasks --cluster react-app-cluster --service-name haproxy-service --region us-east-1
aws ecs describe-tasks --cluster react-app-cluster --tasks <task-arn> --region us-east-1 | jq -r '.tasks[0].attachments[0].details[] | select(.name=="networkInterfaceId").value'
# Then get public IP from ENI
```

## File Organization

- **Frontend**: [src/](src/) - React components, styles
- **IaC Main**: [iac/index.ts](iac/index.ts) - Entry point, instantiates service from factory
- **Deployment Logic**: [iac/src/deployment/](iac/src/deployment/) - Service abstractions
- **AWS Resources**: [iac/src/cloud/aws/](iac/src/cloud/aws/) - VPC, ECS, ECR modules
- **Docker**: [docker/](docker/) - Dockerfiles and configs for HAProxy/Nginx
- **Documentation**: [docs/](docs/) - Architecture details, implementation notes

## Key Conventions

1. **Security Groups**: Public SG allows internet ingress on 80/443/8080; Private SG only accepts from Public SG
2. **ECS Fargate**: HAProxy uses `assignPublicIp: true`, Nginx uses `assignPublicIp: false`
3. **Container Insights**: Enabled at cluster level via [iac/src/cloud/aws/ecs.ts](iac/src/cloud/aws/ecs.ts#L42)
4. **Health Checks**: All ECS services have health checks at `/health` endpoint
5. **Logging**: CloudWatch log groups with 7-day retention at `/ecs/<service-name>`
6. **DNS Resolution**: HAProxy uses AWS VPC DNS resolver (`169.254.169.253` - AWS-provided DNS) - see [docker/haproxy.cfg](docker/haproxy.cfg#L13)

## Configuration Files

- [Pulumi.yaml](iac/Pulumi.yaml) - Stack metadata
- [Pulumi.dev.yaml](iac/Pulumi.dev.yaml) - Environment-specific config
- [docker-compose.yml](docker-compose.yml) - Local development setup
- [vite.config.js](vite.config.js) - Frontend build configuration

## Common Issues

- **Service discovery not working**: Verify `nginx.react-app.local` resolves in HAProxy container, check Service Discovery namespace
- **HAProxy can't reach internet**: Ensure public subnets have IGW route in route table
- **Nginx can't reach ECR**: Verify NAT Gateway is provisioned and private route table has NAT route

## Service Discovery Best Practices

### Debugging DNS Resolution

```bash
# Inside HAProxy container
nslookup nginx.react-app.local 169.254.169.253
dig @169.254.169.253 nginx.react-app.local
```

### Health Check Strategy

- Service Discovery health checks use `healthCheckCustomConfig` (container-level health)
- ECS task health checks verify `/health` endpoint every 30s
- Both must pass for service to be considered healthy

### Fallback Patterns

If service discovery fails, check in order:

1. Namespace exists: `aws servicediscovery list-namespaces`
2. Service registered: `aws servicediscovery list-services --filters Name=NAMESPACE_ID,Values=<id>`
3. Service has instances: `aws servicediscovery discover-instances --namespace-name react-app.local --service-name nginx`
4. Security groups allow traffic between HAProxy and Nginx
5. CloudWatch logs for HAProxy show DNS resolution attempts

## Multi-Environment Setup (Planned)

When adding staging/prod environments:

- Create separate Pulumi stacks: `pulumi stack init staging`, `pulumi stack init prod`
- Use stack-specific config files: `Pulumi.staging.yaml`, `Pulumi.prod.yaml`
- Set environment-specific values:
  ```bash
  pulumi config set environmentName staging --stack staging
  pulumi config set desiredCount 2 --stack staging
  pulumi config set desiredCount 4 --stack prod  # Higher capacity for prod
  ```
- Consider separate AWS accounts or VPCs per environment for isolation

## CI/CD (GitHub Actions - Planned)

Expected workflows:

- **Frontend**: Build React app → Push to S3/container registry
- **Infrastructure**: Pulumi preview on PR, `pulumi up` on merge to main
- **Container Images**: Build/push HAProxy and Nginx images on Dockerfile changes
- Use GitHub OIDC for AWS credentials (no static keys)
- Separate workflows per environment with approval gates for prod

## Testing (Planned)

When adding tests:

- Frontend: Vitest for React component tests (compatible with Vite)
- Infrastructure: Pulumi test framework for IaC validation
- Integration: Test HAProxy → Nginx → React flow in staging environment
- Add `npm test` script to package.json for CI integration

## Code Style and Conventions

### Frontend (React/JavaScript)

- Use **functional components** with hooks (no class components)
- Prefer **arrow functions** for component definitions
- Use **JSX** file extension (`.jsx`) for files containing JSX/React components
- Keep components in `src/` directory
- Use **PascalCase** for component names
- Use **camelCase** for variables and functions
- Avoid inline styles; use CSS modules or separate CSS files

### Infrastructure (TypeScript/Pulumi)

- All IaC code in TypeScript
- Use **async/await** for asynchronous operations
- Export resources for stack outputs when needed
- Follow the abstract `Service` pattern for new deployment types
- Always register new services in `factory.ts`
- Use Pulumi's `Output` type for resource dependencies
- Add comprehensive JSDoc comments for complex functions

### General Practices

- No console.logs in production code (use proper logging)
- Handle errors explicitly; no silent failures
- Use meaningful variable and function names
- Keep functions small and focused (single responsibility)
- Document complex logic with comments

## Dependencies and Requirements

### Frontend Requirements

- **Node.js**: v18+ (LTS recommended)
- **npm**: v9+
- **React**: 18.2.0
- **Vite**: 5.0.8+

### Infrastructure Requirements

- **Pulumi CLI**: Latest version
- **AWS CLI**: v2.x
- **Node.js**: v18+ (for Pulumi TypeScript)
- **Docker**: For local development and custom image builds
- **jq**: For parsing AWS CLI JSON outputs

### AWS Resources Required

- AWS account with appropriate IAM permissions
- ECR repositories (auto-created by Pulumi)
- VPC with public and private subnets (created by stack)
- NAT Gateway and Internet Gateway
- ECS Fargate cluster

## Security Best Practices

### Infrastructure Security

- **Never commit secrets** to version control
- Use Pulumi config with `--secret` flag for sensitive values: `pulumi config set --secret dbPassword <value>`
- IAM roles follow least privilege principle
- Security groups are restrictive by default
- All ECS task execution roles have minimal permissions
- CloudWatch logs for audit trails

### Application Security

- Keep dependencies up to date: `npm audit` regularly
- Review security advisories for npm packages
- No hardcoded credentials in code
- Use environment variables for configuration
- HTTPS/TLS for all external communication (HAProxy terminates TLS)

### Container Security

- Use official base images from Docker Hub
- Regularly update base images
- Scan container images for vulnerabilities
- Run containers as non-root user when possible
- Minimal image size (multi-stage builds)

## Common Commands Quick Reference

### Frontend Development

```bash
npm install                  # Install dependencies
npm run dev                  # Start dev server (http://localhost:5173 by default)
npm run build                # Production build → dist/
npm run preview              # Preview production build
```

### Infrastructure Management

```bash
cd iac
pulumi preview               # Preview changes without applying
pulumi up                    # Deploy/update infrastructure
pulumi destroy               # Tear down all resources
pulumi stack output          # View stack outputs
pulumi config                # List all config values
pulumi logs -f               # Follow logs from ECS containers
```

### Local Development

```bash
npm run local:start          # Build and start Docker Compose
npm run local:stop           # Stop all containers
npm run local:logs           # View container logs
docker compose ps            # Check container status
docker compose restart nginx # Restart specific service
```

### Docker Image Management

```bash
./scripts/build-and-push-haproxy.sh <tag>  # Build/push custom HAProxy
./scripts/build-and-push-nginx.sh <tag>    # Build/push custom Nginx
docker compose build                        # Build local images
```

### AWS Debugging

```bash
# Get ECS task status
aws ecs list-tasks --cluster react-app-cluster --region us-east-1

# Get container logs
aws logs tail /ecs/haproxy-service --follow

# Check Service Discovery
aws servicediscovery list-services
aws servicediscovery discover-instances --namespace-name react-app.local --service-name nginx

# Get HAProxy public IP
aws ecs describe-tasks --cluster react-app-cluster --tasks <task-arn> --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text
```

## Troubleshooting Build and Test Issues

### Frontend Build Issues

**Problem**: `npm run build` fails with "out of memory"
**Solution**: Increase Node.js heap size: `NODE_OPTIONS="--max-old-space-size=4096" npm run build`

**Problem**: Vite dev server not hot-reloading
**Solution**: Check file watcher limits on Linux: `echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p`
(For macOS/Windows, restart the dev server or IDE)

### IaC Deployment Issues

**Problem**: `pulumi up` fails with AWS credential errors
**Solution**: 
- Verify AWS CLI configured: `aws sts get-caller-identity`
- Check AWS profile: `export AWS_PROFILE=your-profile`
- Ensure IAM permissions for ECS, VPC, CloudWatch, Service Discovery

**Problem**: Pulumi stack in inconsistent state
**Solution**:
- Export stack: `pulumi stack export > stack-backup.json`
- Refresh state: `pulumi refresh`
- If resources exist but Pulumi doesn't know: `pulumi import`

### Docker/Container Issues

**Problem**: Container fails health checks
**Solution**: 
- Check logs: `docker compose logs <service-name>`
- Verify `/health` endpoint responds: `curl http://localhost:8080/health`
- Ensure container has internet access (NAT gateway for private subnets)

**Problem**: Service discovery not resolving
**Solution**:
- Verify namespace created: `aws servicediscovery list-namespaces`
- Check HAProxy can query AWS VPC DNS resolver: `nslookup nginx.react-app.local 169.254.169.253`
- Ensure Service Discovery instances registered (can take 30-60s)
