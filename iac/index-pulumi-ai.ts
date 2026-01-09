import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Create an ECS cluster
const cluster = new aws.ecs.Cluster("nginx-cluster");

// Create a VPC
const vpc = new awsx.ec2.Vpc("nginx-vpc", {});

// Create a Security Group to allow HTTP traffic
const securityGroup = new aws.ec2.SecurityGroup("nginx-sg", {
    vpcId: vpc.id,
    ingress: [
        {
            protocol: "tcp",
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
    egress: [
        {
            protocol: "tcp",
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
});

// Create an ECR repository for the Nginx image
const repo = new aws.ecr.Repository("nginx-repo");

// Build and push the Nginx Docker image to ECR
const image = new awsx.ecr.Image("nginx-image", {
    repositoryUrl: repo.repositoryUrl,
    path: "./app", // Path to your web application
});

// Create a Fargate task definition for the Nginx container
const taskDef = new awsx.ecs.FargateTaskDefinition("nginx-task", {
    container: {
        image: image.imageUri,
        memory: 512,
        cpu: 256,
        portMappings: [{ containerPort: 80 }],
    },
});

// Create a Fargate service to run the Nginx container
const service = new awsx.ecs.FargateService("nginx-service", {
    cluster: cluster.arn,
    desiredCount: 2,
    taskDefinition: taskDef.taskDefinition.arn,
    networkConfiguration: {
        subnets: vpc.publicSubnetIds,
        securityGroups: [securityGroup.id],
    },
});

// Export the URL of the load balancer
export const url = service.loadBalancer.loadBalancer.dnsName;