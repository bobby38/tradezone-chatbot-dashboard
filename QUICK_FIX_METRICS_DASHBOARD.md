# Quick Fix: Metrics Dashboard Implementation
**Goal:** Display service metrics in the Grafana/Graphiti dashboard  
**Time:** ~30 minutes  
**Approach:** Custom metrics API (no external dependencies)

---

## The Problem
Your Grafana dashboard at `genuine-rebirth/production` shows **"No service metrics in this environment"** because:
- Dashboard expects time-series metrics (request counts, response times, errors)
- Graphiti stores conversational knowledge graph data (facts, entities)
- No metrics exporter is currently configured

---

## The Solution: Custom Metrics Endpoint

### Step 1: Create Metrics API Endpoint

Create file `app/api/metrics/summary/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const timeRange = req.nextUrl.searchParams.get('hours') || '24';
    const hoursAgo = parseInt(timeRange);
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

    // Query chat_usage_metrics table
    const { data: usageData, error: usageError } = await supabase
      .from('chat_usage_metrics')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (usageError) throw usageError;

    // Query chat_logs for total conversations
    const { data: chatData, error: chatError } = await supabase
      .from('chat_logs')
      .select('session_id, created_at')
      .gte('created_at', since);

    if (chatError) throw chatError;

    // Calculate metrics
    const totalRequests = usageData?.length || 0;
    const totalTokens = usageData?.reduce((sum, r) => sum + (r.total_tokens || 0), 0) || 0;
    const totalCost = usageData?.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0) || 0;
    const avgResponseTime = totalRequests > 0
      ? usageData?.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / totalRequests
      : 0;
    const errorCount = usageData?.filter(r => r.error).length || 0;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    // Unique sessions
    const uniqueSessions = new Set(chatData?.map(c => c.session_id) || []).size;

    // Success metrics
    const successCount = totalRequests - errorCount;
    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100;

    const metrics = {
      // Time range
      time_range_hours: hoursAgo,
      timestamp: new Date().toISOString(),
      
      // Request metrics
      requests_total: totalRequests,
      requests_success: successCount,
      requests_error: errorCount,
      
      // Performance metrics
      avg_response_time_ms: Math.round(avgResponseTime),
      success_rate_percent: Math.round(successRate * 100) / 100,
      error_rate_percent: Math.round(errorRate * 100) / 100,
      
      // Usage metrics
      tokens_total: totalTokens,
      cost_total_usd: Math.round(totalCost * 10000) / 10000,
      
      // Session metrics
      unique_sessions: uniqueSessions,
      messages_total: chatData?.length || 0,
      
      // Calculated rates
      requests_per_hour: Math.round((totalRequests / hoursAgo) * 100) / 100,
      tokens_per_request: totalRequests > 0 
        ? Math.round((totalTokens / totalRequests) * 100) / 100 
        : 0,
      
      // Health status
      status: errorRate < 5 ? 'healthy' : errorRate < 20 ? 'degraded' : 'unhealthy'
    };

    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('[Metrics API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
```

---

### Step 2: Create Time-Series Metrics Endpoint

Create file `app/api/metrics/timeseries/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const hours = parseInt(req.nextUrl.searchParams.get('hours') || '24');
    const interval = parseInt(req.nextUrl.searchParams.get('interval') || '60'); // minutes
    
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('chat_usage_metrics')
      .select('created_at, total_tokens, total_cost_usd, error, response_time_ms')
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Group by time buckets
    const buckets: Record<string, {
      timestamp: string;
      requests: number;
      errors: number;
      tokens: number;
      cost: number;
      response_times: number[];
    }> = {};

    data?.forEach(row => {
      const timestamp = new Date(row.created_at);
      const bucketTime = new Date(
        Math.floor(timestamp.getTime() / (interval * 60 * 1000)) * (interval * 60 * 1000)
      );
      const key = bucketTime.toISOString();

      if (!buckets[key]) {
        buckets[key] = {
          timestamp: key,
          requests: 0,
          errors: 0,
          tokens: 0,
          cost: 0,
          response_times: []
        };
      }

      buckets[key].requests++;
      if (row.error) buckets[key].errors++;
      buckets[key].tokens += row.total_tokens || 0;
      buckets[key].cost += row.total_cost_usd || 0;
      if (row.response_time_ms) {
        buckets[key].response_times.push(row.response_time_ms);
      }
    });

    // Convert to array and calculate averages
    const timeseries = Object.values(buckets).map(bucket => ({
      timestamp: bucket.timestamp,
      requests: bucket.requests,
      errors: bucket.errors,
      error_rate: bucket.requests > 0 ? (bucket.errors / bucket.requests) * 100 : 0,
      tokens: bucket.tokens,
      cost: Math.round(bucket.cost * 10000) / 10000,
      avg_response_time_ms: bucket.response_times.length > 0
        ? Math.round(bucket.response_times.reduce((a, b) => a + b, 0) / bucket.response_times.length)
        : 0,
      p95_response_time_ms: bucket.response_times.length > 0
        ? Math.round(bucket.response_times.sort((a, b) => a - b)[Math.floor(bucket.response_times.length * 0.95)])
        : 0
    })).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({
      interval_minutes: interval,
      time_range_hours: hours,
      data_points: timeseries.length,
      timeseries
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('[Metrics Timeseries API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timeseries', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
```

---

### Step 3: Create Prometheus-Compatible Metrics Endpoint

Create file `app/api/metrics/prometheus/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Last 5 minutes for real-time metrics
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('chat_usage_metrics')
      .select('*')
      .gte('created_at', since);

    if (error) throw error;

    const totalRequests = data?.length || 0;
    const totalErrors = data?.filter(r => r.error).length || 0;
    const totalTokens = data?.reduce((sum, r) => sum + (r.total_tokens || 0), 0) || 0;
    const totalCost = data?.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0) || 0;
    const avgResponseTime = totalRequests > 0
      ? data?.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / totalRequests
      : 0;

    // Prometheus exposition format
    const metrics = `# HELP chatkit_requests_total Total number of ChatKit requests
# TYPE chatkit_requests_total counter
chatkit_requests_total ${totalRequests}

# HELP chatkit_errors_total Total number of ChatKit errors
# TYPE chatkit_errors_total counter
chatkit_errors_total ${totalErrors}

# HELP chatkit_tokens_total Total tokens consumed
# TYPE chatkit_tokens_total counter
chatkit_tokens_total ${totalTokens}

# HELP chatkit_cost_usd_total Total cost in USD
# TYPE chatkit_cost_usd_total counter
chatkit_cost_usd_total ${totalCost.toFixed(6)}

# HELP chatkit_response_time_ms Average response time in milliseconds
# TYPE chatkit_response_time_ms gauge
chatkit_response_time_ms ${avgResponseTime.toFixed(2)}

# HELP chatkit_error_rate Error rate percentage
# TYPE chatkit_error_rate gauge
chatkit_error_rate ${totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0'}
`;

    return new Response(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('[Prometheus Metrics] Error:', error);
    return new Response('# Error fetching metrics\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
```

---

## Step 4: Configure Grafana Dashboard

### Option A: JSON API Data Source
1. In Grafana, add a new **JSON API** data source
2. URL: `https://trade.rezult.co/api/metrics/summary`
3. Create dashboard panels:
   - **Requests per Hour:** `$.requests_per_hour`
   - **Error Rate:** `$.error_rate_percent`
   - **Avg Response Time:** `$.avg_response_time_ms`
   - **Total Cost:** `$.cost_total_usd`

### Option B: Prometheus Data Source
1. Add **Prometheus** data source
2. URL: `https://trade.rezult.co/api/metrics/prometheus`
3. Scrape interval: 15s
4. Query examples:
   - Requests: `chatkit_requests_total`
   - Error rate: `chatkit_error_rate`
   - Response time: `chatkit_response_time_ms`

---

## Step 5: Test the Endpoints

```bash
# Summary metrics (last 24 hours)
curl https://trade.rezult.co/api/metrics/summary

# Summary for custom time range
curl https://trade.rezult.co/api/metrics/summary?hours=6

# Time-series data (hourly buckets)
curl https://trade.rezult.co/api/metrics/timeseries?hours=24&interval=60

# Prometheus format
curl https://trade.rezult.co/api/metrics/prometheus
```

**Expected Response (summary):**
```json
{
  "time_range_hours": 24,
  "timestamp": "2026-01-04T11:30:00.000Z",
  "requests_total": 450,
  "requests_success": 445,
  "requests_error": 5,
  "avg_response_time_ms": 842,
  "success_rate_percent": 98.89,
  "error_rate_percent": 1.11,
  "tokens_total": 225000,
  "cost_total_usd": 0.1125,
  "unique_sessions": 85,
  "messages_total": 1200,
  "requests_per_hour": 18.75,
  "tokens_per_request": 500,
  "status": "healthy"
}
```

---

## Step 6: Update Dashboard Configuration

If your Grafana dashboard is defined in code, update the panel queries:

```json
{
  "panels": [
    {
      "title": "Requests per Hour",
      "targets": [{
        "expr": "chatkit_requests_total",
        "legendFormat": "Requests"
      }]
    },
    {
      "title": "Error Rate",
      "targets": [{
        "expr": "chatkit_error_rate",
        "legendFormat": "Error %"
      }]
    },
    {
      "title": "Response Time (ms)",
      "targets": [{
        "expr": "chatkit_response_time_ms",
        "legendFormat": "Avg Response Time"
      }]
    }
  ]
}
```

---

## Verification Checklist

- [ ] Created `/api/metrics/summary/route.ts`
- [ ] Created `/api/metrics/timeseries/route.ts`
- [ ] Created `/api/metrics/prometheus/route.ts`
- [ ] Tested endpoints return data
- [ ] Configured Grafana data source
- [ ] Dashboard shows metrics (no more "No service metrics")
- [ ] Metrics update in real-time (refresh every 15-60 seconds)

---

## Troubleshooting

### "No data" in Grafana
- Check endpoint returns JSON: `curl https://trade.rezult.co/api/metrics/summary`
- Verify Supabase `chat_usage_metrics` table has data
- Check Grafana data source URL is correct
- Look at Grafana query inspector for errors

### Metrics are zero
- Ensure ChatKit agent is logging to `chat_usage_metrics` table
- Check `logUsage()` function in `lib/security/monitoring.ts` is being called
- Verify table has recent records (last 24 hours)

### Slow response times
- Add database index on `created_at` column:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_chat_usage_created_at 
  ON chat_usage_metrics(created_at DESC);
  ```

---

## Next Steps

After the dashboard is working:

1. **Add alerting** for error rate > 5%
2. **Set up budget alerts** when daily cost > $8
3. **Create custom panels** for:
   - Top error types
   - Slowest endpoints
   - Token usage by model
   - Cost per session

4. **Optional enhancements:**
   - Add OpenTelemetry for distributed tracing
   - Export metrics to DataDog/New Relic
   - Real-time WebSocket metrics streaming

---

## Summary

This quick fix provides **production-ready service metrics** without external dependencies:
- ✅ Works with existing Supabase data
- ✅ Prometheus-compatible format
- ✅ Time-series support for graphs
- ✅ ~30 minutes to implement
- ✅ No new infrastructure required

Your Grafana dashboard will show real metrics instead of "No service metrics in this environment"!
