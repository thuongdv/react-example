# Docker Image Security & Best Practices

## Image Security Scanning

### Automated Scanning in ECR

All images pushed to ECR are automatically scanned for vulnerabilities:

```bash
# Check scan results for HAProxy image
aws ecr describe-image-scan-findings \
  --repository-name react-app-haproxy \
  --image-id imageTag=latest \
  --region us-east-1

# Check scan results for Nginx image
aws ecr describe-image-scan-findings \
  --repository-name react-app-nginx \
  --image-id imageTag=latest \
  --region us-east-1
```

Findings are categorized by severity:

- **CRITICAL**: Immediate action required
- **HIGH**: Should be addressed soon
- **MEDIUM**: Plan remediation
- **LOW**: Monitor for updates

### Interpreting Scan Results

```bash
# Get detailed vulnerability information
aws ecr describe-image-scan-findings \
  --repository-name react-app-haproxy \
  --image-id imageTag=latest \
  --region us-east-1 | jq '.imageScanFindings.findings[] | {severity, name, uri}'
```

## Base Image Selection

### Current Images

- **HAProxy**: `haproxy:3.3.1-alpine`
  - Minimal footprint (~50MB)
  - Based on Alpine Linux (~5MB)
  - Receives regular security updates

- **Nginx**: `nginx:1.29.4-alpine`
  - Lightweight production-ready
  - Alpine base for minimal attack surface
  - Regular patch releases

### Keeping Images Updated

Check for new versions monthly:

```bash
# Check Docker Hub for latest versions
curl -s https://hub.docker.com/v2/repositories/library/haproxy/tags | jq '.results[0:5] | .[] | {name, last_updated}'

curl -s https://hub.docker.com/v2/repositories/library/nginx/tags | jq '.results[0:5] | .[] | {name, last_updated}'
```

Update base images in:

- [docker/Dockerfile.haproxy](../docker/Dockerfile.haproxy)
- [docker/Dockerfile.nginx](../docker/Dockerfile.nginx)

## Building Secure Images

### Dockerfile Best Practices

1. **Use minimal base images**

   ```dockerfile
   FROM haproxy:3.3.1-alpine
   # Smaller image = smaller attack surface
   ```

2. **Run as non-root user**

   ```dockerfile
   RUN addgroup -g 101 -S appgroup && adduser -S appuser -G appgroup
   USER appuser
   ```

3. **Don't store secrets in images**
   - Use environment variables or AWS Secrets Manager
   - Never commit certificates to version control

4. **Minimize layers**

   ```dockerfile
   # Good: Combine commands
   RUN apk add --no-cache curl && \
       curl https://example.com/app && \
       apk del curl

   # Avoid: Multiple RUN commands
   RUN apk add curl
   RUN curl https://example.com/app
   RUN apk del curl
   ```

5. **Use specific version tags**

   ```dockerfile
   # Good
   FROM haproxy:3.3.1-alpine

   # Avoid
   FROM haproxy:latest  # Unpredictable updates
   FROM haproxy:alpine  # May get major version upgrades
   ```

### Scan During Build

Build and scan locally before pushing:

```bash
# Build image
docker build -t react-app-haproxy:latest -f docker/Dockerfile.haproxy .

# Scan with Trivy (open-source vulnerability scanner)
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image react-app-haproxy:latest
```

## Pushing Images to ECR

### Build and Push HAProxy

```bash
# From project root
./scripts/build-and-push-haproxy.sh v1.0.0

# Manual process
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker build -t react-app-haproxy:v1.0.0 -f docker/Dockerfile.haproxy .

docker tag react-app-haproxy:v1.0.0 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:v1.0.0

docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:v1.0.0
```

### Build and Push Nginx

```bash
# From project root
./scripts/build-and-push-nginx.sh v1.0.0

# Manual process (similar to HAProxy)
```

## Image Tagging Strategy

### Version Tagging

Use semantic versioning for image tags:

```bash
# For feature updates
docker tag react-app-haproxy:latest myrepo/react-app-haproxy:1.2.0

# For patch fixes
docker tag react-app-haproxy:latest myrepo/react-app-haproxy:1.2.1

# For pre-release
docker tag react-app-haproxy:latest myrepo/react-app-haproxy:1.3.0-rc1

# Keep latest tag for current stable
docker tag react-app-haproxy:latest myrepo/react-app-haproxy:latest
```

### Image Repository Structure

```
react-app-haproxy:
  - latest          (current stable)
  - 1.2.0           (specific version)
  - 1.2             (minor version)
  - 1               (major version)

react-app-nginx:
  - latest
  - 1.29.4
  - 1.29
  - 1
```

## Image Lifecycle

### Pull Image Updates

```bash
# Pull latest base image
docker pull haproxy:3.3.1-alpine
docker pull nginx:1.29.4-alpine

# Rebuild application images
docker build -t react-app-haproxy:latest -f docker/Dockerfile.haproxy .
docker build -t react-app-nginx:latest -f docker/Dockerfile.nginx .

# Test locally
docker compose up

# Deploy to AWS
pulumi up
```

### Image Retention

ECR repositories store images with automatic retention policies:

```bash
# Set image retention (keep last 10 images, older than 90 days)
aws ecr put-lifecycle-policy \
  --repository-name react-app-haproxy \
  --lifecycle-policy-text '{
    "rules": [
      {
        "rulePriority": 1,
        "description": "Keep last 10 images",
        "selection": {
          "tagStatus": "any",
          "countType": "imageCountMoreThan",
          "countNumber": 10
        },
        "action": {
          "type": "expire"
        }
      }
    ]
  }' \
  --region us-east-1
```

## Monitoring Image Vulnerabilities

### GitHub Dependabot (If Using GitHub)

Enable Dependabot for continuous vulnerability monitoring:

1. Go to repository Settings → Security → Dependabot
2. Enable "Dependabot alerts"
3. Enable "Dependabot security updates"

Dependabot will:

- Scan images for known vulnerabilities
- Create issues for fixes
- Open pull requests with updates

### Regular Security Audits

Schedule monthly image vulnerability checks:

```bash
# Create script: scripts/audit-images.sh
#!/bin/bash
set -e

for repo in react-app-haproxy react-app-nginx; do
  echo "=== Scanning $repo ==="
  aws ecr describe-image-scan-findings \
    --repository-name $repo \
    --image-id imageTag=latest \
    --region us-east-1 \
    | jq '.imageScanFindings.findings[] | select(.severity=="CRITICAL")'
done
```

Run regularly:

```bash
chmod +x scripts/audit-images.sh
./scripts/audit-images.sh
```

## Compliance

### Image Compliance Checklist

Before pushing to production:

- [ ] All base images are from official, trusted sources
- [ ] No secrets, keys, or credentials in image layers
- [ ] Non-root user configured
- [ ] Health check endpoint implemented
- [ ] Vulnerability scan results reviewed
- [ ] No CRITICAL or HIGH severity issues (unless mitigated)
- [ ] Image tested locally and in staging
- [ ] Image tag follows versioning scheme
- [ ] Dockerfile comments document critical configuration

### Security Headers in Containers

Add security headers in configuration:

**HAProxy** ([docker/haproxy.cfg](../docker/haproxy.cfg)):

```
# Add security headers
http-response set-header X-Content-Type-Options "nosniff"
http-response set-header X-Frame-Options "DENY"
http-response set-header X-XSS-Protection "1; mode=block"
http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

**Nginx** ([docker/nginx.conf](../docker/nginx.conf)):

```nginx
# Add security headers
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## Common Issues

### High Vulnerability Findings

If base image has vulnerabilities:

1. Check if patch available: `docker pull haproxy:3.3.2-alpine` (example)
2. Update Dockerfile with patched version
3. Rebuild image and rescan
4. If no patch available, document the risk and plan mitigation

### Image Pull Errors in ECS

```bash
# Verify ECR repository permissions
aws ecr describe-repositories --repository-names react-app-haproxy

# Check ECS task execution role has ECR pull permissions
aws iam get-role --role-name <task-execution-role> | jq '.Role.AssumeRolePolicyDocument'
```

### Image Size Too Large

If image exceeds optimal size:

1. Remove unnecessary packages from Dockerfile
2. Use multi-stage builds
3. Compress artifacts
4. Clean package manager caches

```dockerfile
# Example: Multi-stage build to reduce size
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm ci

FROM haproxy:3.3.1-alpine
# Copy only necessary artifacts from builder
COPY --from=builder /app/dist /usr/local/etc/haproxy
```

## Tools and Resources

- **Trivy**: Free vulnerability scanner - https://github.com/aquasecurity/trivy
- **ECR Scan**: AWS native scanning included with ECR
- **Docker Scout**: Docker's built-in security tool
- **OWASP Guidelines**: Security best practices - https://owasp.org/
