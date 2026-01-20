/**
 * Configuration validation and defaults for Pulumi deployments
 */
import * as pulumi from "@pulumi/pulumi";

export interface DeploymentConfig {
  serviceName: string;
  environmentName: string;
  aws: {
    region: string;
  };
  vpc: {
    cidrBlock: string;
    azCount: number;
  };
  ecs: {
    haproxy: {
      cpu: number;
      memory: number;
      desiredCount: number;
      imageUri?: string;
    };
    nginx: {
      cpu: number;
      memory: number;
      desiredCount: number;
      imageUri?: string;
    };
  };
  logging: {
    retentionDays: number;
    enableContainerInsights: boolean;
  };
}

/**
 * Load and validate Pulumi configuration
 * Provides sensible defaults and validates required values
 */
export function loadDeploymentConfig(): DeploymentConfig {
  const config = new pulumi.Config();

  // Required configurations
  const serviceName = config.require("serviceName");
  const environmentName = config.require("environmentName");

  // AWS Region (default to us-east-1)
  const awsRegion = config.get("aws:region") || "us-east-1";

  // VPC Configuration
  const vpcCidrBlock = config.get("vpc:cidrBlock") || "10.0.0.0/16";
  const vpcAzCount = Number.parseInt(config.get("vpc:azCount") || "2");

  // ECS HAProxy Configuration
  const haproxyCpu = Number.parseInt(config.get("ecs:haproxy:cpu") || "256");
  const haproxyMemory = Number.parseInt(config.get("ecs:haproxy:memory") || "512");
  const haproxyDesiredCount = Number.parseInt(
    config.get("ecs:haproxy:desiredCount") || "1",
  );
  const haproxyImageUri = config.get("haproxy-image-uri");

  // ECS Nginx Configuration
  const nginxCpu = Number.parseInt(config.get("ecs:nginx:cpu") || "256");
  const nginxMemory = Number.parseInt(config.get("ecs:nginx:memory") || "512");
  const nginxDesiredCount = Number.parseInt(
    config.get("ecs:nginx:desiredCount") || "1",
  );
  const nginxImageUri = config.get("nginx-image-uri");

  // Logging Configuration
  const logRetentionDays = Number.parseInt(config.get("logging:retentionDays") || "7");
  const enableContainerInsights =
    config.getBoolean("logging:enableContainerInsights") ?? true;

  // Validation
  validateConfig({
    serviceName,
    environmentName,
    awsRegion,
    vpcCidrBlock,
    vpcAzCount,
  });

  return {
    serviceName,
    environmentName,
    aws: {
      region: awsRegion,
    },
    vpc: {
      cidrBlock: vpcCidrBlock,
      azCount: vpcAzCount,
    },
    ecs: {
      haproxy: {
        cpu: haproxyCpu,
        memory: haproxyMemory,
        desiredCount: haproxyDesiredCount,
        imageUri: haproxyImageUri,
      },
      nginx: {
        cpu: nginxCpu,
        memory: nginxMemory,
        desiredCount: nginxDesiredCount,
        imageUri: nginxImageUri,
      },
    },
    logging: {
      retentionDays: logRetentionDays,
      enableContainerInsights,
    },
  };
}

/**
 * Validate critical configuration values
 * Throws error if invalid configuration detected
 */
function validateConfig(config: {
  serviceName: string;
  environmentName: string;
  awsRegion: string;
  vpcCidrBlock: string;
  vpcAzCount: number;
}): void {
  const errors: string[] = [];

  if (!config.serviceName || config.serviceName.length === 0) {
    errors.push("serviceName is required");
  }

  if (!config.environmentName || config.environmentName.length === 0) {
    errors.push("environmentName is required");
  }

  if (
    !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(config.vpcCidrBlock)
  ) {
    errors.push(
      `Invalid CIDR block: ${config.vpcCidrBlock}. Expected format: x.x.x.x/xx`,
    );
  }

  if (config.vpcAzCount < 1 || config.vpcAzCount > 4) {
    errors.push(
      `Invalid AZ count: ${config.vpcAzCount}. Must be between 1 and 4`,
    );
  }

  if (errors.length > 0) {
    const formattedErrors = errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(`Configuration validation failed:\n${formattedErrors}`);
  }
}
