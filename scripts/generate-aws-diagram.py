#!/usr/bin/env python3
"""
Generate AWS infrastructure diagram from Pulumi IaC
Uses the 'diagram' library for professional AWS architecture diagrams
Install: pip install diagram
"""

from diagram import Diagram, Cluster, Edge
from diagram.aws.network import ELB, Route53, VPC, PublicSubnet, PrivateSubnet, NatGateway, InternetGateway
from diagram.aws.compute import ECS, EC2
from diagram.aws.storage import ECR
from diagram.aws.management import CloudWatch
from diagram.aws.network import SecurityGroup
from diagram.onprem import inmemory

def generate_architecture_diagram():
    """Generate infrastructure diagram"""
    
    with Diagram(
        "React App Infrastructure",
        filename="docs/architecture",
        direction="TB",
        show=False,
        outformat="png"
    ):
        
        internet = inmemory.Storage("Internet\n(Users)")
        
        with Cluster("AWS Cloud (10.0.0.0/16)"):
            
            with Cluster("Public Subnets (10.0.0.0/24, 10.0.1.0/24)"):
                igw = InternetGateway("Internet Gateway")
                
                with Cluster("HAProxy Service"):
                    haproxy_sg = SecurityGroup("Public SG\n:80, :443")
                    haproxy = ECS("HAProxy\nCPU: 256, Mem: 512MB\nDesired: 1")
                
                eip = Route53("Elastic IP")
            
            with Cluster("Private Subnets (10.0.100.0/24, 10.0.101.0/24)"):
                nat = NatGateway("NAT Gateway")
                
                with Cluster("Nginx Service"):
                    nginx_sg = SecurityGroup("Private SG\n:80")
                    nginx = ECS("Nginx\nCPU: 256, Mem: 512MB\nDesired: 1")
            
            with Cluster("Supporting Services"):
                ecr_haproxy = ECR("ECR Haproxy")
                ecr_nginx = ECR("ECR Nginx")
                cloudwatch = CloudWatch("CloudWatch\nLogs & Metrics")
                route53 = Route53("Service Discovery\nreact-app.local")
        
        # Traffic flow
        internet >> Edge(label="HTTP :80\nHTTPS :443") >> haproxy_sg
        haproxy_sg >> haproxy
        haproxy >> Edge(label="HTTP :80") >> nginx_sg
        nginx_sg >> nginx
        
        # Infrastructure connections
        haproxy >> Edge(label="Pull Image") >> ecr_haproxy
        nginx >> Edge(label="Pull Image") >> ecr_nginx
        haproxy >> Edge(label="Send Logs") >> cloudwatch
        nginx >> Edge(label="Send Logs") >> cloudwatch
        nginx >> Edge(label="Register") >> route53
        
        # Network connections
        haproxy >> igw
        nginx >> nat
        nat >> igw
        haproxy >> eip

if __name__ == "__main__":
    try:
        generate_architecture_diagram()
        print("✅ Architecture diagram generated: docs/architecture.png")
        print("📖 View the PNG diagram with your image viewer")
    except ImportError:
        print("❌ Error: 'diagram' library not installed")
        print("Install with: pip install diagram")
        print("\nAlternatively, use the Mermaid diagram:")
        print("  ./scripts/generate-architecture-diagram.sh")
        exit(1)
