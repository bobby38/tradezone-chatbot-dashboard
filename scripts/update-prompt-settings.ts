import { createClient } from "@supabase/supabase-js";
import { CHATKIT_DEFAULT_PROMPT } from "../lib/chatkit/defaultPrompt";
import { config } from "dotenv";
import path from "path";

// Load environment variables from .env.local
config({ path: path.join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DEFAULT_ORG_ID = "765e1172-b666-471f-9b42-f80c9b5006de";

async function updatePromptSettings() {
  console.log("[UpdatePrompt] Starting prompt sync to database...");
  console.log(`[UpdatePrompt] Target organization ID: ${DEFAULT_ORG_ID}`);

  // Get the organization settings
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, settings")
    .eq("id", DEFAULT_ORG_ID)
    .single();

  if (orgError) {
    console.error("[UpdatePrompt] Failed to fetch organization:", orgError);
    process.exit(1);
  }

  console.log(`[UpdatePrompt] Found organization: ${org.id}`);

  // Update the settings with the new prompt
  const updatedSettings = {
    ...org.settings,
    chatkit: {
      ...(org.settings?.chatkit || {}),
      systemPrompt: CHATKIT_DEFAULT_PROMPT,
    },
  };

  const { error: updateError } = await supabase
    .from("organizations")
    .update({ settings: updatedSettings })
    .eq("id", org.id);

  if (updateError) {
    console.error("[UpdatePrompt] Failed to update settings:", updateError);
    process.exit(1);
  }

  console.log("[UpdatePrompt] ✅ Prompt successfully synced to database!");
  console.log("[UpdatePrompt] Changes include:");
  console.log("  - 🚨 Emoji markers for critical sections");
  console.log("  - ❌ WRONG examples for contact collection");
  console.log("  - ✅ CORRECT examples with step-by-step breakdown");
  console.log("  - One-at-a-time contact collection enforcement");
}

updatePromptSettings();
