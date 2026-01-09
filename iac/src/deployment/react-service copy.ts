import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { createEcrRepositories } from "../cloud/aws/ecr";
import {
  createEcsCluster,
  createEcsClusterCapacityProviders,
  createEcsService,
} from "../cloud/aws/ecs";
import { createVpc } from "../cloud/aws/vpc";
import { Service } from "./service";

export class ReactService extends Service {
  async deploy(): Promise<{ [key: string]: pulumi.Input<string> }> {
    console.log("🚀 Starting React App Deployment on AWS...\n");

    // Step 1: Create VPC with public and private subnets
    console.log("📡 Creating VPC infrastructure...");
    const vpcResources = createVpc({
      cidrBlock: "10.0.0.0/16",
      azCount: 2,
    });

    console.log("✅ VPC created");
    console.log(`   - VPC ID: ${vpcResources.vpc.id}`);
    console.log(`   - Public Subnets: ${vpcResources.publicSubnets.length}`);
    console.log(
      `   - Private Subnets: ${vpcResources.privateSubnets.length}\n`
    );

    // Step 2: Create ECR repositories
    console.log("📦 Creating ECR repositories...");
    const ecrResources = createEcrRepositories({
      haproxy: { imageName: "react-app-haproxy" },
      nginx: { imageName: "react-app-nginx" },
    });

    console.log("✅ ECR repositories created");
    console.log(`   - HAProxy Repo: ${ecrResources.haproxyRepo.repositoryUrl}`);
    console.log(`   - Nginx Repo: ${ecrResources.nginxRepo.repositoryUrl}\n`);

    // Step 3: Create ECS Cluster
    console.log("🎯 Creating ECS Cluster...");
    const ecsCluster = createEcsCluster({
      name: "react-app-cluster",
    });

    const clusterCapacityProviders =
      createEcsClusterCapacityProviders(ecsCluster);

    console.log("✅ ECS Cluster created");
    console.log(`   - Cluster Name: ${ecsCluster.name}`);
    console.log(`   - Launch Type: FARGATE\n`);

    // Step 4: Deploy HAProxy Service (Fargate - Public Subnets)
    console.log("🔗 Deploying HAProxy Service (Load Balancer)...");
    const haproxyImageUri = this.pulumiConfig.get("haproxy-image-uri")
      ? this.pulumiConfig.get("haproxy-image-uri")!
      : pulumi.interpolate`${ecrResources.haproxyRepo.repositoryUrl}:latest`;

    const haproxyService = createEcsService({
      clusterName: ecsCluster.name,
      clusterArn: ecsCluster.arn,
      serviceName: "haproxy-service",
      imageUri: haproxyImageUri,
      containerPort: 80,
      containerMemory: 512,
      containerCpu: 256,
      desiredCount: 2,
      subnets: vpcResources.publicSubnets.map((s) => s.id),
      securityGroups: [vpcResources.publicSecurityGroup.id],
      assignPublicIp: true,
      enableLogging: true,
    });

    console.log("✅ HAProxy Service deployed");
    console.log(`   - Service Name: haproxy-service`);
    console.log(`   - Replicas: 2 (FARGATE)`);
    console.log(`   - Subnets: Public\n`);

    // Step 5: Deploy Nginx Service (Fargate - Private Subnets)
    console.log("🌐 Deploying Nginx Service...");
    const nginxImageUri = this.pulumiConfig.get("nginx-image-uri")
      ? this.pulumiConfig.get("nginx-image-uri")!
      : pulumi.interpolate`${ecrResources.nginxRepo.repositoryUrl}:latest`;

    const nginxService = createEcsService({
      clusterName: ecsCluster.name,
      clusterArn: ecsCluster.arn,
      serviceName: "nginx-service",
      imageUri: nginxImageUri,
      containerPort: 80,
      containerMemory: 512,
      containerCpu: 256,
      desiredCount: 2,
      subnets: vpcResources.privateSubnets.map((s) => s.id),
      securityGroups: [vpcResources.privateSecurityGroup.id],
      assignPublicIp: false,
      enableLogging: true,
    });

    console.log("✅ Nginx Service deployed");
    console.log(`   - Service Name: nginx-service`);
    console.log(`   - Replicas: 2 (FARGATE)`);
    console.log(`   - Subnets: Private\n`);

    // Get HAProxy service details for public access
    const haproxyServiceDetails = pulumi
      .all([haproxyService.id, ecsCluster.arn])
      .apply(([serviceId, clusterArn]) => {
        return aws.ecs.getService({
          serviceName: serviceId,
          clusterArn: clusterArn,
        });
      });

    console.log("\n" + "=".repeat(60));
    console.log("✨ Deployment Complete!");
    console.log("=".repeat(60) + "\n");

    console.log("📋 Architecture Summary:");
    console.log(`   Internet → HAProxy (Public) → Nginx (Private)`);
    console.log(`   - VPC: ${vpcResources.vpc.id}`);
    console.log(
      `   - HAProxy Entry Point: ECS Fargate (public subnets with public IP)`
    );
    console.log(
      `   - Nginx Service: ECS Fargate (private subnets, no public IP)`
    );
    console.log(`   - ECS Cluster: ${ecsCluster.name}`);
    console.log(`   - HAProxy Repo: ${ecrResources.haproxyRepo.repositoryUrl}`);
    console.log(`   - Nginx Repo: ${ecrResources.nginxRepo.repositoryUrl}\n`);

    console.log("🔐 Security:");
    console.log(
      `   - HAProxy Security Group: ${vpcResources.publicSecurityGroup.id}`
    );
    console.log(
      `   - Nginx Security Group: ${vpcResources.privateSecurityGroup.id}\n`
    );

    console.log("📤 Next Steps:");
    console.log(
      `   1. Build and push HAProxy image to: ${ecrResources.haproxyRepo.repositoryUrl}`
    );
    console.log(
      `   2. Build and push Nginx image to: ${ecrResources.nginxRepo.repositoryUrl}`
    );
    console.log(`   3. Configure HAProxy to route to Nginx service DNS`);
    console.log(`   4. Deploy and test the infrastructure`);

    // Export important outputs
    return {
      vpcId: vpcResources.vpc.id,
      clusterName: ecsCluster.name,
      haproxyServiceName: haproxyService.name,
      nginxServiceName: nginxService.name,
      haproxyRepoUrl: ecrResources.haproxyRepo.repositoryUrl,
      nginxRepoUrl: ecrResources.nginxRepo.repositoryUrl,
      publicSecurityGroupId: vpcResources.publicSecurityGroup.id,
      privateSecurityGroupId: vpcResources.privateSecurityGroup.id,
      publicSubnets: vpcResources.publicSubnets.length.toString(),
      privateSubnets: vpcResources.privateSubnets.length.toString(),
    };
  }
}
