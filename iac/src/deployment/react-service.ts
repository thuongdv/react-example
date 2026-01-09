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
    // Step 1: Create VPC with public and private subnets
    const vpcResources = createVpc({
      cidrBlock: "10.0.0.0/16",
      azCount: 2,
    });

    // Step 2: Create ECR repositories
    const ecrResources = createEcrRepositories({
      haproxy: { imageName: "react-app-haproxy" },
      nginx: { imageName: "react-app-nginx" },
    });

    // Step 3: Create ECS Cluster
    const ecsCluster = createEcsCluster({
      name: "react-app-cluster",
    });

    createEcsClusterCapacityProviders(ecsCluster);

    // Step 4: Deploy HAProxy Service (Fargate - Public Subnets)
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

    // Step 5: Deploy Nginx Service (Fargate - Private Subnets)
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

    // Get HAProxy service details for public access
    pulumi
      .all([haproxyService.id, ecsCluster.arn])
      .apply(([serviceId, clusterArn]) => {
        return aws.ecs.getService({
          serviceName: serviceId,
          clusterArn: clusterArn,
        });
      });

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
