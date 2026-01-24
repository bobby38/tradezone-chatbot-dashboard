# Graphiti Knowledge Graph Status Report
**Date:** 2026-01-04  
**Environment:** Production (Railway)  
**Dashboard Issue:** "No service metrics in this environment"

---

## Executive Summary

**Graphiti is WORKING** ✅ - The issue is a **dashboard misconfiguration**, not a system failure.

The Grafana/Graphiti dashboard is configured to display **service-level observability metrics** (request rates, latency, errors), but Graphiti stores **conversational knowledge graph data** (facts, entities, relationships). These are two different types of metrics that require different visualization approaches.

---

## System Status

### ✅ Graphiti API (Railway Production)
- **URL:** `https://graphiti-production-334e.up.railway.app`
- **Status:** Online and responsive
- **Authentication:** Working (x-api-key header)
- **Group ID:** `tradezone-main`

### ✅ Data Ingestion Pipeline
1. **ChatKit Agent Integration** - ACTIVE
   - File: `app/api/chatkit/agent/route.ts:6171`
   - Function: `addGraphitiMemoryTurn(sessionId, message, finalResponse, metadata)`
   - Enriches content with entities: `[preference:PlayStation]`, `[budget:$XXX]`, `[intent:trade-in]`

2. **Catalog Sync** - RECENTLY EXECUTED
   - Script: `npm run catalog:sync-graphiti`
   - Last Run: 2026-01-04 (just completed)
   - Records Synced: **1,024 messages** (41 batches of 25)
   - Content: 11 product families, 94 trade grid entries

### ✅ Knowledge Graph Data
**Sample Facts Found:**
```json
[
  {
    "uuid": "bb8545c4-cc50-40eb-a441-54ec35354548",
    "name": "IS_CONCERNED_WITH_PRICE",
    "fact": "Customer(user) asks which PS5 is not that expensive",
    "valid_at": "2025-11-28T14:07:58+00:00"
  },
  {
    "uuid": "961000fb-299e-4e86-83d6-9ec679099597",
    "name": "HAS_PRICE",
    "fact": "The PS5 is S$800",
    "valid_at": "2026-01-02T16:27:21+00:00"
  },
  {
    "uuid": "483db459-99ec-402b-99bb-41004d72a4bf",
    "name": "INTERESTED_IN",
    "fact": "Customer is interested in PS5 games",
    "valid_at": "2025-12-04T15:45:31+00:00"
  }
]
```

**Fact Types Detected:**
- `IS_CONCERNED_WITH_PRICE` - Budget/price sensitivity
- `HAS_PRICE` - Product pricing information
- `INTERESTED_IN` - Product category preferences
- More facts likely exist for trade-ins, customer preferences, etc.

---

## The Dashboard Issue Explained

### What the Dashboard Expects:
The Grafana dashboard at `genuine-rebirth/production` is looking for **service metrics** like:
- HTTP request count per minute
- Average response time (p50, p95, p99)
- Error rate percentage
- Active connections
- Memory/CPU usage

These are **operational metrics** typically sent via:
- Prometheus exporters
- OpenTelemetry instrumentation
- StatsD/DataDog agents
- Custom time-series data

### What Graphiti Actually Provides:
Graphiti is a **knowledge graph database** that stores:
- Conversational facts and entities
- Relationships between concepts
- Temporal validity of information
- Customer preferences and intent

This data is accessed via **search queries**, not time-series metrics.

---

## Current Metrics Infrastructure

### What EXISTS:
1. **ChatKit Telemetry** ✅
   - File: `lib/chatkit/telemetry.ts`
   - Tracks: tool usage, prompts, responses, model info
   - Storage: In-memory buffer (100 entries)
   - Endpoint: `/api/chatkit/telemetry`

2. **Security Monitoring** ✅
   - File: `lib/security/monitoring.ts`
   - Functions:
     - `logUsage()` - Token usage and cost tracking
     - `calculateCost()` - Per-request cost calculation
     - `checkDailyBudget()` - Budget limit enforcement
     - `logSuspiciousActivity()` - Security event logging
   - Database: Supabase tables `chat_usage_metrics`, `chat_security_events`

3. **Supabase Analytics** ✅
   - Tables: `chat_logs`, `chat_sessions`, `chat_usage_metrics`
   - Contains: Full chat history, session data, token usage

### What's MISSING (for Grafana dashboard):
- **Time-series metrics exporter** (Prometheus/OpenTelemetry)
- **Metrics collection endpoint** for Grafana to scrape
- **Service health instrumentation** (request counts, latencies)

---

## Recommended Solutions

### Option 1: Add OpenTelemetry Instrumentation (Proper Observability)
**Best for:** Production-grade monitoring and debugging

**Implementation:**
```bash
npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-prometheus
```

Create `lib/observability/metrics.ts`:
```typescript
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

const exporter = new PrometheusExporter({ port: 9464 });
const meterProvider = new MeterProvider();
meterProvider.addMetricReader(exporter);

export const meter = meterProvider.getMeter('tradezone-chatbot');

// Counters
export const requestCounter = meter.createCounter('http_requests_total');
export const errorCounter = meter.createCounter('http_errors_total');

// Histograms
export const responseTimeHistogram = meter.createHistogram('http_response_time_ms');
export const tokenUsageHistogram = meter.createHistogram('chatkit_tokens_used');
```

Update ChatKit agent to record metrics:
```typescript
const startTime = Date.now();
requestCounter.add(1, { endpoint: '/api/chatkit/agent', method: 'POST' });

// ... process request ...

responseTimeHistogram.record(Date.now() - startTime, { 
  endpoint: '/api/chatkit/agent',
  status: 200 
});
tokenUsageHistogram.record(totalTokens, { model: 'gpt-4.1-mini' });
```

**Grafana Configuration:**
- Add Prometheus data source: `http://localhost:9464/metrics`
- Query: `rate(http_requests_total[5m])`

---

### Option 2: Custom Metrics API (Quick Fix)
**Best for:** Immediate dashboard population without external dependencies

Create `/api/metrics/summary` endpoint:
```typescript
export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Aggregate from chat_usage_metrics table
  const { data, error } = await supabase
    .from('chat_usage_metrics')
    .select('*')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const metrics = {
    requests_total: data?.length || 0,
    tokens_used: data?.reduce((sum, r) => sum + (r.total_tokens || 0), 0) || 0,
    avg_response_time_ms: data?.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / (data?.length || 1),
    error_count: data?.filter(r => r.error).length || 0,
    timestamp: new Date().toISOString()
  };

  return NextResponse.json(metrics);
}
```

**Dashboard Update:**
Configure Grafana to use JSON API data source pointing to `/api/metrics/summary`.

---

### Option 3: Graphiti-Specific Dashboard (Knowledge Graph Viz)
**Best for:** Visualizing conversational insights and customer intelligence

Create dedicated Graphiti metrics:
- **Top customer intents** (trade-in, purchase, support)
- **Product interest trends** (PS5, Xbox, Switch mentions over time)
- **Budget distribution** (how many customers have budget constraints)
- **Fact growth rate** (knowledge graph expansion)

Example query endpoint `/api/graphiti/insights`:
```typescript
const insights = {
  total_facts: await graphitiSearch({ query: "*", max_facts: 1000 }),
  trade_in_intent: await graphitiSearch({ query: "trade-in", max_facts: 100 }),
  budget_sensitive: await graphitiSearch({ query: "budget price cheap", max_facts: 50 }),
  ps5_interest: await graphitiSearch({ query: "PS5 PlayStation", max_facts: 100 })
};
```

---

## Immediate Action Items

### High Priority (Fix Dashboard Display)
1. ✅ **Verified Graphiti is working** - No action needed
2. **Choose monitoring approach:**
   - [ ] Option 1: OpenTelemetry (recommended for production)
   - [ ] Option 2: Custom metrics API (faster deployment)
   - [ ] Option 3: Graphiti-specific dashboard (conversational insights)

### Medium Priority (Optimize Existing)
3. **Enhanced logging** in ChatKit agent:
   ```typescript
   console.log('[Graphiti] Stored conversation turn', {
     sessionId,
     messageLength: message.length,
     factsCreated: '(check via search API)',
     timestamp: new Date().toISOString()
   });
   ```

4. **Graphiti health check** endpoint:
   ```typescript
   // GET /api/graphiti/health
   const isHealthy = await fetch(GRAPHITI_BASE_URL + '/health').then(r => r.ok);
   ```

### Low Priority (Future Enhancement)
5. **Automated catalog sync** - Schedule `npm run catalog:sync-graphiti` daily
6. **Fact pruning** - Archive or expire old facts to prevent knowledge drift
7. **Graph visualization UI** - Build custom dashboard to explore knowledge graph

---

## Verification Commands

### Check Graphiti API Health
```bash
curl -X GET "https://graphiti-production-334e.up.railway.app/health" \
  -H "x-api-key: ADs@p39v!k"
```

### Search for Customer Conversations
```bash
curl -X POST "https://graphiti-production-334e.up.railway.app/search" \
  -H "x-api-key: ADs@p39v!k" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "customer trade-in PS5 PS4",
    "max_facts": 10
  }'
```

### Sync Catalog Data
```bash
cd /Users/bobbymini/Documents/tradezone-chatbot-dashboard
npm run catalog:sync-graphiti
```

### Check Supabase Metrics
```bash
# Query chat_usage_metrics table
curl "https://jvkmxtbckpfwypnbubdy.supabase.co/rest/v1/chat_usage_metrics?select=*&order=created_at.desc&limit=10" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

---

## Conclusion

**Graphiti is NOT broken** - it's collecting and processing conversational data as designed. The dashboard shows "No service metrics" because it's configured for operational monitoring (request rates, latency), not knowledge graph analytics.

**Recommended Next Step:**
Implement **Option 1 (OpenTelemetry)** for proper production observability, or **Option 2 (Custom Metrics API)** for a quick dashboard fix. Both approaches can coexist with the existing Graphiti knowledge graph.

---

## Technical Details

**Environment Variables:**
```bash
GRAPHTI_BASE_URL=https://graphiti-production-334e.up.railway.app
GRAPHTI_API_KEY=ADs@p39v!k
GRAPHTI_DEFAULT_GROUP_ID=tradezone-main
```

**Key Files:**
- Graphiti client: `lib/graphiti.ts`
- ChatKit integration: `app/api/chatkit/agent/route.ts:6171`
- Catalog sync: `scripts/sync-graphiti-graph.ts`
- Telemetry: `lib/chatkit/telemetry.ts`
- Security monitoring: `lib/security/monitoring.ts`

**Database Tables (Supabase):**
- `chat_logs` - Full conversation history
- `chat_sessions` - Session metadata
- `chat_usage_metrics` - Token usage and costs (NEW)
- `chat_security_events` - Rate limits and auth failures (NEW)
