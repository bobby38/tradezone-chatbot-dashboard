# TradeZone Scripts

Automation scripts for TradeZone dashboard maintenance.

## Weekly Automation

### 1. Search Console Sync (Saturday 02:15)

Fetches Google Search Console data and syncs to Supabase.

**Script**: `weekly-sc-sync.sh`  
**Launchd**: `com.tradezone.sc-weekly.plist`

### 2. Product Catalog Refresh (Sunday 02:00)

Fetches all products from WooCommerce API and updates the product catalog JSON.

**Script**: `weekly-product-refresh.sh`  
**Launchd**: `com.tradezone.product-weekly.plist`

## Setup Launchd (macOS)

### Install Search Console Sync

```bash
# Copy plist to LaunchAgents
cp scripts/com.tradezone.sc-weekly.plist ~/Library/LaunchAgents/

# Load the job
launchctl load ~/Library/LaunchAgents/com.tradezone.sc-weekly.plist

# Start immediately (test)
launchctl start com.tradezone.sc-weekly

# Check logs
tail -f ~/Library/Logs/com.tradezone.sc-weekly.out.log
tail -f ~/Library/Logs/com.tradezone.sc-weekly.err.log
```

### Install Product Catalog Refresh

```bash
# Copy plist to LaunchAgents
cp scripts/com.tradezone.product-weekly.plist ~/Library/LaunchAgents/

# Load the job
launchctl load ~/Library/LaunchAgents/com.tradezone.product-weekly.plist

# Start immediately (test)
launchctl start com.tradezone.product-weekly

# Check logs
tail -f ~/Library/Logs/com.tradezone.product-weekly.out.log
tail -f ~/Library/Logs/com.tradezone.product-weekly.err.log
```

### Uninstall

```bash
# Unload and remove Search Console sync
launchctl unload ~/Library/LaunchAgents/com.tradezone.sc-weekly.plist
rm ~/Library/LaunchAgents/com.tradezone.sc-weekly.plist

# Unload and remove Product Catalog refresh
launchctl unload ~/Library/LaunchAgents/com.tradezone.product-weekly.plist
rm ~/Library/LaunchAgents/com.tradezone.product-weekly.plist
```

## Manual Execution

### Run Product Catalog Refresh

```bash
# From project root
node scripts/refresh-product-catalog.mjs
```

**Output**: 
- Local: `public/tradezone-WooCommerce-Products.json` (1.1MB, ~1000 products)
- **Appwrite**: Automatically uploaded to storage bucket
- Public URL: `https://studio.getrezult.com/v1/storage/buckets/68e9c23f002de06d1e68/files/tradezone-WooCommerce-Products.json/view?project=68e9c230002bf8a2f26f`

**No manual upload needed!** Script automatically replaces the old version in Appwrite.

### Run Search Console Sync

```bash
# From project root
./scripts/run-sc-sync.sh
```

## Environment Variables Required

### For Product Catalog Refresh

```env
WOOCOMMERCE_CONSUMER_KEY=ck_...
WOOCOMMERCE_CONSUMER_SECRET=cs_...
WOOCOMMERCE_API_BASE=https://tradezone.sg/wp-json/wc/v3
WOOCOMMERCE_PRODUCT_JSON_PATH=https://studio.getrezult.com/v1/storage/buckets/68e9c23f002de06d1e68/files/tradezone-WooCommerce-Products.json/view?project=68e9c230002bf8a2f26f

# For Appwrite auto-upload (server-side only)
APPWRITE_ENDPOINT=https://studio.getrezult.com/v1
APPWRITE_PROJECT_ID=68e9c230002bf8a2f26f
APPWRITE_BUCKET_ID=68e9c23f002de06d1e68
APPWRITE_API_KEY=standard_...
```

### For Search Console Sync

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
SC_SITE=sc-domain:tradezone.sg
NEXT_PUBLIC_SUPABASE_URL=https://....supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Production (Coolify)

Add all environment variables to Coolify. The scripts run locally on your development machine via launchd. For production automation, consider:

1. **GitHub Actions**: Run weekly via cron schedule and commit updated JSON
2. **Coolify Cron**: Set up cron jobs on the server
3. **Manual**: Run locally and upload to CDN manually

## Troubleshooting

### Check if jobs are loaded

```bash
launchctl list | grep tradezone
```

### View job status

```bash
launchctl list com.tradezone.sc-weekly
launchctl list com.tradezone.product-weekly
```

### Force run now

```bash
launchctl start com.tradezone.sc-weekly
launchctl start com.tradezone.product-weekly
```

### Check logs

```bash
# Search Console sync logs
tail -50 ~/Library/Logs/com.tradezone.sc-weekly.out.log
tail -50 ~/Library/Logs/com.tradezone.sc-weekly.err.log

# Product catalog refresh logs
tail -50 ~/Library/Logs/com.tradezone.product-weekly.out.log
tail -50 ~/Library/Logs/com.tradezone.product-weekly.err.log
```
