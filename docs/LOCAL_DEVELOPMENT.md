# Local Development Setup

This project uses Docker Compose for local development with HAProxy as a load balancer and Nginx serving the React application. The setup supports HTTPS on port 443 with automatic HTTP to HTTPS redirect.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed
- SSL certificates must be generated (see below)

### Generate SSL Certificates (First-Time Setup)

Before running the application for the first time, you need to generate self-signed SSL certificates:

```bash
mkdir -p docker/certs
cd docker/certs
openssl req -x509 -newkey rsa:2048 -keyout haproxy-key.pem -out haproxy-cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
cat haproxy-cert.pem haproxy-key.pem > haproxy.pem
cd ../..
```

This creates the necessary certificates for local HTTPS development. These certificates are valid for 365 days.

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

- **HTTPS (Recommended)**: `https://localhost/` - Secure connection via HAProxy
- **HTTP (Auto-redirect)**: `http://localhost/` - Automatically redirects to HTTPS

### HTTPS Certificate Warning

Since the local setup uses self-signed certificates, browsers will show a security warning. This is normal and expected for local development.

**To proceed:**
- **Chrome/Edge**: Click "Advanced" → "Proceed to localhost (unsafe)"
- **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
- **curl**: Use `-k` flag: `curl -k https://localhost/`

**Note about HSTS and redirects**

After visiting `http://localhost/` once and getting redirected to HTTPS, browsers with HTTP Strict Transport Security (HSTS) enabled will remember this and automatically upgrade future HTTP requests to HTTPS without even sending the initial HTTP request.

If you need to test the HTTP-to-HTTPS redirect behavior explicitly:
- Clear HSTS data for `localhost` in your browser settings, or use a fresh/incognito browser profile, **and/or**
- Use a tool like `curl` to observe the redirect: `curl -vL http://localhost/`

## Architecture

```
Browser → HAProxy (ports 80/443) → Nginx → React App
         (HTTPS 443 primary)
         (HTTP 80 → HTTPS redirect)
```

## Port Mapping

The HAProxy container is exposed on both ports:

```yaml
# docker-compose.yml
ports:
  - "80:80"      # HTTP - redirects to HTTPS
  - "443:443"    # HTTPS - primary secure endpoint
```

## SSL/TLS Configuration

### Self-Signed Certificates

Pre-generated certificates are located in `docker/certs/`:
- `haproxy.pem` - Combined certificate and private key (used by HAProxy)
- Valid for 365 days, uses localhost as CN

### Regenerate Certificates

If certificates expire or need renewal:

```bash
cd docker/certs
openssl req -x509 -newkey rsa:2048 -keyout haproxy-key.pem -out haproxy-cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
cat haproxy-cert.pem haproxy-key.pem > haproxy.pem

# Then rebuild containers
npm run local:start
```

## Troubleshooting

### Port already in use

If port 80 or 443 is already in use:

```bash
# Find and stop the process using the port
lsof -i :80    # Check port 80
lsof -i :443   # Check port 443

# Or map to different ports in docker-compose.yml
ports:
  - "8080:80"   # Use 8080 instead of 80
  - "8443:443"  # Use 8443 instead of 443
```

### Rebuild after changes

```bash
docker-compose up --build -d
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

### Check HAProxy logs for HTTPS errors

```bash
docker-compose logs haproxy | grep -i "ssl\|tls\|443"
```

### Test HTTPS connection

```bash
# Using curl (ignoring self-signed cert)
curl -k -v https://localhost/

# Expected response: 200 OK with React app content
```

### Test HTTP redirect

```bash
curl -v http://localhost/

# Expected response: 301 redirect to https://localhost/
```

## Development vs Production

| Aspect | Local Development | AWS/Production |
|--------|------------------|-----------------|
| **SSL Certificate** | Self-signed (docker/certs/) | AWS ACM or external CA |
| **Port** | 443 (HTTPS primary) | 443 (HTTPS primary) |
| **HTTP Redirect** | Yes (80 → 443) | Yes (80 → 443) |
| **Load Balancer** | HAProxy in Docker | HAProxy in ECS Fargate |
| **DNS** | localhost | Public domain |

## HAProxy Configuration Files

- **Local**: `docker/haproxy.local.cfg`
- **Cloud**: `docker/haproxy.cfg`

Both include:
- HTTP frontend on port 80 with 301 redirect to HTTPS
- HTTPS frontend on port 443 with SSL/TLS
- Security headers (HSTS, CSP, etc.)
- HAProxy stats endpoint at `/haproxy-stats`

## Health Check Endpoint

Both HAProxy and Nginx expose health check endpoints:

- **HAProxy**: `https://localhost/health` (200 OK)
- **Nginx**: `https://localhost/health` (health check for HAProxy)

```bash
curl -k https://localhost/health
# Returns: healthy
```

## Performance Testing

### Load Testing with Apache Bench

```bash
# Install apache2-utils
apt-get install apache2-utils

# Run load test (100 requests, 10 concurrent)
ab -n 100 -c 10 -k https://localhost/

# Expected: >90% of requests succeed
```

## Additional Resources

- [HTTPS Setup and Configuration](./HTTPS_SETUP.md) - Detailed HTTPS configuration guide
- [Architecture](../docs/ARCHITECTURE_UPDATE.md) - System architecture overview
- [Copilot Instructions](.github/copilot-instructions.md) - Development guidelines
