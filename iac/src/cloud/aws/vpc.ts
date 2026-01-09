import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface VpcConfig {
  cidrBlock?: string;
  azCount?: number;
}

export interface VpcResources {
  vpc: aws.ec2.Vpc;
  publicSubnets: aws.ec2.Subnet[];
  privateSubnets: aws.ec2.Subnet[];
  publicSecurityGroup: aws.ec2.SecurityGroup;
  privateSecurityGroup: aws.ec2.SecurityGroup;
  publicRouteTable: aws.ec2.RouteTable;
  privateRouteTable: aws.ec2.RouteTable;
  internetGateway: aws.ec2.InternetGateway;
  eip: aws.ec2.Eip;
  natGateway: aws.ec2.NatGateway;
}

export function createVpc(config: VpcConfig = {}): VpcResources {
  const cidrBlock = config.cidrBlock || "10.0.0.0/16";
  const azCount = config.azCount || 2;

  // Create VPC
  const vpc = new aws.ec2.Vpc("main-vpc", {
    cidrBlock: cidrBlock,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      Name: "react-app-vpc",
    },
  });

  // Get availability zones
  const azs = pulumi.output(aws.getAvailabilityZones({ state: "available" }));

  // Create Internet Gateway
  const internetGateway = new aws.ec2.InternetGateway("main-igw", {
    vpcId: vpc.id,
    tags: {
      Name: "react-app-igw",
    },
  });

  // Create public subnets
  const publicSubnets: aws.ec2.Subnet[] = [];
  const privateSubnets: aws.ec2.Subnet[] = [];

  for (let i = 0; i < azCount; i++) {
    // Public subnet
    const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
      vpcId: vpc.id,
      cidrBlock: `10.0.${i}.0/24`,
      availabilityZone: azs.names[i],
      mapPublicIpOnLaunch: true,
      tags: {
        Name: `react-app-public-subnet-${i}`,
        Type: "Public",
      },
    });
    publicSubnets.push(publicSubnet);

    // Private subnet
    const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
      vpcId: vpc.id,
      cidrBlock: `10.0.${100 + i}.0/24`,
      availabilityZone: azs.names[i],
      tags: {
        Name: `react-app-private-subnet-${i}`,
        Type: "Private",
      },
    });
    privateSubnets.push(privateSubnet);
  }

  // Create Elastic IP for NAT Gateway
  const eip = new aws.ec2.Eip("nat-eip", {
    domain: "vpc",
    tags: {
      Name: "react-app-nat-eip",
    },
  });

  // Create NAT Gateway (in first public subnet)
  const natGateway = new aws.ec2.NatGateway("main-nat", {
    allocationId: eip.id,
    subnetId: publicSubnets[0].id,
    tags: {
      Name: "react-app-nat",
    },
  });

  // Public Route Table
  const publicRouteTable = new aws.ec2.RouteTable("public-rt", {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
      },
    ],
    tags: {
      Name: "react-app-public-rt",
    },
  });

  // Associate public subnets with public route table
  publicSubnets.forEach((subnet, i) => {
    new aws.ec2.RouteTableAssociation(`public-rt-assoc-${i}`, {
      subnetId: subnet.id,
      routeTableId: publicRouteTable.id,
    });
  });

  // Private Route Table
  const privateRouteTable = new aws.ec2.RouteTable("private-rt", {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        natGatewayId: natGateway.id,
      },
    ],
    tags: {
      Name: "react-app-private-rt",
    },
  });

  // Associate private subnets with private route table
  privateSubnets.forEach((subnet, i) => {
    new aws.ec2.RouteTableAssociation(`private-rt-assoc-${i}`, {
      subnetId: subnet.id,
      routeTableId: privateRouteTable.id,
    });
  });

  // Public Security Group (for HAProxy)
  const publicSecurityGroup = new aws.ec2.SecurityGroup("public-sg", {
    vpcId: vpc.id,
    description: "Security group for public resources (HAProxy)",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: "react-app-public-sg",
    },
  });

  // Private Security Group (for Nginx)
  const privateSecurityGroup = new aws.ec2.SecurityGroup("private-sg", {
    vpcId: vpc.id,
    description: "Security group for private resources (Nginx)",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        securityGroups: [publicSecurityGroup.id],
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        securityGroups: [publicSecurityGroup.id],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: "react-app-private-sg",
    },
  });

  return {
    vpc,
    publicSubnets,
    privateSubnets,
    publicSecurityGroup,
    privateSecurityGroup,
    publicRouteTable,
    privateRouteTable,
    internetGateway,
    eip,
    natGateway,
  };
}
