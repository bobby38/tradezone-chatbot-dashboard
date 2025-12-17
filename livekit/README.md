# LiveKit Self-Hosted Deployment

Self-hosted LiveKit server for TradeZone Voice Agent at `livekit.rezult.co`.

## Prerequisites

- VPS with Docker & Docker Compose installed
- Domain `livekit.rezult.co` pointing to your VPS IP (A record)
- Ports open: 80, 443 (TCP), 7881 (TCP), 50000-50200 (UDP)

## Quick Start

### 1. Generate API Credentials

```bash
# Generate API Key
echo "API$(openssl rand -hex 12)"
# Example output: API7a3b9c2d1e4f5a6b

# Generate API Secret
openssl rand -base64 32
# Example output: K9xYz8wVuTsRqPoNmLkJiHgFeDcBa0123456789AB=
```

### 2. Configure Environment

```bash
cd livekit
cp .env.example .env
# Edit .env with your generated credentials
nano .env
```

### 3. Update livekit.yaml

Replace the placeholder in `livekit.yaml`:
```yaml
keys:
  APIYourGeneratedKey: YourGeneratedSecretBase64
```

### 4. DNS Setup

Add A record in your DNS provider:
```
livekit.rezult.co → YOUR_VPS_IP
```

### 5. Firewall Setup

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 50000:50200/udp

# Or with firewalld
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=7881/tcp
sudo firewall-cmd --permanent --add-port=50000-50200/udp
sudo firewall-cmd --reload
```

### 6. Deploy

```bash
# Copy files to your VPS
scp -r livekit/ user@your-vps:/opt/livekit/

# SSH into VPS
ssh user@your-vps

# Start services
cd /opt/livekit
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 7. Verify Deployment

```bash
# Test HTTP endpoint
curl https://livekit.rezult.co

# Should return something like:
# {"version":"1.x.x"}
```

## Update Voice Agent

After LiveKit server is running, update your environment variables:

### Dashboard (.env.local)
```bash
LIVEKIT_URL=wss://livekit.rezult.co
LIVEKIT_API_KEY=APIYourGeneratedKey
LIVEKIT_API_SECRET=YourGeneratedSecretBase64
```

### Voice Agent (agents/voice/.env.local)
```bash
LIVEKIT_URL=wss://livekit.rezult.co
LIVEKIT_API_KEY=APIYourGeneratedKey
LIVEKIT_API_SECRET=YourGeneratedSecretBase64
```

### Redeploy via Coolify
1. Update environment variables in Coolify dashboard
2. Trigger redeploy for voice agent

## Troubleshooting

### Connection Issues
```bash
# Check if LiveKit is running
docker ps | grep livekit

# Check logs
docker-compose logs livekit

# Test WebSocket
wscat -c wss://livekit.rezult.co
```

### UDP Not Working
Some VPS providers block UDP. Test with:
```bash
nc -u -l 7881  # On server
nc -u YOUR_VPS_IP 7881  # From local
```

If UDP is blocked, enable TCP fallback in `livekit.yaml`:
```yaml
rtc:
  tcp_port: 7881
  enable_ice_tcp: true
```

### SSL Certificate Issues
```bash
# Check Caddy logs
docker-compose logs caddy

# Force certificate renewal
docker-compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Rollback to LiveKit Cloud

If issues persist, revert to Cloud:
```bash
LIVEKIT_URL=wss://tradezone-xxxxx.livekit.cloud
LIVEKIT_API_KEY=APIOriginalCloudKey
LIVEKIT_API_SECRET=OriginalCloudSecret
```

## Architecture

```
Internet
    │
    ▼
┌─────────────────────────────────────┐
│  Caddy (ports 80, 443)              │
│  - SSL termination                  │
│  - WebSocket proxy                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  LiveKit Server (port 7880)         │
│  - Signaling (WebSocket)            │
│  - Room management                  │
│  - Agent dispatch                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  WebRTC Media (UDP 50000-50200)     │
│  - Audio/video streams              │
│  - Direct peer connections          │
└─────────────────────────────────────┘
```

## Cost Savings

| Item | LiveKit Cloud | Self-Hosted |
|------|---------------|-------------|
| Server | $0 | $0 (existing VPS) |
| Usage | ~$0.03/min | $0 |
| 100 hrs/month | ~$180 | $0 |

## Support

- [LiveKit Docs](https://docs.livekit.io)
- [LiveKit Discord](https://livekit.io/discord)
- [Self-Hosting Guide](https://docs.livekit.io/home/self-hosting/)
