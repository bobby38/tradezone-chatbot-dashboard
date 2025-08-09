# Search Console to Supabase Sync Process

This document outlines the workflow for syncing Google Search Console data to Supabase for the TradeZone Chatbot Dashboard.

## Overview

The system uses a local-only sync process where:

1. The weekly sync script runs locally to fetch data from Google Search Console
2. The script populates the Supabase database with this data
3. The production app fetches Search Console data exclusively from Supabase via the API route

## Local Sync Setup

### Prerequisites

- Node.js 18+ installed locally
- Google Search Console service account with proper permissions
- Supabase project with required tables and credentials

### Environment Configuration

Two environment files are used:

1. `.env.local` - For local development
2. `.env.sc` - For the sync script

Required variables in `.env.sc`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SC_SITE=sc-domain:tradezone.sg
```

### Authentication Methods

The sync script supports two authentication methods:

1. **Service Account (Recommended)**
   - Place the service account JSON file at the project root
   - The script will automatically read this file

2. **OAuth (Alternative)**
   - Set `GOOGLE_OAUTH_CLIENT_KEY` and `GOOGLE_OAUTH_REFRESH_TOKEN` in `.env.sc`

## Running the Sync

Use the helper script to run the sync process:

```bash
./scripts/run-sc-sync.sh
```

This script:
- Sources environment variables from `.env.sc`
- Reads the service account key file
- Runs the Node.js script to fetch data and populate Supabase
- Fetches the last 35 days of data to ensure no gaps

## Production Setup

The production app is configured to:
- Fetch Search Console data exclusively from Supabase
- Use the `/api/sc/supabase` API route
- Not require direct Google Search Console API access

## Scheduled Execution

The sync script is scheduled to run weekly using launchd:
- Configuration file: `com.tradezone.sc-weekly.plist`
- Schedule: Weekly on Saturday at 2:15 AM
- This ensures the Supabase database is regularly updated with fresh data

## Troubleshooting

If the sync fails:

1. Check that all required environment variables are set in `.env.sc`
2. Verify the service account key file exists and has proper permissions
3. Ensure the service account has access to the Search Console property
4. Check the Supabase connection and credentials

## Data Flow

```
Google Search Console API → Local Sync Script → Supabase Database → Production App
```

This workflow ensures reliable data access without exposing production to API quota limits or authentication issues.
