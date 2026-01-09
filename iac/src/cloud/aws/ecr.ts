import * as aws from "@pulumi/aws";

interface EcrRepoConfig {
  imageName: string;
  tags?: { [key: string]: string };
}

export interface EcrResources {
  haproxyRepo: aws.ecr.Repository;
  nginxRepo: aws.ecr.Repository;
}

export function createEcrRepositories(config: {
  haproxy?: EcrRepoConfig;
  nginx?: EcrRepoConfig;
}): EcrResources {
  const haproxyConfig = config.haproxy || { imageName: "haproxy" };
  const nginxConfig = config.nginx || { imageName: "nginx" };

  const haproxyRepo = new aws.ecr.Repository(haproxyConfig.imageName, {
    imageScanningConfiguration: {
      scanOnPush: true,
    },
    imageTagMutability: "MUTABLE",
    tags: {
      Name: `react-app-${haproxyConfig.imageName}`,
      ...haproxyConfig.tags,
    },
  });

  const nginxRepo = new aws.ecr.Repository(nginxConfig.imageName, {
    imageScanningConfiguration: {
      scanOnPush: true,
    },
    imageTagMutability: "MUTABLE",
    tags: {
      Name: `react-app-${nginxConfig.imageName}`,
      ...nginxConfig.tags,
    },
  });

  return {
    haproxyRepo,
    nginxRepo,
  };
}
