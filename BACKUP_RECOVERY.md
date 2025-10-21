# Backup & Recovery Guide

## Overview
Comprehensive disaster recovery procedures for the TradeZone ChatBot Dashboard system.

---

## 🎯 Critical Components to Backup

### 1. **Supabase Database** (Most Critical)
- All tables and data
- RLS policies
- Database functions
- Triggers
- User authentication data

### 2. **Environment Variables** (.env files)
- API keys (OpenAI, Perplexity, etc.)
- Supabase credentials
- Google Analytics/Search Console keys
- WooCommerce credentials
- SMTP settings
- ChatKit security keys

### 3. **Code Repository** (GitHub)
- Application source code
- Migration scripts
- Configuration files
- Documentation

### 4. **Appwrite Storage** (Images)
- User-uploaded images
- Chat attachments
- Product catalog JSON

### 5. **External Integrations**
- Google Analytics property ID
- Search Console site verification
- WooCommerce API credentials
- n8n workflows

---

## 🚀 Backup Methods

### Method 1: Supabase Auto-Backups (Built-in)

**What's Included:**
- ✅ Automatic daily backups (retained for 7 days on free tier)
- ✅ Full database snapshot
- ✅ Point-in-time recovery available on Pro tier

**How to Access:**
```bash
1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/settings/backup
2. View available backups
3. Download or restore as needed
```

**Limitations:**
- Free tier: 7 days retention
- Pro tier: 30 days retention
- Does NOT include code, env vars, or external integrations

---

### Method 2: Manual Database Backup (Recommended Weekly)

#### Full Database Dump (PostgreSQL)

**Via Supabase CLI:**
```bash
# Install Supabase CLI (if not already)
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Create full backup
supabase db dump --data-only > backup_$(date +%Y%m%d).sql

# Backup with schema (recommended)
supabase db dump > backup_full_$(date +%Y%m%d).sql
```

**Via pg_dump (Alternative):**
```bash
# Get your database URL from Supabase Dashboard → Settings → Database
export SUPABASE_DB_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres"

# Full backup
pg_dump $SUPABASE_DB_URL > backup_$(date +%Y%m%d).sql

# Compressed backup (saves space)
pg_dump $SUPABASE_DB_URL | gzip > backup_$(date +%Y%m%d).sql.gz
```

#### Backup Specific Tables Only

```bash
# Backup critical tables
pg_dump $SUPABASE_DB_URL \
  -t chat_logs \
  -t chat_sessions \
  -t chat_usage_metrics \
  -t submissions \
  -t organizations \
  -t profiles \
  -t user_organizations \
  > backup_critical_$(date +%Y%m%d).sql
```

---

### Method 3: Export Data as CSV/JSON (Quick Backups)

#### Via Supabase SQL Editor:

**Export Chat Logs:**
```sql
COPY (
  SELECT * FROM chat_logs 
  ORDER BY created_at DESC
) TO '/tmp/chat_logs_backup.csv' WITH CSV HEADER;
```

**Export Submissions:**
```sql
COPY (
  SELECT * FROM submissions 
  ORDER BY created_at DESC
) TO '/tmp/submissions_backup.csv' WITH CSV HEADER;
```

**Note:** You'll need to download these from the Supabase Dashboard storage.

#### Via Dashboard API (Programmatic):

```javascript
// scripts/backup-to-json.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backupTable(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  
  const filename = `backup_${tableName}_${Date.now()}.json`;
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`✅ Backed up ${data.length} rows to ${filename}`);
}

// Run backups
const tables = ['chat_logs', 'chat_sessions', 'submissions', 'organizations'];
Promise.all(tables.map(backupTable)).then(() => {
  console.log('✅ All backups completed');
});
```

---

### Method 4: Environment Variables Backup

**Create Secure Backup File:**
```bash
# Copy .env.local to secure location
cp .env.local .env.backup_$(date +%Y%m%d)

# Encrypt it (recommended)
openssl enc -aes-256-cbc -salt -in .env.local -out .env.backup_$(date +%Y%m%d).enc

# To decrypt later:
openssl enc -aes-256-cbc -d -in .env.backup_YYYYMMDD.enc -out .env.restored
```

**Store Securely:**
- ✅ 1Password / LastPass / BitWarden (recommended)
- ✅ Encrypted USB drive
- ✅ Secure cloud storage (Google Drive with encryption)
- ❌ Never commit to GitHub
- ❌ Never store in plain text on public servers

---

### Method 5: Appwrite Storage Backup

**Backup Product Catalog:**
```bash
# Download from Appwrite
curl -o backup_product_catalog_$(date +%Y%m%d).json \
  "https://studio.getrezult.com/v1/storage/buckets/68e9c23f002de06d1e68/files/tradezone-WooCommerce-Products.json/view?project=68e9c230002bf8a2f26f"
```

**Backup User Uploads:**
```bash
# List all files in bucket
curl -X GET \
  -H "X-Appwrite-Project: 68e9c230002bf8a2f26f" \
  -H "X-Appwrite-Key: YOUR_API_KEY" \
  https://studio.getrezult.com/v1/storage/buckets/68e9c23f002de06d1e68/files

# Download each file (manual for now)
# TODO: Create automated script
```

---

## 🔄 Automated Backup Schedule (Recommended)

### Cron Job Setup (macOS/Linux)

**Create backup script:**
```bash
#!/bin/bash
# scripts/automated-backup.sh

DATE=$(date +%Y%m%d)
BACKUP_DIR="$HOME/backups/tradezone"
mkdir -p $BACKUP_DIR

# Database backup
pg_dump $SUPABASE_DB_URL | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Environment variables
cp .env.local "$BACKUP_DIR/env_$DATE.backup"

# Product catalog
curl -o "$BACKUP_DIR/products_$DATE.json" \
  "https://studio.getrezult.com/v1/storage/buckets/68e9c23f002de06d1e68/files/tradezone-WooCommerce-Products.json/view?project=68e9c230002bf8a2f26f"

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.backup" -mtime +30 -delete

echo "✅ Backup completed: $DATE"
```

**Make executable:**
```bash
chmod +x scripts/automated-backup.sh
```

**Add to crontab:**
```bash
crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * /path/to/tradezone-chatbot-dashboard/scripts/automated-backup.sh >> /path/to/backups/backup.log 2>&1
```

**Or use Launchd (macOS):**
```xml
<!-- scripts/com.tradezone.daily-backup.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tradezone.daily-backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/scripts/automated-backup.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/path/to/backups/backup.log</string>
    <key>StandardErrorPath</key>
    <string>/path/to/backups/backup.error.log</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.tradezone.daily-backup.plist
```

---

## 🔥 Recovery Procedures

### Scenario 1: Complete Database Loss

**Step 1: Restore from Backup**
```bash
# If using Supabase backup
1. Go to Supabase Dashboard → Settings → Backup
2. Select backup date
3. Click "Restore"

# If using pg_dump backup
psql $SUPABASE_DB_URL < backup_20250116.sql

# If compressed
gunzip -c backup_20250116.sql.gz | psql $SUPABASE_DB_URL
```

**Step 2: Verify Data Integrity**
```sql
-- Check table row counts
SELECT 
  schemaname,
  tablename,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Verify recent chat logs
SELECT COUNT(*), MAX(created_at) FROM chat_logs;

-- Check user accounts
SELECT COUNT(*) FROM profiles;
```

**Step 3: Re-enable RLS (if needed)**
```sql
-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
```

---

### Scenario 2: Corrupted Data (Specific Tables)

**Restore Specific Table:**
```bash
# Extract specific table from backup
pg_restore -t chat_logs backup_20250116.sql > chat_logs_only.sql

# Drop and recreate
psql $SUPABASE_DB_URL -c "DROP TABLE IF EXISTS chat_logs CASCADE;"
psql $SUPABASE_DB_URL < chat_logs_only.sql
```

---

### Scenario 3: Lost Environment Variables

**Restore from backup:**
```bash
# Decrypt if encrypted
openssl enc -aes-256-cbc -d -in .env.backup_20250116.enc -out .env.local

# Or retrieve from password manager
# 1. Open 1Password/LastPass
# 2. Find "TradeZone Environment Variables" entry
# 3. Copy each value back to .env.local
```

**Regenerate if completely lost:**
```bash
# Supabase
1. Get from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api

# OpenAI
2. Get from: https://platform.openai.com/api-keys

# Perplexity
3. Get from: https://www.perplexity.ai/settings/api

# WooCommerce
4. Regenerate from WordPress admin

# Google Analytics/Search Console
5. Download new service account key from Google Cloud Console
```

---

### Scenario 4: Accidental Data Deletion

**Point-in-Time Recovery (Pro Tier Only):**
```bash
1. Go to Supabase Dashboard → Settings → Backup
2. Select "Point in Time Recovery"
3. Choose timestamp BEFORE deletion
4. Restore to new project or current project
```

**If no PITR, use latest backup:**
```bash
# Restore from most recent backup
psql $SUPABASE_DB_URL < backup_latest.sql
```

**Partial restoration:**
```sql
-- If you have JSON backup
-- Restore deleted rows manually
INSERT INTO chat_logs (id, session_id, prompt, response, created_at)
SELECT * FROM json_populate_recordset(null::chat_logs, '[
  {JSON_DATA_FROM_BACKUP}
]');
```

---

### Scenario 5: Application Code Lost (GitHub Disaster)

**Clone from GitHub:**
```bash
git clone https://github.com/YOUR_USERNAME/tradezone-chatbot-dashboard.git
cd tradezone-chatbot-dashboard
```

**If GitHub is down/lost:**
1. Check local Git history: `git reflog`
2. Check backup on other machines
3. Restore from Time Machine (macOS) or Windows Backup
4. Redeploy from Coolify/Vercel deployment history

---

## 📋 Recovery Testing Checklist

Test recovery procedures quarterly:

```
□ Create fresh database backup
□ Restore to test Supabase project
□ Verify all tables restored
□ Check row counts match
□ Verify RLS policies active
□ Test login functionality
□ Test chat interface
□ Test analytics endpoints
□ Verify environment variables
□ Document any issues found
```

---

## 🗂️ Backup Storage Locations (Recommended)

### Local Storage
- **Primary**: External SSD/HDD (daily backups)
- **Path**: `~/backups/tradezone/`
- **Retention**: 30 days local, 90 days external

### Cloud Storage
- **Option 1**: Google Drive (encrypted)
- **Option 2**: Dropbox Business
- **Option 3**: AWS S3 with versioning
- **Retention**: 1 year minimum

### Git Repository
- **Code**: GitHub (private repo)
- **Docs**: Included in repo
- **DO NOT commit**: .env files, backups, credentials

### Password Manager
- **Credentials**: 1Password/LastPass
- **Environment Variables**: Secure note
- **API Keys**: Separate items per service

---

## ⚠️ What NOT to Backup

- ❌ `node_modules/` - Reinstall via `npm install`
- ❌ `.next/` build cache - Regenerated on build
- ❌ `public/uploads/` temp files - Stored in Appwrite
- ❌ Local development databases - Use production backups
- ❌ Log files - Not needed for recovery

---

## 🚨 Emergency Contact Plan

### If Database is Compromised:

1. **Immediately disable public access**
   - Supabase Dashboard → Settings → API → Pause API
   
2. **Notify stakeholders**
   - Email: your-email@example.com
   - Slack: #tradezone-alerts
   
3. **Assess damage**
   - Check audit logs
   - Review security events table
   - Identify compromised data
   
4. **Restore from last known good backup**
   - Use backup from before incident
   - Verify integrity
   
5. **Update all credentials**
   - Rotate API keys
   - Reset passwords
   - Regenerate service account keys

---

## 📊 Backup Size Estimates

| Component | Approximate Size | Frequency |
|-----------|-----------------|-----------|
| Full Database | 50-500 MB | Daily |
| Chat Logs Only | 10-100 MB | Daily |
| Environment Variables | < 1 KB | On change |
| Product Catalog | 1-5 MB | Weekly |
| Application Code | 10-50 MB | On commit |

**Total**: ~500 MB per full backup

---

## 🔐 Security Best Practices

1. **Encrypt all backups** - Use AES-256 encryption
2. **Test restores quarterly** - Verify backups actually work
3. **Keep 3 copies** - Local, cloud, offline
4. **Automate everything** - Reduce human error
5. **Document procedures** - This file!
6. **Version control** - Keep backup of migration scripts
7. **Access control** - Limit who can restore
8. **Audit logs** - Track all backup/restore operations

---

## 🎯 Quick Reference

### Daily Tasks
- ✅ Automated database backup (via cron)
- ✅ Check backup logs for errors

### Weekly Tasks
- ✅ Verify backup file sizes
- ✅ Test sample restore on staging
- ✅ Refresh product catalog

### Monthly Tasks
- ✅ Full recovery test on clean environment
- ✅ Update documentation
- ✅ Review retention policies

### Quarterly Tasks
- ✅ Complete disaster recovery drill
- ✅ Update emergency contacts
- ✅ Archive old backups to cold storage

---

## 📞 Support Resources

- **Supabase Support**: https://supabase.com/dashboard/support
- **PostgreSQL Docs**: https://www.postgresql.org/docs/current/backup.html
- **Appwrite Docs**: https://appwrite.io/docs/storage
- **This System**: See `agent.md` and `CLAUDE.md`

---

**Last Updated**: 2025-01-16
**Next Review**: 2025-04-16
