# Docker Image Changelog

This document tracks changes to the Docker images used in this project. Each image is tagged with the first 7 characters of the Git commit SHA that triggered the build.

## Image Tagging Strategy

Docker images for HAProxy and Nginx services are automatically built and pushed to AWS ECR by the GitHub Actions workflow (`.github/workflows/build-push-images.yml`) when changes are detected in:

- `docker/Dockerfile.haproxy` or `docker/Dockerfile.nginx`
- `docker/haproxy.cfg` or `docker/nginx.conf`
- `scripts/build-and-push-haproxy.sh` or `scripts/build-and-push-nginx.sh`
- The workflow file itself

**Image Tag Format**: `<commit-sha-prefix>` (first 7 characters of the commit SHA)

## Version History

### Version: 7d43056

**Date**: 2026-01-16

**Commit**: [7d43056](https://github.com/thuongdv/react-example/commit/7d43056)

**Changes**:
- Initial Docker image configuration for HAProxy and Nginx services
- HAProxy configured with:
  - HTTPS/TLS termination on port 443
  - HTTP to HTTPS redirect on port 80 (301 redirect)
  - Backend routing to Nginx service via AWS Cloud Map service discovery
  - Health check endpoint at `/health`
- Nginx configured with:
  - React application serving on port 8080
  - Health check endpoint at `/health`
  - Static file serving from `/usr/share/nginx/html`

**Image URIs**:
- HAProxy: `077024820570.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:7d43056`
- Nginx: `077024820570.dkr.ecr.us-east-1.amazonaws.com/react-app-nginx:7d43056`

---

## How to Find Changes Between Versions

To see what changed between two image versions, compare the commits:

```bash
# View changes between two versions (replace with actual commit SHAs)
git diff <old-version>...<new-version> -- docker/ scripts/

# View specific commit details
git show 7d43056 -- docker/ scripts/
git show 7d43056 -- docker/ scripts/
```

## Rollback Instructions

To rollback to a previous image version:

1. Update the image URIs in `iac/Pulumi.dev.yaml`:
   ```yaml
   iac-react-example:haproxy-image-uri: 077024820570.dkr.ecr.us-east-1.amazonaws.com/react-app-haproxy:<previous-tag>
   iac-react-example:nginx-image-uri: 077024820570.dkr.ecr.us-east-1.amazonaws.com/react-app-nginx:<previous-tag>
   ```

2. Deploy the changes:
   ```bash
   cd iac
   pulumi up
   ```

## Related Documentation

- [GitHub Actions Workflow Documentation](./GITHUB_ACTIONS.md) - Details on the automated build and push process
- [Build and Push Custom Images](./BUILD_PUSH_CUSTOM_IMAGE.MD) - Manual build and push instructions
- [Architecture Overview](./ARCHITECTURE_UPDATE.md) - System architecture and component interactions
