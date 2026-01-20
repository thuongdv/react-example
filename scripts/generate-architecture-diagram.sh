#!/bin/bash

# Generate Mermaid diagram for infrastructure
# Usage: ./scripts/generate-architecture-diagram.sh

OUTPUT_FILE="docs/ARCHITECTURE_DIAGRAM.md"

cat > "$OUTPUT_FILE" << 'EOF'
# Infrastructure Architecture Diagram

## System Overview

```mermaid
graph TB
    subgraph "Internet"
        USER["👤 Users / Clients"]
    end
    
    subgraph "AWS Cloud"
        subgraph "Public Subnets (10.0.0.0/24, 10.0.1.0/24)"
            IGW["🌐 Internet Gateway"]
            HAProxy["📤 HAProxy<br/>(ECS Fargate)<br/>Ports: 8080, 8443"]
            EIP["🔗 Elastic IP"]
        end
        
        subgraph "Private Subnets (10.0.100.0/24, 10.0.101.0/24)"
            Nginx["📦 Nginx<br/>(ECS Fargate)<br/>Port: 80"]
            NAT["🔄 NAT Gateway"]
        end
        
        subgraph "Supporting Services"
            SD["🔍 Service Discovery<br/>(react-app.local)"]
            ECR["📦 ECR Repositories<br/>HAProxy & Nginx Images"]
            CW["📊 CloudWatch<br/>Logs & Metrics"]
            VPC["🌍 VPC<br/>(10.0.0.0/16)"]
        end
    end
    
    USER -->|HTTP 80| HAProxy
    USER -->|HTTPS 443| HAProxy
    HAProxy -->|HTTP 80| Nginx
    HAProxy -->|DNS Query| SD
    Nginx -->|Service Registration| SD
    HAProxy -->|Download| ECR
    Nginx -->|Download| ECR
    HAProxy -->|Send Logs| CW
    Nginx -->|Send Logs| CW
    HAProxy --> EIP
    HAProxy --> IGW
    NAT --> IGW
    Nginx --> NAT
    HAProxy -.->|Health Check| Nginx
    VPC -->|Contains| HAProxy
    VPC -->|Contains| Nginx
```

## Traffic Flow

### HTTP/HTTPS Request Flow

```mermaid
sequenceDiagram
    participant Client as Browser/Client
    participant HAProxy as HAProxy<br/>(Public)
    participant Nginx as Nginx<br/>(Private)
    participant App as React App
    
    Client->>HAProxy: HTTP :80
    HAProxy->>HAProxy: Redirect to HTTPS
    HAProxy-->>Client: 301 HTTPS :443
    
    Client->>HAProxy: HTTPS :443
    HAProxy->>HAProxy: TLS Termination
    HAProxy->>Nginx: HTTP :80<br/>(Clear Text)
    Nginx->>App: Serve React App
    App-->>Nginx: Static Assets
    Nginx-->>HAProxy: Response
    HAProxy-->>Client: HTTPS Response
```

## Resource Architecture

```mermaid
graph LR
    subgraph "Network"
        VPC["VPC<br/>10.0.0.0/16"]
        PubSub["Public Subnets<br/>AZ1, AZ2..."]
        PrivSub["Private Subnets<br/>AZ1, AZ2..."]
    end
    
    subgraph "Load Balancer"
        HAProxySG["Public SG<br/>:80, :443"]
        HAProxyTask["HAProxy Tasks<br/>CPU: 256, Mem: 512MB<br/>Desired: 1"]
    end
    
    subgraph "Backend"
        NginxSG["Private SG<br/>:80 from HAProxy"]
        NginxTask["Nginx Tasks<br/>CPU: 256, Mem: 512MB<br/>Desired: 1"]
    end
    
    subgraph "Discovery & Registry"
        NS["Service Namespace<br/>react-app.local"]
        NginxSD["Nginx Service<br/>nginx.react-app.local"]
    end
    
    subgraph "Observability"
        Logs["CloudWatch Logs<br/>/ecs/haproxy-service<br/>/ecs/nginx-service"]
        Metrics["Container Insights<br/>CPU, Memory, Network"]
    end
    
    VPC --> PubSub
    VPC --> PrivSub
    PubSub --> HAProxySG
    PrivSub --> NginxSG
    HAProxySG --> HAProxyTask
    NginxSG --> NginxTask
    NS --> NginxSD
    NginxTask --> NginxSD
    HAProxyTask --> Logs
    NginxTask --> Logs
    HAProxyTask --> Metrics
    NginxTask --> Metrics
```

## ECS Cluster Architecture

```mermaid
graph TB
    Cluster["ECS Cluster<br/>react-app-cluster"]
    
    subgraph "HAProxy Service"
        HAProxyTD["Task Definition<br/>haproxy-service"]
        HAProxyService["Service<br/>haproxy-service<br/>Desired: 1, Running: 1"]
        HAProxyTask1["Task 1<br/>RUNNING"]
        HAProxyTask2["Task 2<br/>(if scaled)"]
    end
    
    subgraph "Nginx Service"
        NginxTD["Task Definition<br/>nginx-service"]
        NginxService["Service<br/>nginx-service<br/>Desired: 1, Running: 1"]
        NginxTask1["Task 1<br/>RUNNING"]
        NginxTask2["Task 2<br/>(if scaled)"]
    end
    
    Cluster --> HAProxyService
    Cluster --> NginxService
    HAProxyTD --> HAProxyService
    HAProxyService --> HAProxyTask1
    HAProxyService -.->|with auto-scaling| HAProxyTask2
    NginxTD --> NginxService
    NginxService --> NginxTask1
    NginxService -.->|with auto-scaling| NginxTask2
```

## Security Groups & Network Flow

```mermaid
graph LR
    Internet["🌐 Internet<br/>0.0.0.0/0"]
    PublicSG["📋 Public SG<br/>HAProxy"]
    PrivateSG["📋 Private SG<br/>Nginx"]
    
    Internet -->|:80| PublicSG
    Internet -->|:443| PublicSG
    PublicSG -->|:80| PrivateSG
    PublicSG -->|:443| PrivateSG
    
    PublicSG -->|Egress: All| Internet
    PrivateSG -->|Egress: All| NAT["NAT Gateway<br/>via IGW"]
    NAT -->|Outbound| Internet
```

## Resource Tagging

All resources are automatically tagged with:

```
Creator: <AWS Account ARN>
PulumiStack: <Stack Name>
Environment: <dev|staging|prod>
Service: react-service
```

## Deployment Flow

```mermaid
graph LR
    Config["Pulumi Config"]
    IaC["IaC Code<br/>TypeScript"]
    Validation["Config Validation<br/>iac/src/config.ts"]
    
    Create["Create Resources"]
    VPC_Create["VPC & Networking"]
    ECR_Create["ECR Repositories"]
    ECS_Create["ECS Cluster"]
    SD_Create["Service Discovery"]
    Services_Create["HAProxy & Nginx<br/>Services"]
    
    Outputs["Stack Outputs"]
    
    Config --> Validation
    IaC --> Validation
    Validation -->|Valid| Create
    Create --> VPC_Create
    Create --> ECR_Create
    Create --> ECS_Create
    Create --> SD_Create
    VPC_Create --> Services_Create
    ECS_Create --> Services_Create
    SD_Create --> Services_Create
    Services_Create --> Outputs
```

## Component Details

### HAProxy (Load Balancer)
- **Location**: Public Subnets
- **Ports**: 8080 (HTTP redirect), 8443 (HTTPS)
- **Role**: TLS termination, HTTP redirect, load balancing
- **Scaling**: Auto-scales based on CPU/memory

### Nginx (Web Server)
- **Location**: Private Subnets
- **Port**: 80 (internal only)
- **Role**: Reverse proxy, static asset serving
- **Discovery**: Available at `nginx.react-app.local` via AWS Cloud Map

### Service Discovery
- **Type**: AWS Cloud Map (Private DNS)
- **Namespace**: `react-app.local`
- **Services**:
  - `nginx.react-app.local` → Nginx tasks

### Monitoring
- **CloudWatch Logs**: Automatic log collection
  - `/ecs/haproxy-service`
  - `/ecs/nginx-service`
- **Container Insights**: CPU, memory, network metrics
- **Health Checks**: 30-second intervals on `/health` endpoint

## Configuration Options

Key configurable parameters:

```
VPC CIDR:           10.0.0.0/16
AZ Count:           1-4 (configurable)
HAProxy CPU:        256 units (configurable)
HAProxy Memory:     512 MB (configurable)
HAProxy Desired:    1 (configurable, auto-scalable)
Nginx CPU:          256 units (configurable)
Nginx Memory:       512 MB (configurable)
Nginx Desired:      1 (configurable, auto-scalable)
Log Retention:      7 days (configurable)
Container Insights: Enabled (configurable)
```

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for complete reference.

EOF

echo "✅ Architecture diagram generated: $OUTPUT_FILE"
echo "📖 View the diagram in your markdown viewer or GitHub"
