# HTTPS Setup and Configuration

This project supports HTTPS 443 as the primary entry point with automatic HTTP 80 to HTTPS 301 redirect for both local and cloud deployments.

## Overview

- **Primary Endpoint**: HTTPS on port 443 (secure)
- **HTTP Redirect**: HTTP on port 80 redirects to HTTPS with 301 status code
- **SSL Termination**: HAProxy terminates all TLS connections
- **Applies To**: Both local development and AWS cloud deployments

## Local Development (Docker Compose)

### Self-Signed Certificates

Self-signed certificates are **not** committed to version control. You must generate them locally, and they should be placed in `docker/certs/`:

- `haproxy.pem` - Combined certificate and key (used by HAProxy)
- `haproxy-cert.pem` - Certificate only
- `haproxy-key.pem` - Private key only

When generated with the commands below, the certificates are valid for **365 days** and use **localhost** as the CN.

#### Generate or Regenerate Certificates

If certificates do not exist yet, have expired, or need to be regenerated:

```bash
cd docker/certs
openssl req -x509 -newkey rsa:2048 -keyout haproxy-key.pem -out haproxy-cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
cat haproxy-cert.pem haproxy-key.pem > haproxy.pem
```

### Running Locally with HTTPS

```bash
# Start the application
npm run local:start

# Access the application
# HTTPS:  https://localhost/      (uses self-signed cert)
# HTTP:   http://localhost/       (auto-redirects to https)
```

**Note**: Browsers will show a security warning for self-signed certificates. This is normal for local development. You can:
- Click "Advanced" and proceed (varies by browser)
- Add the certificate to your trusted store
- Use `curl -k https://localhost/` to bypass warnings

### Docker Compose Configuration

The HAProxy service now listens on both ports:

```yaml
ports:
  - "80:80"      # HTTP - redirects to HTTPS
  - "443:443"    # HTTPS - primary endpoint
```

## Cloud Deployment (AWS ECS)

### Certificate Management

For production AWS deployments, certificates must be:

1. **Obtained from AWS Certificate Manager (ACM)** or another trusted CA
2. **Stored in docker/certs/** as `haproxy.pem`
3. **Referenced in Dockerfiles** as shown below

#### Steps to Deploy with Production Certificates

1. **Request Certificate in AWS ACM**:
   ```bash
   aws acm request-certificate \
     --domain-name example.com \
     --subject-alternative-names "*.example.com" \
     --region us-east-1
   ```

2. **Download Certificate and Key**:
   - Export from ACM or use your existing certificate files
   - Combine certificate and private key into single PEM file:
     ```bash
     cat certificate.pem private-key.pem > docker/certs/haproxy.pem
     ```

3. **Deploy to AWS**:
   ```bash
   cd iac
   pulumi up
   ```

### Security Group Configuration

The VPC security group allows:

- **Port 80** (HTTP): All ingress traffic - redirects to HTTPS
- **Port 443** (HTTPS): All ingress traffic - primary endpoint
- **Egress**: All traffic to all destinations

```typescript
// From iac/src/cloud/aws/vpc.ts
ingress: [
  { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
  { protocol: "tcp", fromPort: 443, toPort: 443, cidrBlocks: ["0.0.0.0/0"] },
]
```

### HAProxy Configuration

Both `docker/haproxy.cfg` (cloud) and `docker/haproxy.local.cfg` (local) include:

**HTTP Frontend** (Redirect):
```haproxy
frontend http_in
    bind *:80
    http-request redirect scheme https code 301
```

**HTTPS Frontend** (Primary):
```haproxy
frontend https_in
    bind *:443 ssl crt /usr/local/etc/haproxy/certs/haproxy.pem
    # Security headers...
    # HSTS header...
    # Route to backend...
```

## Security Headers

Both configurations include security headers:

```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

The **HSTS header** forces HTTPS for all future requests (for 1 year) once the user visits the HTTPS site.

## Troubleshooting

### Certificate Not Found Error

**Error**: `unable to load PEM file /usr/local/etc/haproxy/certs/haproxy.pem`

**Solution**: 
- Verify `docker/certs/haproxy.pem` exists
- Check file permissions: `chmod 644 docker/certs/haproxy.pem`
- Verify Docker COPY command in Dockerfile

### Browser SSL Warning (Local)

Self-signed certificates will trigger browser warnings. This is normal. To suppress:

**Chrome/Edge**:
- Click "Advanced"
- Click "Proceed to localhost (unsafe)"

**Firefox**:
- Click "Advanced"
- Click "Accept the Risk and Continue"

### HTTP Not Redirecting to HTTPS

**Cause**: HAProxy not configured correctly or wrong port exposed

**Check**:
```bash
# Test redirect
curl -v http://localhost/

# Should show 301 redirect to https://localhost/
```

### Services Not Accessible

**For Local**:
```bash
# Check containers running
docker-compose ps

# View HAProxy logs
docker-compose logs haproxy

# Test HTTPS endpoint
curl -k https://localhost/
```

**For AWS Cloud**:
```bash
# Get HAProxy public IP
aws ecs describe-tasks --cluster react-app-cluster --tasks <TASK_ARN> \
  --query 'tasks[0].attachments[0].details[?name==`publicIp`].value' \
  --output text

# Test endpoint
curl -k https://<PUBLIC_IP>/
```

## Monitoring HTTPS Traffic

### HAProxy Stats Page

Access at: `https://localhost/haproxy-stats` (local) or `https://<PUBLIC_IP>/haproxy-stats` (cloud)

Shows:
- Active connections
- Request rates
- Backend server health
- SSL/TLS statistics

### CloudWatch Logs (AWS)

Monitor in AWS Console:
1. Go to CloudWatch → Log Groups
2. Find `/ecs/haproxy-service`
3. Search for HTTPS/SSL-related events

### tcpdump (Advanced)

```bash
# Inside HAProxy container (local)
docker-compose exec haproxy tcpdump -i eth0 'tcp port 443'

# Or via AWS Systems Manager Session Manager (cloud)
```

## Performance Tuning

### HAProxy SSL Configuration

Current settings in `haproxy.cfg` and `haproxy.local.cfg`:

```haproxy
global
    tune.ssl.default-dh-param 2048  # DH key strength
    tune.bufsize 32768               # Buffer size for SSL

frontend https_in
    bind *:443 ssl crt /path/to/cert.pem
```

### Optimization Tips

1. **Use HTTP/2**: Add to HAProxy bind directive
   ```haproxy
   bind *:443 ssl crt ... alpn h2,http/1.1
   ```

2. **Session Resumption**: Configure TLS session caching
   ```haproxy
   tune.ssl.session-cache 20m
   ```

3. **Certificate Pinning**: Consider HPKP header (use with caution)

## Certificate Rotation

### Local Development

Certificates auto-regenerate:
1. Delete old: `rm docker/certs/haproxy.pem`
2. Regenerate and rebuild: `npm run local:start`

### AWS Production

1. **Request new certificate in ACM**
2. **Update docker/certs/haproxy.pem** with new certificate
3. **Rebuild and push images**:
   ```bash
   ./scripts/build-and-push-haproxy.sh new-tag
   ```
4. **Update ECS service** to use new image tag

## Related Files

- [docker/haproxy.local.cfg](../docker/haproxy.local.cfg) - Local HAProxy config
- [docker/haproxy.cfg](../docker/haproxy.cfg) - Cloud HAProxy config
- [docker/Dockerfile.haproxy.local](../docker/Dockerfile.haproxy.local) - Local container
- [docker/Dockerfile.haproxy](../docker/Dockerfile.haproxy) - Cloud container
- [iac/src/cloud/aws/vpc.ts](../iac/src/cloud/aws/vpc.ts) - Security groups
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) - Architecture overview
