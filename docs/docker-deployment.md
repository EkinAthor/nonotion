# Docker Deployment Guide

This guide covers deploying Nonotion using Docker and Docker Compose.

## Quick Start

1. **Copy the environment file:**
   ```bash
   cp .env.docker.example .env
   ```

2. **Edit `.env` and set a secure JWT secret:**
   ```bash
   # Generate a secure secret
   openssl rand -hex 32

   # Edit .env and set JWT_SECRET
   ```

3. **Build and start the application:**
   ```bash
   docker-compose up -d
   ```

4. **Access the application:**
   Open http://localhost in your browser.

## Configuration Reference

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT token signing | `openssl rand -hex 32` |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_EMAIL` | (first user) | Email that becomes admin on registration |
| `WEB_PORT` | `80` | Port for web server on host |
| `CORS_ORIGINS` | `http://localhost,http://localhost:80` | Allowed CORS origins (comma-separated) |
| `PORT` | `3001` | Internal API port |
| `API_UPSTREAM` | `api:3001` | API upstream for nginx proxy |

## Deployment Scenarios
 
### 1. Non-Production (SQLite)
 
This is the default configuration in `docker-compose.yml`.
 
1. **Copy `.env.example` to `.env`**.
2. **Run:**
   ```bash
   docker compose up -d
   ```
 
**Note:** Data is stored in the `nonotion-data` volume. This mode is NOT recommended for production use with heavy load or multiple instances.
 
### 2. Production (External PostgreSQL)
 
For production, you should connect to a managed PostgreSQL database (e.g., Supabase, RDS).
 
1. **Configure `.env`**:
   ```bash
   STORAGE_TYPE=postgres
   DATABASE_URL=postgresql://user:pass@host:5432/db
   JWT_SECRET=your-secure-secret
   ```
 
2. **Run:**
   ```bash
   docker compose up -d
   ```
 
### 3. Testing (Local PostgreSQL)
 
See `README.md` for instructions on using `docker-compose.postgres.yml`.

### API Only

Run just the API for headless or custom frontend deployments:

```bash
cd apps/api
docker-compose up -d

# Or from root
docker-compose -f apps/api/docker-compose.yml up -d
```

The API will be available at http://localhost:3001

### Web Only

Run just the web frontend (requires external API):

```bash
cd apps/web

# Set the API upstream
export API_UPSTREAM=your-api-host:3001

docker-compose up -d
```

## Production Recommendations

### 1. Use Strong Secrets

Generate a secure JWT secret:
```bash
openssl rand -hex 32
```

### 2. Use a Reverse Proxy

For HTTPS and additional security, place nginx or Traefik in front:

```yaml
# docker-compose.override.yml
services:
  web:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.nonotion.rule=Host(`nonotion.example.com`)"
      - "traefik.http.routers.nonotion.tls.certresolver=letsencrypt"
```

### 3. Persist Data

Data is stored in a Docker volume by default. For explicit control:

```yaml
# docker-compose.override.yml
volumes:
  nonotion-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /path/to/your/data
```

### 4. Set Resource Limits

```yaml
# docker-compose.override.yml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
  web:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M
```

### 5. Enable Logging

```yaml
# docker-compose.override.yml
services:
  api:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

## Backup and Restore

### Backup Data

```bash
# Create a backup of the data volume
docker run --rm \
  -v nonotion_nonotion-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/nonotion-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore Data

```bash
# Stop the application
docker-compose down

# Restore from backup
docker run --rm \
  -v nonotion_nonotion-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/nonotion-backup-YYYYMMDD.tar.gz -C /data"

# Start the application
docker-compose up -d
```

## Troubleshooting

### Check Container Status

```bash
docker-compose ps
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
```

### Health Checks

```bash
# Check API health
curl http://localhost:3001/health

# Check Web health (via nginx)
curl http://localhost/health
```

### Verify Non-Root User

```bash
docker exec nonotion-api whoami
# Should return: nodejs
```

### Rebuild Images

```bash
# Force rebuild without cache
docker-compose build --no-cache

# Rebuild and restart
docker-compose up -d --build
```

### Container Shell Access

```bash
# API container
docker exec -it nonotion-api sh

# Web container
docker exec -it nonotion-web sh
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Host                          │
│                                                          │
│  ┌────────────────┐      ┌────────────────────────────┐ │
│  │   nonotion-web │      │       nonotion-api         │ │
│  │    (nginx)     │──────│        (Node.js)           │ │
│  │   Port: 80     │ :3001│        Port: 3001          │ │
│  └────────────────┘      └──────────────┬─────────────┘ │
│                                         │               │
│                          ┌──────────────▼─────────────┐ │
│                          │      nonotion-data         │ │
│                          │    (Docker Volume)         │ │
│                          │  - nonotion.db (SQLite)    │ │
│                          │  - pages/*.json            │ │
│                          │  - blocks/*.json           │ │
│                          └────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Image Sizes

| Image | Approximate Size |
|-------|------------------|
| nonotion-api | ~180MB |
| nonotion-web | ~40MB |

Sizes are approximate and may vary based on dependencies.
