#!/usr/bin/env bash
set -euo pipefail

# Build and push the custom HAProxy image to ECR using Pulumi outputs.
# Environment overrides:
#   IMAGE_NAME   - local image name (default: react-app-haproxy)
#   IMAGE_TAG    - tag to use locally and remotely (default: latest)
#   STACK_DIR    - path to Pulumi stack directory (default: repo_root/iac)
#   PULUMI_OUTPUT- Pulumi output name for repo URL (default: haproxyRepoUrl)
#   DOCKERFILE   - Dockerfile path (default: repo_root/docker/Dockerfile.haproxy)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME=${IMAGE_NAME:-react-app-haproxy}
IMAGE_TAG=${IMAGE_TAG:-latest}
STACK_DIR=${STACK_DIR:-"$REPO_ROOT/iac"}
PULUMI_OUTPUT=${PULUMI_OUTPUT:-haproxyRepoUrl}
DOCKERFILE=${DOCKERFILE:-"$REPO_ROOT/docker/Dockerfile.haproxy"}

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
HAPROXY_REPO=$(pulumi stack output "$PULUMI_OUTPUT")
popd >/dev/null

if [ -z "$HAPROXY_REPO" ]; then
  echo "Pulumi output $PULUMI_OUTPUT is empty" >&2
  exit 1
fi

# Build local image.
docker build -f "$DOCKERFILE" -t "$IMAGE_NAME:$IMAGE_TAG" "$REPO_ROOT"

# Login to ECR.
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Tag and push.
docker tag "$IMAGE_NAME:$IMAGE_TAG" "$HAPROXY_REPO:$IMAGE_TAG"
docker push "$HAPROXY_REPO:$IMAGE_TAG"

echo "Published $HAPROXY_REPO:$IMAGE_TAG"
