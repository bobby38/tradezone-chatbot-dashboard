#!/bin/bash
# Sync price grid from data/ to agents/voice/ for Docker build

SOURCE="../../data/trade_in_prices_2025.json"
TARGET="./trade_in_prices_2025.json"

if [ ! -f "$SOURCE" ]; then
    echo "❌ Error: Source file not found: $SOURCE"
    exit 1
fi

cp "$SOURCE" "$TARGET"
echo "✅ Synced price grid to agents/voice/"
echo "📊 File size: $(wc -c < "$TARGET") bytes"
echo "🔄 Remember to commit and push after updating prices!"
