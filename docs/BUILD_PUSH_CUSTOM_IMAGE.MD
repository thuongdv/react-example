# Build and Push Custom Images

Use the helper scripts for a one-shot build and push, or follow the manual steps below.

## HAProxy image

### Option A: Automated script (recommended)

```
./scripts/build-and-push-haproxy.sh
```

Environment overrides:

- `IMAGE_NAME` (default `react-app-haproxy`)
- `IMAGE_TAG` (default `latest`)
- `STACK_DIR` (Pulumi stack dir, default `./iac`)
- `PULUMI_OUTPUT` (Pulumi output name, default `haproxyRepoUrl`)
- `DOCKERFILE` (default `./docker/Dockerfile.haproxy`)

### Option B: Manual steps

1. Build the HAProxy Docker image
   `docker build -f docker/Dockerfile.haproxy -t react-app-haproxy:latest .`

2. Get your ECR repository URL
   `pulumi stack output haproxyRepoUrl`

3. Login to ECR and push

```
# Get AWS credentials
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag and push
HAPROXY_REPO=$(pulumi stack output haproxyRepoUrl)
docker tag react-app-haproxy:latest $HAPROXY_REPO:latest
docker push $HAPROXY_REPO:latest
```

4. Update Pulumi config to use your custom image
   `iac-react-example:haproxy-image-uri: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:latest`

## Nginx image

### Option A: Automated script (recommended)

```
./scripts/build-and-push-nginx.sh
```

Environment overrides:

- `IMAGE_NAME` (default `react-app-nginx`)
- `IMAGE_TAG` (default `latest`)
- `STACK_DIR` (Pulumi stack dir, default `./iac`)
- `PULUMI_OUTPUT` (Pulumi output name, default `nginxRepoUrl`)
- `DOCKERFILE` (default `./docker/Dockerfile.nginx`)

### Option B: Manual steps

1. Build the React app (required for the Nginx image)
   `npm install && npm run build`

2. Build the Nginx Docker image (uses the compiled `dist` directory)
   `docker build -f docker/Dockerfile.nginx -t react-app-nginx:latest .`

3. Get your ECR repository URL
   `pulumi stack output nginxRepoUrl`

4. Login to ECR and push

```
# Get AWS credentials
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag and push
NGINX_REPO=$(pulumi stack output nginxRepoUrl)
docker tag react-app-nginx:latest $NGINX_REPO:latest
docker push $NGINX_REPO:latest
```

5. Update Pulumi config to use your custom image
   `iac-react-example:nginx-image-uri: <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/react-app-nginx:latest`
