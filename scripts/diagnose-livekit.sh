#!/bin/bash

# LiveKit Self-Hosted Diagnostic Script
# Checks firewall, network connectivity, and agent status

set -e

echo "=================================="
echo "LiveKit Self-Hosted Diagnostics"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

LIVEKIT_HOST="${LIVEKIT_HOST:-livekit.rezult.co}"
LIVEKIT_URL="${LIVEKIT_URL:-wss://livekit.rezult.co}"

echo "Testing LiveKit Server: $LIVEKIT_HOST"
echo ""

# 1. Check DNS resolution
echo "1. Checking DNS resolution..."
if host $LIVEKIT_HOST > /dev/null 2>&1; then
    IP=$(host $LIVEKIT_HOST | grep "has address" | awk '{print $4}' | head -1)
    echo -e "${GREEN}✓${NC} DNS resolved: $LIVEKIT_HOST -> $IP"
else
    echo -e "${RED}✗${NC} DNS resolution failed for $LIVEKIT_HOST"
    exit 1
fi
echo ""

# 2. Check WebRTC signaling port (7880/tcp)
echo "2. Checking WebRTC signaling port (7880/tcp)..."
if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$LIVEKIT_HOST/7880" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Port 7880/tcp is open (HTTP/WSS signaling)"
else
    echo -e "${RED}✗${NC} Port 7880/tcp is CLOSED or unreachable"
    echo "   This port is required for LiveKit WebSocket connections"
fi
echo ""

# 3. Check ICE/TCP fallback port (7881/tcp)
echo "3. Checking ICE/TCP fallback port (7881/tcp)..."
if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$LIVEKIT_HOST/7881" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Port 7881/tcp is open (ICE/TCP fallback)"
else
    echo -e "${YELLOW}⚠${NC} Port 7881/tcp is CLOSED or unreachable"
    echo "   This is the backup port when UDP is blocked"
fi
echo ""

# 4. Check if UDP ports are likely open (can't directly test without special tools)
echo "4. Checking UDP media ports (7881/udp, 50000-50100/udp)..."
echo -e "${YELLOW}⚠${NC} UDP port testing requires special tools (not included)"
echo "   Required UDP ports:"
echo "   - 7881/udp (ICE/STUN)"
echo "   - 50000-50100/udp (RTP media)"
echo ""
echo "   To test UDP manually on the server:"
echo "   $ sudo netstat -ulnp | grep -E '7881|500[0-9]{2}'"
echo ""

# 5. Check WebSocket connection
echo "5. Checking WebSocket connection..."
if command -v wscat > /dev/null 2>&1; then
    if timeout 5 wscat -c "$LIVEKIT_URL" --execute "exit" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} WebSocket connection successful"
    else
        echo -e "${RED}✗${NC} WebSocket connection failed"
        echo "   URL: $LIVEKIT_URL"
    fi
else
    echo -e "${YELLOW}⚠${NC} wscat not installed, skipping WebSocket test"
    echo "   Install with: npm install -g wscat"
fi
echo ""

# 6. Check environment variables
echo "6. Checking voice agent environment variables..."
ENV_FILE="../.env.local"
if [ -f "$ENV_FILE" ]; then
    echo "Checking $ENV_FILE..."

    if grep -q "LIVEKIT_URL=" "$ENV_FILE"; then
        LIVEKIT_URL_VAR=$(grep "LIVEKIT_URL=" "$ENV_FILE" | cut -d'=' -f2)
        echo -e "${GREEN}✓${NC} LIVEKIT_URL is set: $LIVEKIT_URL_VAR"
    else
        echo -e "${RED}✗${NC} LIVEKIT_URL not found in .env.local"
    fi

    if grep -q "LIVEKIT_AGENT_NAME=" "$ENV_FILE"; then
        AGENT_NAME=$(grep "LIVEKIT_AGENT_NAME=" "$ENV_FILE" | cut -d'=' -f2)
        echo -e "${GREEN}✓${NC} LIVEKIT_AGENT_NAME is set: $AGENT_NAME"
    else
        echo -e "${YELLOW}⚠${NC} LIVEKIT_AGENT_NAME not found (will use default)"
    fi

    if grep -q "VOICE_NOISE_CANCELLATION=" "$ENV_FILE"; then
        NOISE_CANCEL=$(grep "VOICE_NOISE_CANCELLATION=" "$ENV_FILE" | cut -d'=' -f2)
        if [ "$NOISE_CANCEL" = "false" ]; then
            echo -e "${GREEN}✓${NC} VOICE_NOISE_CANCELLATION is set to false (correct for self-hosted)"
        else
            echo -e "${RED}✗${NC} VOICE_NOISE_CANCELLATION is set to $NOISE_CANCEL"
            echo "   For self-hosted, this should be 'false'"
        fi
    else
        echo -e "${YELLOW}⚠${NC} VOICE_NOISE_CANCELLATION not set (defaults to false)"
    fi
else
    echo -e "${YELLOW}⚠${NC} .env.local file not found"
fi
echo ""

# 7. Check Python agent dependencies
echo "7. Checking Python agent dependencies..."
if [ -f "../agents/voice/requirements.txt" ]; then
    if grep -q "livekit" "../agents/voice/requirements.txt"; then
        echo -e "${GREEN}✓${NC} LiveKit dependencies found in requirements.txt"
    else
        echo -e "${RED}✗${NC} LiveKit dependencies missing"
    fi
else
    echo -e "${YELLOW}⚠${NC} requirements.txt not found"
fi
echo ""

# 8. Summary and recommendations
echo "=================================="
echo "Summary & Recommendations"
echo "=================================="
echo ""
echo "Common issues and fixes:"
echo ""
echo "1. ${YELLOW}DTLS timeout errors${NC}"
echo "   → Check firewall allows UDP ports 7881 and 50000-50100"
echo "   → Run on LiveKit server: sudo ufw allow 7881/udp"
echo "   → Run on LiveKit server: sudo ufw allow 50000:50100/udp"
echo ""
echo "2. ${YELLOW}Audio filter cannot be enabled${NC}"
echo "   → Set VOICE_NOISE_CANCELLATION=false in voice agent .env"
echo "   → Noise cancellation is LiveKit Cloud-only feature"
echo ""
echo "3. ${YELLOW}No worker available${NC}"
echo "   → Check Python voice agent is running"
echo "   → Check agent logs for startup errors"
echo "   → Verify LIVEKIT_URL matches server address"
echo ""
echo "4. ${YELLOW}Cannot publish track when not connected${NC}"
echo "   → Update widget to latest version (commit 6e5ef099)"
echo "   → Widget now waits for RoomEvent.Connected before publishing"
echo ""
echo "To check LiveKit server logs:"
echo "  $ ssh user@$LIVEKIT_HOST 'docker logs livekit-server --tail 100'"
echo ""
echo "To check voice agent logs:"
echo "  $ cd agents/voice && tail -f logs/agent.log"
echo ""
