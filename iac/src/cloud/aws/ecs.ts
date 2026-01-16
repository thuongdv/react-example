import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface EcsClusterConfig {
  name?: string;
  tags?: { [key: string]: string };
}

interface EcsServiceConfig {
  clusterName: pulumi.Input<string>;
  clusterArn: pulumi.Input<string>;
  serviceName: string;
  imageUri: pulumi.Input<string>;
  containerPort: number;
  additionalPorts?: number[]; // Support for multiple ports (e.g., 80 and 443 for HAProxy)
  containerMemory: number;
  containerCpu: number;
  desiredCount?: number;
  subnets: pulumi.Input<string>[];
  securityGroups: pulumi.Input<string>[];
  assignPublicIp?: boolean;
  enableLogging?: boolean;
  cloudwatchLogGroup?: aws.cloudwatch.LogGroup;
  serviceRegistryArn?: pulumi.Input<string>;
}

export interface EcsResources {
  cluster: aws.ecs.Cluster;
  clusterCapacityProviders: aws.ecs.ClusterCapacityProviders;
  taskRole: aws.iam.Role;
  taskExecutionRole: aws.iam.Role;
  haproxyService: aws.ecs.Service;
  nginxService: aws.ecs.Service;
}

export function createEcsCluster(
  config: EcsClusterConfig = {}
): aws.ecs.Cluster {
  const clusterName = config.name || "react-app-cluster";

  const cluster = new aws.ecs.Cluster(clusterName, {
    name: clusterName,
    settings: [
      {
        name: "containerInsights",
        value: "enabled",
      },
    ],
    tags: {
      Name: clusterName,
      ...config.tags,
    },
  });

  return cluster;
}

export function createEcsClusterCapacityProviders(
  cluster: aws.ecs.Cluster
): aws.ecs.ClusterCapacityProviders {
  return new aws.ecs.ClusterCapacityProviders("capacity-providers", {
    clusterName: cluster.name,
    capacityProviders: ["FARGATE", "FARGATE_SPOT"],
    defaultCapacityProviderStrategies: [
      {
        capacityProvider: "FARGATE",
        weight: 100,
        base: 1,
      },
    ],
  });
}

export function createServiceDiscoveryNamespace(
  vpcId: pulumi.Input<string>
): aws.servicediscovery.PrivateDnsNamespace {
  return new aws.servicediscovery.PrivateDnsNamespace("react-app-namespace", {
    name: "react-app.local",
    vpc: vpcId,
    description: "Service discovery namespace for React app services",
  });
}

export function createTaskRole(roleName: string): aws.iam.Role {
  const role = new aws.iam.Role(roleName, {
    name: roleName,
    assumeRolePolicy: pulumi.output(
      aws.iam.getPolicyDocument({
        statements: [
          {
            actions: ["sts:AssumeRole"],
            principals: [
              {
                type: "Service",
                identifiers: ["ecs-tasks.amazonaws.com"],
              },
            ],
          },
        ],
      })
    ).json,
    tags: {
      Name: roleName,
    },
  });

  return role;
}

export function createTaskExecutionRole(roleName: string): aws.iam.Role {
  const role = new aws.iam.Role(roleName, {
    name: roleName,
    assumeRolePolicy: pulumi.output(
      aws.iam.getPolicyDocument({
        statements: [
          {
            actions: ["sts:AssumeRole"],
            principals: [
              {
                type: "Service",
                identifiers: ["ecs-tasks.amazonaws.com"],
              },
            ],
          },
        ],
      })
    ).json,
    tags: {
      Name: roleName,
    },
  });

  // Attach the default ECS task execution role policy
  new aws.iam.RolePolicyAttachment(`${roleName}-policy`, {
    role: role,
    policyArn:
      "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  return role;
}

export function createEcsService(config: EcsServiceConfig): aws.ecs.Service {
  const taskRole = createTaskRole(`${config.serviceName}-task-role`);
  const taskExecutionRole = createTaskExecutionRole(
    `${config.serviceName}-task-execution-role`
  );

  // Create CloudWatch Log Group if logging is enabled
  let logGroupName: pulumi.Input<string> | undefined;
  if (config.enableLogging !== false) {
    const logGroup =
      config.cloudwatchLogGroup ||
      new aws.cloudwatch.LogGroup(`/ecs/${config.serviceName}`, {
        retentionInDays: 7,
        tags: {
          Name: `${config.serviceName}-logs`,
        },
      });
    logGroupName = logGroup.name;
  }

  // Build port mappings
  const portMappings = [
    {
      containerPort: config.containerPort,
      hostPort: config.containerPort,
      protocol: "tcp",
    },
  ];
  
  if (config.additionalPorts) {
    config.additionalPorts.forEach((port) => {
      portMappings.push({
        containerPort: port,
        hostPort: port,
        protocol: "tcp",
      });
    });
  }

  // Determine health check port (prefer port 80 if available for non-SSL health checks)
  const healthCheckPort = config.additionalPorts?.includes(80) 
    ? 80 
    : config.containerPort;

  // Create task definition
  const taskDefinition = new aws.ecs.TaskDefinition(
    `${config.serviceName}-task`,
    {
      family: config.serviceName,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      cpu: config.containerCpu.toString(),
      memory: config.containerMemory.toString(),
      executionRoleArn: taskExecutionRole.arn,
      taskRoleArn: taskRole.arn,
      containerDefinitions: pulumi
        .all([config.imageUri, logGroupName])
        .apply(([imageUri, logGroup]) => {
          const containerDef = {
            name: config.serviceName,
            image: imageUri,
            portMappings: portMappings,
            essential: true,
            healthCheck: {
              command: [
                "CMD-SHELL",
                `wget -qO- http://127.0.0.1:${healthCheckPort}/health || exit 1`,
              ],
              interval: 30,
              timeout: 10,
              retries: 5,
              startPeriod: 120,
            },
          } as any;

          if (logGroup) {
            containerDef.logConfiguration = {
              logDriver: "awslogs",
              options: {
                "awslogs-group": logGroup,
                "awslogs-region": aws.config.region!,
                "awslogs-stream-prefix": "ecs",
              },
            };
          }

          return JSON.stringify([containerDef]);
        }),
      tags: {
        Name: `${config.serviceName}-task-def`,
      },
    }
  );

  // Create the service
  const serviceConfig: any = {
    name: config.serviceName,
    cluster: config.clusterArn,
    taskDefinition: taskDefinition.arn,
    desiredCount: config.desiredCount || 1,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: config.subnets,
      securityGroups: config.securityGroups,
      assignPublicIp: config.assignPublicIp || false,
    },
    tags: {
      Name: `${config.serviceName}-service`,
    },
  };

  // Add service registry if provided
  if (config.serviceRegistryArn) {
    serviceConfig.serviceRegistries = {
      registryArn: config.serviceRegistryArn,
    };
  }

  const service = new aws.ecs.Service(config.serviceName, serviceConfig);

  return service;
}
