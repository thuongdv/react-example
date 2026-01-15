# GitHub Actions: Build and Push Docker Images

## Overview

This workflow automatically builds and pushes HAProxy and Nginx Docker images to AWS ECR whenever changes are detected in the Dockerfiles, configurations, or build scripts.

## Trigger Conditions

The workflow runs when:

- **Push to main/master branch** with changes to:
  - `docker/Dockerfile.haproxy`
  - `docker/Dockerfile.nginx`
  - `docker/haproxy.cfg`
  - `docker/nginx.conf`
  - `scripts/build-and-push-*.sh`
  - `.github/workflows/build-push-images.yml`
- **Manual trigger** via `workflow_dispatch` (available in Actions tab)

## Setup Requirements

### 1. AWS OIDC Configuration

Set up GitHub OIDC trust relationship with AWS so the workflow can authenticate without static credentials:

#### Step 1: Create the GitHub OIDC Provider (One-time per AWS account)

Before creating the IAM role, you need to set up the GitHub OIDC identity provider in AWS. You can do this via the AWS Console or CLI:

**Using AWS CLI:**

```bash
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
```

This creates an OIDC provider with an ARN like:
`arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com`

**Using AWS Console:**

Follow the AWS documentation: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html

**Note:** If your Pulumi stack already creates this OIDC provider, you can reuse that existing provider and skip this step.

#### Step 2: Create IAM Role with Trust Policy

**Important:** Before running these commands, update the policy files with your actual values:

1. In `iac/trust-policy.json`:
   - Replace `{{ACCOUNT_ID}}` with your AWS account ID
   - Replace `{{GITHUB_OWNER}}/{{GITHUB_REPO}}` with your GitHub repository (e.g., `thuongdv/react-example`)

2. In `iac/ecr-push-policy.json`:
   - Replace `{{REGION}}` with your AWS region (e.g., `us-east-1`)
   - Replace `{{ACCOUNT_ID}}` with your AWS account ID

```bash
# From the iac directory
cd iac

# Create IAM role with trust policy for GitHub Actions
aws iam create-role \
  --role-name github-actions-ecr-push \
  --assume-role-policy-document file://trust-policy.json

# Attach the ECR permissions policy to the role
aws iam put-role-policy \
  --role-name github-actions-ecr-push \
  --policy-name github-actions-ecr-push-policy \
  --policy-document file://ecr-push-policy.json
```

**Trust Policy Template** (`trust-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::{{ACCOUNT_ID}}:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:{{GITHUB_OWNER}}/{{GITHUB_REPO}}:*"
        }
      }
    }
  ]
}
```

**IAM Policy Template** (ECR access - `ecr-push-policy.json`):

Note: This policy follows the principle of least privilege by restricting ECR operations to repositories matching the pattern `react-app-*`. The `ecr:GetAuthorizationToken` action requires `"Resource": "*"` as it doesn't support resource-level permissions.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeRepositories"
      ],
      "Resource": "arn:aws:ecr:{{REGION}}:{{ACCOUNT_ID}}:repository/react-app-*"
    },
    {
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["sts:GetCallerIdentity"],
      "Resource": "*"
    }
  ]
}
```

### 2. GitHub Secrets

Add the following secrets to your GitHub repository:

| Secret         | Description                          | Example                                               |
| -------------- | ------------------------------------ | ----------------------------------------------------- |
| `AWS_ROLE_ARN` | **Required** - IAM role ARN for OIDC | `arn:aws:iam::123456789:role/github-actions-ecr-push` |
| `PULUMI_STACK` | _Optional_ - Pulumi stack name       | `thuongdv/iac-react-example/dev` or `myorg/myproject/staging` |

> **Note:** The `PULUMI_STACK` secret is optional. If not provided, the workflow defaults to `thuongdv/iac-react-example/dev`. To use a different Pulumi stack, add the `PULUMI_STACK` secret with your desired stack name.

**To add secrets:**

1. Go to Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add `AWS_ROLE_ARN` with your IAM role ARN
4. Optionally add `PULUMI_STACK` if using a different stack than the default

## Workflow Details

### Job: `build-and-push`

**Runs on:** `ubuntu-latest`

**Strategy:** Parallel matrix for both services (HAProxy and Nginx)

**Steps:**

1. **Checkout code** - Fetches repository
2. **Configure AWS credentials** - Uses OIDC for authentication (no static keys!)
3. **Check if Dockerfile changed** - Skips rebuild if files didn't change
4. **Setup Node.js** - Installs Node.js 18 for Pulumi
5. **Install Pulumi** - Downloads and installs Pulumi CLI
6. **Setup Docker** - Prepares Docker buildx for image building
7. **Build and push** - Executes build script with image tag set to commit SHA
8. **Notification** - Reports success/failure

### Image Tagging

Images are tagged with the commit SHA:

- `haproxy-repo:abc1234def...` (commit SHA)
- `nginx-repo:abc1234def...` (commit SHA)

This allows tracing images back to their source code commit.

## Usage Examples

### Automatic Trigger

Simply push changes to Dockerfile:

```bash
git add docker/Dockerfile.haproxy
git commit -m "Update HAProxy config"
git push origin master
```

The workflow will automatically:

1. Detect changes to `docker/Dockerfile.haproxy`
2. Build the HAProxy image
3. Push to ECR with commit SHA tag

### Manual Trigger

From the GitHub UI:

1. Go to **Actions** tab
2. Click **Build and Push Docker Images** workflow
3. Click **Run workflow** → **Run workflow**

### Environment Variables

Customize behavior by modifying environment variables in the workflow:

```yaml
env:
  AWS_REGION: us-east-1 # Change to your AWS region
```

## Troubleshooting

### Workflow Fails with "AWS_ROLE_ARN not found"

**Solution:** Add the `AWS_ROLE_ARN` secret to GitHub (Settings → Secrets and variables → Actions)

### Workflow Skips Build ("changed=false")

This is expected behavior if Dockerfile didn't change. To force rebuild:

- Use **Run workflow** button in Actions tab
- Edit `.github/workflows/build-push-images.yml` and commit (triggers rebuild)

### ECR Repository Not Found

Ensure:

1. ECR repositories `react-app-haproxy` and `react-app-nginx` exist
2. They were created by Pulumi deployment (`pulumi up`)
3. AWS credentials have ECR access

### Pulumi Stack Not Found

Ensure:

1. Pulumi stack exists: `pulumi stack ls`
2. Set correct stack in secrets: `PULUMI_STACK_NAME=dev`
3. Pulumi config file (`Pulumi.dev.yaml`) exists

### Docker Build Fails

Common issues:

- React app not built for Nginx image (missing `dist/` directory)
  - Solution: Workflow builds React app automatically on first Nginx build
- Dockerfile paths incorrect
  - Solution: Verify paths match matrix configuration
- Missing build dependencies
  - Solution: Check Dockerfile for `npm install`, `npm run build` steps

## Security Considerations

✅ **Uses GitHub OIDC** - No static AWS credentials stored  
✅ **Least privilege** - IAM role limited to ECR operations  
✅ **Read-only checkout** - Fetches code, doesn't push back  
✅ **Commit SHA tagging** - Trace images to source code

## Extending the Workflow

### Add Additional Services

Add new services to the matrix:

```yaml
matrix:
  service:
    - name: haproxy
      dockerfile: docker/Dockerfile.haproxy
      script: scripts/build-and-push-haproxy.sh
      pulumi-output: haproxyRepoUrl
    - name: nginx
      dockerfile: docker/Dockerfile.nginx
      script: scripts/build-and-push-nginx.sh
      pulumi-output: nginxRepoUrl
    - name: newservice # Add new service
      dockerfile: docker/Dockerfile.newservice
      script: scripts/build-and-push-newservice.sh
      pulumi-output: newserviceRepoUrl
```

### Push to Multiple Registries

Modify the script execution to push to both ECR and Docker Hub:

```bash
IMAGE_TAG=$IMAGE_TAG DOCKER_HUB_PUSH=true ${{ matrix.service.script }}
```

### Add Slack Notification

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
```

## Related Documentation

- [Build and Push Custom Images](BUILD_PUSH_CUSTOM_IMAGE.MD)
- [Local Development](LOCAL_DEVELOPMENT.md)
- [Architecture](ARCHITECTURE_UPDATE.md)
