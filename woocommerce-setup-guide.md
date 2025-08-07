# WooCommerce Integration Setup Guide

## 🚀 Quick Setup

### 1. Generate WooCommerce API Keys

1. Go to your WooCommerce admin: `https://your-store.com/wp-admin`
2. Navigate to: **WooCommerce > Settings > Advanced > REST API**
3. Click **"Add Key"** or **"Create an API key"**
4. Fill in the details:
   - **Description**: `TradeZone Dashboard`
   - **User**: Select an admin user
   - **Permissions**: `Read/Write` (recommended) or `Read` (minimum)
5. Click **"Generate API Key"**
6. Copy the **Consumer Key** and **Consumer Secret**

### 2. Add Environment Variables

Add these to your `.env.local` file:

```bash
# WooCommerce REST API Configuration
WC_SITE=https://your-store.com
WC_KEY=ck_your_consumer_key_here
WC_SECRET=cs_your_consumer_secret_here
```

### 3. Create Supabase Tables

Run the SQL script in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of create-wc-snapshots.sql
```

### 4. Test the Integration

1. **Manual Test**: Visit `http://localhost:3000/api/woocommerce` to fetch data manually
2. **Dashboard View**: Check `http://localhost:3000/dashboard` to see the Store Analytics section

## 📊 What You'll See

### Dashboard Widgets
- **Orders Today**: Total orders placed today
- **Total Sales**: Today's revenue in SGD
- **Completed Orders**: Successfully processed orders
- **Pending Orders**: Orders awaiting payment

### Top Products Table
- Most popular products by total sales
- Product prices and stock quantities
- Sales rankings

### Order Status Breakdown
- Visual breakdown of order statuses
- Completed, Processing, and Pending counts

## 🔄 Data Refresh

The WooCommerce data can be refreshed:
- **Manually**: Visit `/api/woocommerce` endpoint
- **Automatically**: Set up a cron job to hit the endpoint every 10 minutes
- **Real-time**: Dashboard updates automatically when new data is fetched

## 🛠️ n8n Automation (Optional)

To automate data fetching every 10 minutes:

1. Create a new n8n workflow
2. Add a **Cron Trigger**: `*/10 * * * *` (every 10 minutes)
3. Add an **HTTP Request** node:
   - Method: `GET`
   - URL: `https://your-domain.com/api/woocommerce`
4. Activate the workflow

## 🔧 Troubleshooting

### Common Issues

1. **API Key Errors**
   - Verify your WC_SITE URL (no trailing slash)
   - Check Consumer Key and Secret are correct
   - Ensure API user has proper permissions

2. **No Data Showing**
   - Check if you have orders in WooCommerce
   - Verify the date filtering (only shows today's data)
   - Check browser console for errors

3. **CORS Issues**
   - WooCommerce REST API should work from server-side
   - If issues persist, check WooCommerce CORS settings

### Testing Commands

```bash
# Test WooCommerce API connection
curl -u "ck_key:cs_secret" https://your-store.com/wp-json/wc/v3/orders

# Test your endpoint
curl http://localhost:3000/api/woocommerce
```

## 📈 Next Steps

Once WooCommerce is working:
1. Add Google Analytics 4 integration
2. Add Search Console integration  
3. Set up automated email reports
4. Add trend analysis and comparisons

Your WooCommerce integration is now ready to show live sales data on your dashboard! 🎉
