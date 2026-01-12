#!/usr/bin/env bash
set -euo pipefail

# Build and push the custom Nginx image to ECR using Pulumi outputs.
# Environment overrides:
#   IMAGE_NAME    - local image name (default: react-app-nginx)
#   IMAGE_TAG     - tag to use locally and remotely (default: latest)
#   STACK_DIR     - path to Pulumi stack directory (default: repo_root/iac)
#   PULUMI_OUTPUT - Pulumi output name for repo URL (default: nginxRepoUrl)
#   DOCKERFILE    - Dockerfile path (default: repo_root/docker/Dockerfile.nginx)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME=${IMAGE_NAME:-react-app-nginx}
IMAGE_TAG=${IMAGE_TAG:-latest}
STACK_DIR=${STACK_DIR:-"$REPO_ROOT/iac"}
PULUMI_OUTPUT=${PULUMI_OUTPUT:-nginxRepoUrl}
DOCKERFILE=${DOCKERFILE:-"$REPO_ROOT/docker/Dockerfile.nginx"}

if ! command -v pulumi >/dev/null; then
  echo "Pulumi CLI is required" >&2
  exit 1
fi
if ! command -v aws >/dev/null; then
  echo "AWS CLI is required" >&2
  exit 1
fi
if ! command -v docker >/dev/null; then
  echo "Docker is required" >&2
  exit 1
fi

AWS_REGION=${AWS_REGION:-$(aws configure get region || true)}
if [ -z "$AWS_REGION" ]; then
  echo "AWS_REGION is not set and could not be read from AWS config" >&2
  exit 1
fi

AWS_ACCOUNT_ID=${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}
if [ -z "$AWS_ACCOUNT_ID" ]; then
  echo "Unable to resolve AWS account id" >&2
  exit 1
fi

# Resolve the ECR repo URL from Pulumi.
pushd "$STACK_DIR" >/dev/null
NGINX_REPO=$(pulumi stack output "$PULUMI_OUTPUT")
popd >/dev/null

if [ -z "$NGINX_REPO" ]; then
  echo "Pulumi output $PULUMI_OUTPUT is empty" >&2
  exit 1
fi

# Ensure the React app is built for static assets.
if [ ! -d "$REPO_ROOT/dist" ]; then
  echo "Building React app (dist missing)..." && (
    cd "$REPO_ROOT" && npm install && npm run build
  )
fi

# Build local image.
docker build -f "$DOCKERFILE" -t "$IMAGE_NAME:$IMAGE_TAG" "$REPO_ROOT"

# Login to ECR.
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Tag and push.
docker tag "$IMAGE_NAME:$IMAGE_TAG" "$NGINX_REPO:$IMAGE_TAG"
docker push "$NGINX_REPO:$IMAGE_TAG"

echo "Published $NGINX_REPO:$IMAGE_TAG"
