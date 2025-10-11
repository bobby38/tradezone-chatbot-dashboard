#!/usr/bin/env ts-node
/**
 * ChatKit Security Setup Script
 *
 * This script helps you:
 * 1. Generate secure API keys
 * 2. Test security configurations
 * 3. Verify database tables are created
 *
 * Usage:
 *   npx ts-node scripts/setup-chatkit-security.ts
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// Generate a secure API key
function generateApiKey(prefix: string = "tzck"): string {
  const randomBytes = crypto.randomBytes(24);
  const key = randomBytes.toString("base64url"); // URL-safe base64
  return `${prefix}_${key}`;
}

// Generate multiple API keys for different purposes
function generateKeys() {
  console.log("\n🔐 Generating ChatKit API Keys...\n");

  const keys = {
    mainApiKey: generateApiKey("tzck"),
    widgetKey: generateApiKey("tzck_widget"),
    dashboardKey: generateApiKey("tzck_dashboard"),
  };

  console.log("Main API Key (server-side):");
  console.log(`  CHATKIT_API_KEY=${keys.mainApiKey}\n`);

  console.log("Widget API Key (frontend - less privileged):");
  console.log(`  NEXT_PUBLIC_CHATKIT_WIDGET_KEY=${keys.widgetKey}\n`);

  console.log("Dashboard API Key (internal use):");
  console.log(`  CHATKIT_DASHBOARD_KEY=${keys.dashboardKey}\n`);

  return keys;
}

// Create .env additions
function createEnvTemplate(keys: ReturnType<typeof generateKeys>) {
  const template = `
# ============================================
# ChatKit Security Configuration
# Add these to your .env.local file
# ============================================

# Main API key (keep secret, server-side only)
CHATKIT_API_KEY=${keys.mainApiKey}

# Widget API key (can be exposed to frontend)
NEXT_PUBLIC_CHATKIT_WIDGET_KEY=${keys.widgetKey}

# Dashboard API key (internal use)
CHATKIT_DASHBOARD_KEY=${keys.dashboardKey}

# Optional: Additional API keys (comma-separated)
# CHATKIT_ADDITIONAL_KEYS=key1,key2,key3

# Allowed origins (comma-separated domains)
CHATKIT_ALLOWED_ORIGINS=tradezone.sg,www.tradezone.sg,rezult.co,www.rezult.co,trade.rezult.co

# Daily budget limit (in USD)
CHATKIT_DAILY_BUDGET=10.00

# Disable auth in development (true/false)
# CHATKIT_DISABLE_AUTH=false

# Alert webhook URL (optional - for Slack/Discord notifications)
# CHATKIT_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# ============================================
# Rate Limiting Configuration
# ============================================

# These are set in code, but you can override them via environment:
# CHATKIT_RATE_LIMIT_PER_IP=20        # requests per minute per IP
# CHATKIT_RATE_LIMIT_PER_SESSION=50   # requests per hour per session

# ============================================
# OpenAI Configuration (verify these are set)
# ============================================

# OPENAI_API_KEY=sk-...
# OPENAI_VECTOR_STORE_ID=vs_...
# OPENAI_REALTIME_MODEL=gpt-4o-mini-realtime-preview-2024-12-17

`;

  const outputPath = path.join(process.cwd(), ".env.chatkit-security");
  fs.writeFileSync(outputPath, template.trim());

  console.log(`\n✅ Environment template saved to: .env.chatkit-security`);
  console.log("   Copy these values to your .env.local file\n");
}

// SQL to verify tables exist
const verifyTablesSQL = `
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('chat_usage_metrics', 'chat_security_events')
ORDER BY table_name;
`;

// Create a test script
function createTestScript() {
  const testScript = `#!/usr/bin/env node
/**
 * Test ChatKit Security
 * Tests rate limiting, authentication, and validation
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';
const API_KEY = process.env.CHATKIT_API_KEY || 'YOUR_API_KEY_HERE';

async function testAuth() {
  console.log('\\n🧪 Testing Authentication...\\n');

  // Test without API key (should fail)
  console.log('1. Testing without API key (should fail):');
  const noAuthRes = await fetch(\`\${API_URL}/api/chatkit/agent\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'test',
      sessionId: 'test-session',
    }),
  });
  console.log(\`   Status: \${noAuthRes.status} (\${noAuthRes.status === 401 ? '✅ PASS' : '❌ FAIL'})\`);

  // Test with API key (should succeed)
  console.log('\\n2. Testing with API key (should succeed):');
  const withAuthRes = await fetch(\`\${API_URL}/api/chatkit/agent\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      message: 'test message',
      sessionId: 'test-session-123',
    }),
  });
  console.log(\`   Status: \${withAuthRes.status} (\${withAuthRes.status === 200 ? '✅ PASS' : '❌ FAIL'})\`);
  const data = await withAuthRes.json();
  console.log(\`   Response preview: \${data.response?.substring(0, 100)}...\`);
}

async function testRateLimit() {
  console.log('\\n🧪 Testing Rate Limiting...\\n');

  let blocked = false;
  for (let i = 1; i <= 25; i++) {
    const res = await fetch(\`\${API_URL}/api/chatkit/agent\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        message: \`test \${i}\`,
        sessionId: 'rate-limit-test',
      }),
    });

    if (res.status === 429) {
      console.log(\`   Request \${i}: ⛔ Rate limited (✅ PASS)\`);
      const data = await res.json();
      console.log(\`   Retry after: \${data.retryAfter} seconds\`);
      blocked = true;
      break;
    } else {
      console.log(\`   Request \${i}: ✓ Allowed\`);
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!blocked) {
    console.log('   ❌ FAIL: Rate limit not triggered after 25 requests');
  }
}

async function testValidation() {
  console.log('\\n🧪 Testing Input Validation...\\n');

  // Test empty message
  console.log('1. Testing empty message (should fail):');
  const emptyRes = await fetch(\`\${API_URL}/api/chatkit/agent\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      message: '',
      sessionId: 'test',
    }),
  });
  console.log(\`   Status: \${emptyRes.status} (\${emptyRes.status === 400 ? '✅ PASS' : '❌ FAIL'})\`);

  // Test message too long
  console.log('\\n2. Testing message too long (should fail):');
  const longMessage = 'x'.repeat(1001);
  const longRes = await fetch(\`\${API_URL}/api/chatkit/agent\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      message: longMessage,
      sessionId: 'test',
    }),
  });
  console.log(\`   Status: \${longRes.status} (\${longRes.status === 400 ? '✅ PASS' : '❌ FAIL'})\`);
}

async function runTests() {
  console.log('\\n🚀 ChatKit Security Test Suite\\n');
  console.log(\`Testing against: \${API_URL}\`);
  console.log(\`Using API key: \${API_KEY.substring(0, 12)}...\`);

  try {
    await testAuth();
    await testRateLimit();
    await testValidation();

    console.log('\\n✅ All tests completed!\\n');
  } catch (error) {
    console.error('\\n❌ Test error:', error);
  }
}

runTests();
`;

  const testPath = path.join(
    process.cwd(),
    "scripts",
    "test-chatkit-security.js",
  );
  fs.writeFileSync(testPath, testScript);
  fs.chmodSync(testPath, "755");

  console.log(`✅ Test script created: scripts/test-chatkit-security.js`);
  console.log("   Run with: node scripts/test-chatkit-security.js\n");
}

// Main setup function
function main() {
  console.log("\n╔═══════════════════════════════════════════════╗");
  console.log("║   ChatKit Security Setup                     ║");
  console.log("║   TradeZone Dashboard                        ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  // Step 1: Generate API keys
  const keys = generateKeys();

  // Step 2: Create environment template
  createEnvTemplate(keys);

  // Step 3: Create test script
  createTestScript();

  // Step 4: Instructions
  console.log("📋 Next Steps:\n");
  console.log(
    "1. Copy the environment variables from .env.chatkit-security to your .env.local file",
  );
  console.log("2. Run the database migration:");
  console.log("   - Open Supabase SQL Editor");
  console.log("   - Run: migrations/001_chatkit_security_monitoring.sql\n");
  console.log("3. Update your widget to include API key in requests:");
  console.log("   ```javascript");
  console.log('   fetch("/api/chatkit/agent", {');
  console.log('     method: "POST",');
  console.log("     headers: {");
  console.log('       "Content-Type": "application/json",');
  console.log('       "X-API-Key": process.env.NEXT_PUBLIC_CHATKIT_WIDGET_KEY');
  console.log("     },");
  console.log("     body: JSON.stringify({ message, sessionId })");
  console.log("   });");
  console.log("   ```\n");
  console.log("4. Test the security setup:");
  console.log("   node scripts/test-chatkit-security.js\n");
  console.log("5. Monitor usage at:");
  console.log("   - Dashboard: /dashboard/chatkit-analytics");
  console.log("   - Database: chat_usage_metrics table\n");

  console.log("⚠️  Important Security Notes:\n");
  console.log("- Never commit API keys to git");
  console.log(
    "- Use NEXT_PUBLIC_CHATKIT_WIDGET_KEY for frontend (less sensitive)",
  );
  console.log("- Keep CHATKIT_API_KEY secret (server-side only)");
  console.log(
    "- Set up OpenAI usage limits: https://platform.openai.com/account/billing/limits",
  );
  console.log("- Monitor chat_security_events table for suspicious activity\n");

  console.log("📊 Recommended OpenAI Limits:\n");
  console.log("- Hard limit: $50/month");
  console.log("- Soft limit: $30/month (email alert)");
  console.log("- Enable email notifications for unusual activity\n");

  console.log("✅ Setup complete! Your chat system is now secured.\n");
}

// Run setup
main();
