import { CHATKIT_DEFAULT_PROMPT } from "../lib/chatkit/defaultPrompt";
import { config } from "dotenv";
import path from "path";

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), ".env.local") });

const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost')
  ? 'http://localhost:3001'
  : 'https://trade.rezult.co';

async function updatePrompt() {
  console.log("[UpdatePrompt] Starting prompt sync via API...");
  console.log(`[UpdatePrompt] Target API: ${API_URL}`);

  try {
    // Use the POST endpoint to update the system prompt
    const response = await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        settingType: 'chatkit',
        settingKey: 'systemPrompt',
        settingValue: CHATKIT_DEFAULT_PROMPT,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API request failed (${response.status}): ${error}`);
    }

    const result = await response.json();
    console.log("[UpdatePrompt] ✅ Prompt successfully synced to database!");
    console.log("[UpdatePrompt] Response:", JSON.stringify(result, null, 2));
    console.log("\n[UpdatePrompt] Changes include:");
    console.log("  - 🚨 Emoji markers for critical sections");
    console.log("  - ❌ WRONG examples for contact collection");
    console.log("  - ✅ CORRECT examples with step-by-step breakdown");
    console.log("  - One-at-a-time contact collection enforcement");
    console.log("\n[UpdatePrompt] Coolify will auto-deploy. Wait 1-2 minutes then test.");
  } catch (error) {
    console.error("[UpdatePrompt] Failed:", error);
    process.exit(1);
  }
}

updatePrompt();
