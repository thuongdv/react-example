# React Sample App

A simple React single page application built with Vite.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run the development server:

   ```bash
   npm run dev
   ```

3. Open your browser and navigate to the URL shown in the terminal (typically http://localhost:5173)

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Features

- ⚡️ Vite for fast development
- ⚛️ React 18
- 🎨 Modern CSS with dark/light mode support
- 🔥 Hot Module Replacement (HMR)

## Documentation

### Infrastructure & Architecture

- **[Architecture Diagrams](DIAGRAM_GENERATION.md)** - Generate and view infrastructure diagrams as code
  - 🎯 **Quick Start**: `./scripts/generate-architecture-diagram.sh` (Mermaid - no dependencies)
  - 🏗️ **Professional**: `./scripts/generate-aws-diagram.py` (AWS-style PNG)
  - 📊 **Dependencies**: `pulumi graph` (Pulumi built-in)
- **[Architecture Overview](docs/ARCHITECTURE_UPDATE.md)** - System architecture and component interactions
- **[Infrastructure Deployment](docs/INFRASTRUCTURE_DEPLOYMENT.md)** - Complete AWS deployment guide
- **[Infrastructure Monitoring](docs/INFRASTRUCTURE_MONITORING.md)** - CloudWatch, metrics, and alarms
- **[ECS Auto-scaling](docs/ECS_AUTOSCALING.md)** - Auto-scaling configuration and optimization

### Development & Operations

- **[Quick Start](docs/QUICK_START.md)** - Quick start guide for the project
- **[Local Development](docs/LOCAL_DEVELOPMENT.md)** - Local development setup and workflows
- **[Docker Image Changelog](docs/DOCKER_IMAGE_CHANGELOG.md)** - Version history and changes for Docker images
- **[Build and Push Custom Images](docs/BUILD_PUSH_CUSTOM_IMAGE.MD)** - Manual build and push instructions
- **[Docker Security](docs/DOCKER_SECURITY.md)** - Container image security scanning and hardening
- **[HTTPS Setup](docs/HTTPS_SETUP.md)** - HTTPS/TLS configuration guide
- **[Environment Variables](docs/ENVIRONMENT_VARIABLES.md)** - Configuration reference guide
- **[GitHub Actions](docs/GITHUB_ACTIONS.md)** - CI/CD pipeline documentation

### Additional Resources

- **[Documentation Index](docs/README.md)** - Complete guide to all documentation
- **[Generated Architecture Diagram](docs/ARCHITECTURE_DIAGRAM.md)** - Mermaid diagrams (auto-generated)

## For AI Coding Agents

This repository includes comprehensive instructions for AI coding agents (like GitHub Copilot) to understand the architecture, development workflows, and best practices. See [.github/copilot-instructions.md](.github/copilot-instructions.md) for detailed guidance.
