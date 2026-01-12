# Local Development Setup

This project uses Docker Compose for local development with HAProxy as a load balancer and Nginx serving the React application.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed

## Quick Start

### Option 1: Using npm scripts (Recommended)

```bash
# Start the application
npm run local:start

# View logs
npm run local:logs

# Stop the application
npm run local:stop
```

### Option 2: Manual commands

```bash
# Build the React app
npm run build

# Start containers
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

## Access the Application

Once running, access the application at:

- **http://localhost:8080** - Main application through HAProxy

## Architecture

```
Browser → HAProxy (port 8080) → Nginx → React App
```

## Troubleshooting

### Port already in use

If port 8080 is already in use, edit `docker-compose.yml` and change:

```yaml
ports:
  - "8080:80" # Change 8080 to another port
```

### Rebuild after changes

```bash
docker-compose up --build
```

### Clean restart

```bash
docker-compose down
docker-compose up --build
```

### View container status

```bash
docker-compose ps
```

## Development vs Production

- **Local Development**: Uses `docker/Dockerfile.haproxy.local` with simple DNS resolution
- **AWS/Production**: Uses `docker/Dockerfile.haproxy` with AWS Cloud Map service discovery
