# AWS IAM Policies

This folder contains AWS IAM policies used for authentication, authorization, and service permissions.

## Files

### trust-policy.json

AWS IAM trust policy that defines who can assume a role. This policy is used in the Pulumi stack to set up role trust relationships for ECS task execution and other services.

**Used for**:

- ECS task execution role trust
- Service assume role permissions
- Cross-service role access

### ecr-push-policy.json

IAM policy that grants permissions to push Docker images to Amazon ECR (Elastic Container Registry).

**Permissions**:

- `ecr:BatchCheckLayerAvailability` - Check if image layers exist
- `ecr:GetDownloadUrlForLayer` - Download image layers
- `ecr:PutImage` - Push new images
- `ecr:InitiateLayerUpload` - Start layer uploads
- `ecr:UploadLayerPart` - Upload layer parts
- `ecr:CompleteLayerUpload` - Complete layer uploads
- `ecr:DescribeRepositories` - List repositories
- `ecr:GetAuthorizationToken` - Get ECR authentication token
- `sts:GetCallerIdentity` - Verify AWS identity

**Used for**:

- Docker image push operations
- CI/CD pipeline authentication
- Manual image builds and pushes

## Template Variables

Policy files use these template variables that are replaced during deployment:

- `{{REGION}}` - AWS region (e.g., us-east-1)
- `{{ACCOUNT_ID}}` - AWS account ID

## Usage in Pulumi

These policies are referenced in the Pulumi infrastructure code:

```typescript
// Example in Pulumi code
import * as fs from "fs";

const trustPolicy = fs.readFileSync("./policies/trust-policy.json", "utf-8");
const ecrPushPolicy = fs.readFileSync(
  "./policies/ecr-push-policy.json",
  "utf-8",
);

// Replace template variables
const policy = ecrPushPolicy
  .replace("{{REGION}}", region)
  .replace("{{ACCOUNT_ID}}", accountId);
```

## Adding New Policies

To add a new IAM policy:

1. Create a new `.json` file in this directory
2. Name it descriptively (e.g., `s3-access-policy.json`)
3. Use template variables for dynamic values (`{{REGION}}`, `{{ACCOUNT_ID}}`, etc.)
4. Update the Pulumi code to load and use the policy
5. Document the policy purpose and permissions in this README

## Best Practices

1. **Least Privilege**: Grant only necessary permissions
2. **Resource Restrictions**: Limit policies to specific resources (not `"*"`)
3. **Versioning**: Keep policies versioned with the infrastructure code
4. **Documentation**: Document what each policy is used for
5. **Testing**: Test policies before deploying to production
6. **Review**: Have policies reviewed before merging

## Security

- ⚠️ These are template policies - actual policies should have account IDs and regions
- ✅ Store actual policies in Pulumi config or AWS Secrets Manager for sensitive environments
- ✅ Use `pulumi config set --secret` for sensitive policy content
- ✅ Rotate credentials regularly

## References

- [AWS IAM Policies Documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html)
- [ECR Authentication](https://docs.aws.amazon.com/AmazonECR/latest/userguide/registries.html)
- [ECS Task Execution Role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)
