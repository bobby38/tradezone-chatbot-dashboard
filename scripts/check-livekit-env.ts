import { config } from "dotenv";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const envPath = args[0] || path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
  config({ path: envPath });
  console.log(`Loaded environment from ${envPath}`);
} else {
  config();
  console.warn(
    `Environment file ${envPath} not found. Falling back to process env only.`,
  );
}

const checks: Array<{
  key: string;
  description: string;
  required?: boolean;
  sensitive?: boolean;
}> = [
  {
    key: "LIVEKIT_URL",
    description: "LiveKit server URL",
    required: true,
  },
  {
    key: "LIVEKIT_API_KEY",
    description: "LiveKit API key used by token service",
    required: true,
    sensitive: true,
  },
  {
    key: "LIVEKIT_API_SECRET",
    description: "LiveKit API secret used by token service",
    required: true,
    sensitive: true,
  },
  {
    key: "CHATKIT_API_KEY",
    description: "Shared API key for ChatKit + voice agent",
    required: true,
    sensitive: true,
  },
  {
    key: "NEXT_PUBLIC_API_URL",
    description: "Base URL that the voice agent should call",
  },
  {
    key: "API_BASE_URL",
    description: "Fallback base URL (voice agent)",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    description: "Supabase service role (needed for chat logs)",
    required: true,
    sensitive: true,
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    description: "Supabase URL",
    required: true,
  },
];

const maskValue = (value: string | undefined, sensitive?: boolean) => {
  if (!value) return "<missing>";
  if (!sensitive) return value;
  if (value.length <= 8) return `${value[0]}***${value[value.length - 1]}`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
};

const rows = checks.map((check) => {
  const value = process.env[check.key];
  return {
    Key: check.key,
    Description: check.description,
    Present: Boolean(value),
    Required: Boolean(check.required || false),
    Value: maskValue(value, check.sensitive),
  };
});

console.table(rows);

const missingRequired = rows.filter((row) => row.Required && !row.Present);
if (missingRequired.length) {
  console.error("")
  console.error("Missing required environment variables:");
  missingRequired.forEach((row) => console.error(`- ${row.Key}`));
  process.exitCode = 1;
} else {
  console.log("All required LiveKit/ChatKit env vars are present.");
}
