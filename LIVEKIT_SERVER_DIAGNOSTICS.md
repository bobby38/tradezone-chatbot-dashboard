# LiveKit Self-Hosted Server Diagnostics

## Current Issue Summary

**Problem**: Voice agent connects but experiences frequent disconnections, DTLS timeouts, and 502/503 errors

**Server IP**: `31.14.17.5`
**Domain**: `livekit.rezult.co`

---

## Quick Diagnostic Commands

### 1. Check Firewall Rules
```bash
# SSH into LiveKit server
ssh user@31.14.17.5

# Check if required ports are open
sudo iptables -L -n | grep -E '(7880|7881|50000)'

# Check UFW status
sudo ufw status verbose | grep -E '(7880|7881|50000)'
```

**Expected Output**:
```
7880/tcp    ALLOW       Anywhere    # LiveKit HTTP
7881/tcp    ALLOW       Anywhere    # LiveKit TCP
7881/udp    ALLOW       Anywhere    # LiveKit UDP
50000:50100/udp ALLOW   Anywhere    # LiveKit RTP media
```

---

### 2. Test UDP Port Connectivity (From Client Machine)

```bash
# Install netcat if needed
# Mac: brew install netcat
# Ubuntu: sudo apt install netcat

# Test UDP ports (50000-50100 range)
nc -u -z -v 31.14.17.5 50000
nc -u -z -v 31.14.17.5 50050
nc -u -z -v 31.14.17.5 50100

# Expected: "succeeded!" for each
```

---

### 3. Check LiveKit Server Status
```bash
# Check LiveKit container logs
docker logs livekit-server --tail 100

# Check for errors
docker logs livekit-server 2>&1 | grep -i error | tail -20

# Check agent connection
docker logs voice-agent --tail 50 | grep -i "registered worker"
```

**Expected**:
```
INFO registered worker {"agent_name": "amara", "workerID": "AW_..."}
```

---

### 4. Verify Environment Variables
```bash
# On LiveKit server container
docker exec livekit-server env | grep -E '(LIVEKIT_URL|API_KEY|API_SECRET)'

# On voice agent container
docker exec voice-agent env | grep -E '(LIVEKIT|VOICE|ASSEMBLYAI|CHATKIT)'
```

**Required Variables** (Voice Agent):
```bash
LIVEKIT_URL=wss://livekit.rezult.co
LIVEKIT_API_KEY=API3da1...
LIVEKIT_API_SECRET=...
LIVEKIT_AGENT_NAME=amara
VOICE_STACK=classic
VOICE_NOISE_CANCELLATION=false
ASSEMBLYAI_API_KEY=...
CHATKIT_API_KEY=tzck_mfuWZAo12CkCi9-AMQOSZAvLW7cDJaUB
NEXT_PUBLIC_API_URL=https://trade.rezult.co
```

---

## Fix Instructions

### Fix 1: Open Required Firewall Ports ⚠️ CRITICAL

```bash
# SSH into server
ssh user@31.14.17.5

# Open LiveKit ports
sudo ufw allow 7880/tcp comment 'LiveKit HTTP'
sudo ufw allow 7881/tcp comment 'LiveKit TCP fallback'
sudo ufw allow 7881/udp comment 'LiveKit UDP'
sudo ufw allow 50000:50100/udp comment 'LiveKit RTP media'

# Reload firewall
sudo ufw reload

# Verify rules
sudo ufw status verbose | grep -E '(7880|7881|50000)'
```

---

### Fix 2: Check VPS Provider Firewall

**If using Hetzner Cloud**:
1. Go to Hetzner Cloud Console
2. Select your server
3. Go to "Firewalls" tab
4. Ensure these ports are allowed:
   - **7880/tcp** - HTTP (incoming)
   - **7881/tcp** - TCP (incoming)
   - **7881/udp** - UDP (incoming)
   - **50000-50100/udp** - RTP media (incoming)

**If using Digital Ocean**:
1. Go to Digital Ocean Dashboard
2. Select your droplet
3. Go to "Networking" → "Firewalls"
4. Add inbound rules for above ports

---

### Fix 3: Verify Traefik WebSocket Configuration

**Check Traefik Config** (if using Traefik reverse proxy):
```bash
# Check Traefik docker-compose.yml or labels
docker inspect livekit-server | grep -i traefik

# Required Traefik labels for WebSocket:
# - traefik.http.routers.livekit.rule=Host(`livekit.rezult.co`)
# - traefik.http.services.livekit.loadbalancer.server.port=7880
# - traefik.http.middlewares.livekit-headers.headers.customrequestheaders.Upgrade=websocket
# - traefik.http.middlewares.livekit-headers.headers.customrequestheaders.Connection=Upgrade
```

**Correct Traefik Configuration**:
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.livekit.rule=Host(`livekit.rezult.co`)"
  - "traefik.http.routers.livekit.entrypoints=websecure"
  - "traefik.http.routers.livekit.tls.certresolver=letsencrypt"
  - "traefik.http.services.livekit.loadbalancer.server.port=7880"
  
  # WebSocket upgrade headers (CRITICAL!)
  - "traefik.http.middlewares.livekit-headers.headers.customrequestheaders.Upgrade=websocket"
  - "traefik.http.middlewares.livekit-headers.headers.customrequestheaders.Connection=Upgrade"
  - "traefik.http.routers.livekit.middlewares=livekit-headers"
```

---

### Fix 4: LiveKit Server Configuration

**Check LiveKit config.yaml**:
```bash
# View LiveKit configuration
docker exec livekit-server cat /etc/livekit.yaml

# Or if mounted as volume:
cat /path/to/livekit/config.yaml
```

**Required Configuration**:
```yaml
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 50100
  tcp_port: 7881
  use_external_ip: true
  
# These should be detected automatically, but can be set manually:
# external_ips:
#   - "31.14.17.5"
```

---

## Common Error Messages & Solutions

### Error 1: "dtls timeout: read/write timeout"
**Cause**: UDP packets not reaching server (firewall blocking)

**Solution**:
1. Open UDP ports 50000-50100 on server firewall
2. Check VPS provider firewall
3. Test UDP connectivity from client machine

---

### Error 2: "WSServerHandshakeError: 502/503"
**Cause**: Traefik not forwarding WebSocket properly OR LiveKit server down

**Solution**:
1. Check Traefik logs: `docker logs traefik --tail 50`
2. Verify WebSocket headers in Traefik config
3. Restart LiveKit server: `docker restart livekit-server`
4. Check LiveKit server is running: `docker ps | grep livekit`

---

### Error 3: "could not restart participant"
**Cause**: Client reconnecting too fast, duplicate identity

**Solution**:
This is usually transient. If persistent:
1. Check network stability between client and server
2. Increase reconnection backoff in client code
3. Clear browser cache and test again

---

### Error 4: "silence detected on local audio track"
**Cause**: Browser not capturing mic input OR mic muted

**Solution** (Widget side):
1. Ensure browser mic permission is "Allow" (not "Ask")
2. Check OS mic input level (should be >50%)
3. Test mic in browser: `navigator.mediaDevices.getUserMedia({audio: true})`
4. Add device selection UI to let user choose mic

---

## Testing After Fixes

### 1. Test UDP Connectivity
```bash
# From client machine
nc -u -z -v 31.14.17.5 50000
# Expected: "Connection to 31.14.17.5 50000 port [udp/*] succeeded!"

# Test multiple ports
for port in 50000 50025 50050 50075 50100; do
  echo "Testing port $port..."
  nc -u -z -v -w 1 31.14.17.5 $port
done
```

### 2. Test WebSocket Connection
```bash
# Install wscat if needed: npm install -g wscat

# Test WebSocket handshake
wscat -c wss://livekit.rezult.co

# Expected: Connection established
```

### 3. Test Voice Agent Registration
```bash
# Check agent logs
docker logs voice-agent --tail 20

# Expected:
# {"message": "registered worker", "agent_name": "amara", "workerID": "AW_..."}
```

### 4. Test Full Voice Flow
1. Open widget on tradezone.sg
2. Click voice button
3. Wait for "Listening..." status
4. Speak: "Do you have PS5 games?"
5. **Expected**: Agent responds without disconnecting

**Check Logs**:
```bash
# LiveKit server logs (should show connection)
docker logs livekit-server --tail 50 | grep "participant active"

# Voice agent logs (should show transcript)
docker logs voice-agent --tail 50 | grep "Agent said"
```

---

## Performance Benchmarks

### Connection Time (Target: <500ms)
```bash
# Time the connection from client
time curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  https://livekit.rezult.co
```

### UDP Latency (Target: <50ms)
```bash
# Install hping3: sudo apt install hping3
# Test UDP latency
sudo hping3 -2 -p 50000 -c 10 31.14.17.5

# Expected: avg RTT < 50ms
```

---

## Monitoring Setup (Recommended)

### 1. Add Health Check Endpoint
```bash
# Test LiveKit health
curl https://livekit.rezult.co/health

# Expected: {"status": "ok"}
```

### 2. Set Up Uptime Monitoring
- Use UptimeRobot or similar to ping `https://livekit.rezult.co/health` every 5 minutes
- Alert if health check fails

### 3. Log Aggregation
```bash
# Send logs to external service (optional)
docker logs livekit-server -f | grep ERROR >> /var/log/livekit-errors.log
```

---

## Quick Reference

| Port | Protocol | Purpose | Required |
|------|----------|---------|----------|
| 7880 | TCP | HTTP/WSS signaling | ✅ Yes |
| 7881 | TCP | ICE/TCP fallback | ✅ Yes |
| 7881 | UDP | ICE/UDP | ✅ Yes |
| 50000-50100 | UDP | RTP media | ✅ CRITICAL |

**Critical Checklist**:
- [ ] UDP ports 50000-50100 open on server firewall
- [ ] VPS provider firewall allows UDP 50000-50100
- [ ] Traefik has WebSocket upgrade headers
- [ ] LiveKit server is running (`docker ps`)
- [ ] Voice agent is registered (check logs)
- [ ] Environment variables are set correctly

---

## Contact for Help

**If issues persist after following this guide**:
1. Check LiveKit Community: https://livekit.io/community
2. Review LiveKit Self-Hosting Docs: https://docs.livekit.io/realtime/self-hosting/
3. Check firewall logs for dropped packets: `sudo tail -f /var/log/ufw.log`

**Log Files to Share**:
```bash
# Collect diagnostic info
docker logs livekit-server --tail 200 > livekit-server.log
docker logs voice-agent --tail 200 > voice-agent.log
sudo ufw status verbose > firewall-status.txt
sudo iptables -L -n > iptables-rules.txt

# Create archive
tar -czf livekit-diagnostics-$(date +%Y%m%d).tar.gz *.log *.txt
```

---

**Last Updated**: December 22, 2025
**Status**: Widget fixes COMPLETE ✅ | Server fixes PENDING ⚠️
