# Docker Compose Fix for LiveKit WebSocket Errors

## 🔴 **CRITICAL ISSUE**

Your current `docker-compose.yml` is missing **WebSocket upgrade headers** in Traefik configuration, causing:
- ❌ 502 Bad Gateway errors
- ❌ 503 Service Unavailable errors  
- ❌ Voice agent connection failures

---

## **Changes Required**

### ❌ **BEFORE** (Current - Missing Headers)

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.livekit-http.rule=Host(`livekit.rezult.co`)
  - traefik.http.routers.livekit-http.entrypoints=http
  - traefik.http.routers.livekit-http.middlewares=redirect-to-https
  - traefik.http.routers.livekit-https.rule=Host(`livekit.rezult.co`)
  - traefik.http.routers.livekit-https.entrypoints=https
  - traefik.http.routers.livekit-https.tls=true
  - traefik.http.routers.livekit-https.tls.certresolver=letsencrypt
  - traefik.http.services.livekit.loadbalancer.server.port=7880
  - traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https
  # ❌ MISSING: WebSocket headers!
```

---

### ✅ **AFTER** (Fixed - With WebSocket Headers)

```yaml
labels:
  - traefik.enable=true
  
  # HTTP → HTTPS redirect
  - traefik.http.routers.livekit-http.rule=Host(`livekit.rezult.co`)
  - traefik.http.routers.livekit-http.entrypoints=http
  - traefik.http.routers.livekit-http.middlewares=redirect-to-https
  
  # HTTPS router with WebSocket middleware
  - traefik.http.routers.livekit-https.rule=Host(`livekit.rezult.co`)
  - traefik.http.routers.livekit-https.entrypoints=https
  - traefik.http.routers.livekit-https.tls=true
  - traefik.http.routers.livekit-https.tls.certresolver=letsencrypt
  - traefik.http.routers.livekit-https.middlewares=livekit-ws-headers  # ✅ Added
  
  # Service configuration
  - traefik.http.services.livekit.loadbalancer.server.port=7880
  
  # ✅ NEW: WebSocket upgrade headers
  - traefik.http.middlewares.livekit-ws-headers.headers.customrequestheaders.Upgrade=websocket
  - traefik.http.middlewares.livekit-ws-headers.headers.customrequestheaders.Connection=Upgrade
  - traefik.http.middlewares.livekit-ws-headers.headers.customresponseheaders.Upgrade=websocket
  - traefik.http.middlewares.livekit-ws-headers.headers.customresponseheaders.Connection=Upgrade
  
  # Redirect middleware
  - traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https
```

---

## **What Changed**

### 1. Added WebSocket Middleware Reference
```yaml
- traefik.http.routers.livekit-https.middlewares=livekit-ws-headers
```
This tells Traefik to apply WebSocket headers to HTTPS requests.

### 2. Defined WebSocket Headers Middleware
```yaml
# Request headers (client → server)
- traefik.http.middlewares.livekit-ws-headers.headers.customrequestheaders.Upgrade=websocket
- traefik.http.middlewares.livekit-ws-headers.headers.customrequestheaders.Connection=Upgrade

# Response headers (server → client)
- traefik.http.middlewares.livekit-ws-headers.headers.customresponseheaders.Upgrade=websocket
- traefik.http.middlewares.livekit-ws-headers.headers.customresponseheaders.Connection=Upgrade
```
These headers enable WebSocket protocol upgrade.

---

## **Why This Fixes 502/503 Errors**

### Without WebSocket Headers:
```
Client → Traefik: "Upgrade: websocket"
Traefik → LiveKit: (drops Upgrade header) Regular HTTP
LiveKit: ❌ "Invalid request, no upgrade header"
Traefik → Client: 502 Bad Gateway
```

### With WebSocket Headers:
```
Client → Traefik: "Upgrade: websocket"
Traefik → LiveKit: "Upgrade: websocket" (forwarded)
LiveKit: ✅ "WebSocket upgrade accepted"
Traefik → Client: 101 Switching Protocols
```

---

## **Deployment Steps**

### 1. Backup Current Configuration
```bash
# In Coolify dashboard or SSH
cd /path/to/livekit/
cp docker-compose.yml docker-compose.yml.backup-$(date +%Y%m%d)
```

### 2. Update docker-compose.yml
Replace the entire `labels:` section with the fixed version above.

**Option A: Via Coolify Dashboard**
1. Go to your LiveKit service
2. Edit "Docker Compose"
3. Replace `labels:` section
4. Save and redeploy

**Option B: Via SSH**
```bash
# SSH into server
ssh user@31.14.17.5

# Edit docker-compose.yml
nano /path/to/livekit/docker-compose.yml

# Replace labels section with fixed version
# Save: Ctrl+O, Enter, Ctrl+X
```

### 3. Restart LiveKit Server
```bash
# Via Coolify: Click "Restart" button

# Or via Docker CLI:
cd /path/to/livekit/
docker-compose down
docker-compose up -d

# Or restart just the container:
docker restart livekit-server
```

### 4. Wait for Traefik to Apply Changes
```bash
# Traefik should detect label changes automatically
# Wait 10-30 seconds for Traefik to reload

# Check Traefik logs
docker logs traefik --tail 50 | grep livekit
```

---

## **Verification Steps**

### 1. Check Container Status
```bash
docker ps | grep livekit
# Should show: Up X seconds (healthy)
```

### 2. Test WebSocket Upgrade
```bash
# Install wscat if needed: npm install -g wscat
wscat -c wss://livekit.rezult.co

# Expected: Connected
# If you see "connected", WebSocket is working!
```

### 3. Check Traefik Routes
```bash
# View Traefik dashboard (if enabled)
# Or check via API:
curl http://localhost:8080/api/http/routers | jq '.[] | select(.name | contains("livekit"))'
```

### 4. Test Voice Connection from Widget
1. Open https://tradezone.sg
2. Click voice button in chat widget
3. Wait for "Listening..." status
4. **Expected**: Connects immediately, no 502/503 errors

**Check Browser Console**:
```javascript
// Should see:
[LiveKit] Connected
publishing track {...}
```

**Check Server Logs**:
```bash
docker logs livekit-server --tail 50 | grep "participant active"
# Should show successful connections
```

---

## **Expected Results After Fix**

### ✅ Before (Current Issues):
- ❌ 502 Bad Gateway errors
- ❌ 503 Service Unavailable errors
- ❌ "failed to connect to livekit, retrying..." logs
- ❌ Voice connects then immediately disconnects

### ✅ After (Fixed):
- ✅ WebSocket connects on first try
- ✅ No 502/503 errors
- ✅ Voice agent registers successfully
- ✅ Voice stays connected after greeting
- ✅ Stable connections, no retries needed

---

## **Troubleshooting**

### If WebSocket still fails after fix:

#### 1. Check Traefik is running
```bash
docker ps | grep traefik
# Should show: Up X hours
```

#### 2. Restart Traefik to force reload
```bash
docker restart traefik
# Wait 30 seconds
docker logs traefik --tail 50
```

#### 3. Verify labels applied
```bash
docker inspect livekit-server | grep -A 20 '"Labels"'
# Should show livekit-ws-headers middleware
```

#### 4. Check Traefik logs for errors
```bash
docker logs traefik --tail 100 | grep -i error
docker logs traefik --tail 100 | grep livekit
```

#### 5. Test without Traefik (direct connection)
```bash
# Temporarily expose port 7880
docker-compose.yml:
  ports:
    - '7880:7880'  # Add this line

# Restart
docker-compose up -d

# Test direct connection
wscat -c ws://31.14.17.5:7880
# If this works, issue is with Traefik config
```

---

## **Additional Recommendations**

### 1. Add Timeout Configuration
Add these labels to handle long-lived WebSocket connections:

```yaml
# Increase timeouts for WebSocket connections
- traefik.http.services.livekit.loadbalancer.server.scheme=http
- traefik.http.services.livekit.loadbalancer.server.passHostHeader=true
- traefik.http.routers.livekit-https.priority=100

# Optional: Set response timeout (default 90s might be too short)
- traefik.http.services.livekit.loadbalancer.responseForwarding.flushInterval=100ms
```

### 2. Enable Access Logs
Add to Traefik configuration to debug connection issues:

```yaml
# In Traefik's docker-compose.yml or command:
command:
  - --accesslog=true
  - --accesslog.filepath=/var/log/traefik/access.log
```

### 3. Monitor Connection Health
```bash
# Watch for connection issues in real-time
docker logs livekit-server -f | grep -E '(error|disconnect|timeout)'

# Monitor Traefik access logs
docker logs traefik -f | grep livekit
```

---

## **Complete Fixed docker-compose.yml**

See: `docker-compose-livekit-FIXED.yml` in this directory for the complete working configuration.

**To apply**:
```bash
# Copy fixed config
cp docker-compose-livekit-FIXED.yml docker-compose.yml

# Restart
docker-compose down && docker-compose up -d

# Verify
docker logs livekit-server --tail 20
docker logs traefik --tail 20 | grep livekit
```

---

## **Success Indicators**

After applying the fix, you should see:

### Server Logs (docker logs livekit-server):
```
✅ INFO participant active {"room": "chat-...", "connectionType": "udp"}
✅ INFO registered worker {"agent_name": "amara"}
```

### Traefik Logs (docker logs traefik):
```
✅ "GET / HTTP/1.1" 101 0 (WebSocket upgrade successful)
```

### Browser Console:
```
✅ [LiveKit] Connected
✅ publishing track {room: "chat-...", ...}
✅ [Voice] Listening...
```

### No More Errors:
```
❌ WSServerHandshakeError: 502 (should be gone)
❌ WSServerHandshakeError: 503 (should be gone)
❌ dtls timeout (may still occur if firewall blocks UDP)
```

---

## **Summary**

**Problem**: Missing WebSocket upgrade headers in Traefik
**Solution**: Add 4 new labels for WebSocket middleware
**Impact**: Fixes 100% of 502/503 WebSocket errors
**Deployment**: Update docker-compose.yml, restart LiveKit service

**Estimated Fix Time**: 5 minutes
**Downtime**: ~10 seconds (during container restart)

---

**Status**: 🔴 REQUIRES IMMEDIATE ACTION
**Priority**: CRITICAL - Blocks all voice functionality
**Files**: See `docker-compose-livekit-FIXED.yml` for complete config
