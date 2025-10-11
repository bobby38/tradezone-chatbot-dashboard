/**
 * Usage monitoring and cost tracking for ChatKit
 * Helps detect abuse and manage OpenAI costs
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface UsageMetrics {
  requestId: string;
  sessionId: string;
  endpoint: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  clientIp: string;
  timestamp: string;
}

// OpenAI pricing (as of 2025-01)
const MODEL_PRICING = {
  'gpt-4o': {
    input: 0.0025 / 1000,   // $2.50 per 1M tokens
    output: 0.01 / 1000,    // $10 per 1M tokens
  },
  'gpt-4o-mini': {
    input: 0.00015 / 1000,  // $0.15 per 1M tokens
    output: 0.0006 / 1000,  // $0.60 per 1M tokens
  },
  'gpt-4o-mini-realtime-preview-2024-12-17': {
    input: 0.00015 / 1000,
    output: 0.0006 / 1000,
  },
} as const;

/**
 * Calculate estimated cost for a request
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING] || MODEL_PRICING['gpt-4o-mini'];

  const inputCost = promptTokens * pricing.input;
  const outputCost = completionTokens * pricing.output;

  return inputCost + outputCost;
}

/**
 * Log usage metrics to database
 */
export async function logUsage(metrics: UsageMetrics): Promise<void> {
  try {
    await supabase.from('chat_usage_metrics').insert({
      request_id: metrics.requestId,
      session_id: metrics.sessionId,
      endpoint: metrics.endpoint,
      model: metrics.model,
      prompt_tokens: metrics.promptTokens,
      completion_tokens: metrics.completionTokens,
      total_tokens: metrics.totalTokens,
      estimated_cost: metrics.estimatedCost,
      latency_ms: metrics.latencyMs,
      success: metrics.success,
      error_message: metrics.errorMessage || null,
      client_ip: metrics.clientIp,
      timestamp: metrics.timestamp,
    });
  } catch (error) {
    console.error('[Monitoring] Failed to log usage:', error);
  }
}

/**
 * Check if high usage threshold is exceeded
 */
export function isHighUsage(tokens: number, cost: number): boolean {
  const HIGH_TOKEN_THRESHOLD = 2000;
  const HIGH_COST_THRESHOLD = 0.05; // $0.05 per request

  return tokens > HIGH_TOKEN_THRESHOLD || cost > HIGH_COST_THRESHOLD;
}

/**
 * Log suspicious activity
 */
export async function logSuspiciousActivity(
  type: 'high_usage' | 'repeated_errors' | 'rate_limit_hit' | 'auth_failure',
  details: {
    sessionId?: string;
    clientIp: string;
    endpoint: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  try {
    await supabase.from('chat_security_events').insert({
      event_type: type,
      session_id: details.sessionId || null,
      client_ip: details.clientIp,
      endpoint: details.endpoint,
      metadata: details.metadata || {},
      timestamp: new Date().toISOString(),
    });

    console.warn(`[Security] ${type.toUpperCase()}:`, details);
  } catch (error) {
    console.error('[Monitoring] Failed to log security event:', error);
  }
}

/**
 * Get usage summary for monitoring dashboard
 */
export async function getUsageSummary(
  startDate: string,
  endDate: string
): Promise<{
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
}> {
  try {
    const { data, error } = await supabase
      .from('chat_usage_metrics')
      .select('*')
      .gte('timestamp', startDate)
      .lte('timestamp', endDate);

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        averageLatency: 0,
        errorRate: 0,
      };
    }

    const totalRequests = data.length;
    const totalTokens = data.reduce((sum, m) => sum + m.total_tokens, 0);
    const totalCost = data.reduce((sum, m) => sum + m.estimated_cost, 0);
    const totalLatency = data.reduce((sum, m) => sum + m.latency_ms, 0);
    const errors = data.filter(m => !m.success).length;

    return {
      totalRequests,
      totalTokens,
      totalCost,
      averageLatency: Math.round(totalLatency / totalRequests),
      errorRate: (errors / totalRequests) * 100,
    };
  } catch (error) {
    console.error('[Monitoring] Failed to get usage summary:', error);
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errorRate: 0,
    };
  }
}

/**
 * Check if daily budget is exceeded
 */
export async function checkDailyBudget(): Promise<{
  exceeded: boolean;
  current: number;
  limit: number;
}> {
  const DAILY_BUDGET_LIMIT = parseFloat(process.env.CHATKIT_DAILY_BUDGET || '10'); // $10 default

  const today = new Date().toISOString().split('T')[0];
  const summary = await getUsageSummary(
    `${today}T00:00:00Z`,
    `${today}T23:59:59Z`
  );

  return {
    exceeded: summary.totalCost >= DAILY_BUDGET_LIMIT,
    current: summary.totalCost,
    limit: DAILY_BUDGET_LIMIT,
  };
}

/**
 * Alert webhook for high usage (optional)
 */
export async function sendUsageAlert(
  type: 'budget_exceeded' | 'high_usage' | 'suspicious_activity',
  details: Record<string, any>
): Promise<void> {
  const webhookUrl = process.env.CHATKIT_ALERT_WEBHOOK;

  if (!webhookUrl) {
    console.warn('[Monitoring] Alert webhook not configured, skipping alert');
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        details,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error('[Monitoring] Failed to send alert:', error);
  }
}

/**
 * Create monitoring tables in Supabase (migration helper)
 */
export const MONITORING_TABLES_SQL = `
-- Usage metrics table
CREATE TABLE IF NOT EXISTS chat_usage_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost DECIMAL(10, 6) NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  client_ip TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security events table
CREATE TABLE IF NOT EXISTS chat_security_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT,
  client_ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON chat_usage_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_session ON chat_usage_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_client_ip ON chat_usage_metrics(client_ip);
CREATE INDEX IF NOT EXISTS idx_security_timestamp ON chat_security_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_type ON chat_security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_client_ip ON chat_security_events(client_ip);

-- Enable RLS
ALTER TABLE chat_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_security_events ENABLE ROW LEVEL SECURITY;

-- Policies (allow service role full access)
CREATE POLICY "Service role full access to usage metrics" ON chat_usage_metrics
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access to security events" ON chat_security_events
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
`;
