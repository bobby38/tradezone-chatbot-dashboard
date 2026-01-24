import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("[Settings] Missing Supabase environment variables", {
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseServiceKey),
  });
}

const supabaseClient =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

const FALLBACK_ORG_ID = "765e1172-b666-471f-9b42-f80c9b5006de";

const isValidUuid = (value: string | undefined | null) =>
  Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );

const resolveOrgId = () => {
  const envOrgId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
  if (!envOrgId) {
    return FALLBACK_ORG_ID;
  }

  if (isValidUuid(envOrgId)) {
    return envOrgId;
  }

  console.warn(
    "[Settings] NEXT_PUBLIC_DEFAULT_ORG_ID is not a valid UUID, falling back to default organization",
    { envOrgId },
  );

  return FALLBACK_ORG_ID;
};

const DEFAULT_ORG_ID = resolveOrgId();

const respondSupabaseMissing = () =>
  NextResponse.json(
    { error: "Supabase not configured for settings persistence" },
    { status: 503 },
  );

export async function GET(request: NextRequest) {
  console.log("[Settings] GET request received");
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    if (!supabaseClient) {
      console.error("[Settings] Supabase client not initialized");
      return respondSupabaseMissing();
    }

    console.log("[Settings] Fetching org settings for:", DEFAULT_ORG_ID);

    const { data: org, error } = await supabaseClient
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        console.warn(
          `[Settings] Organization ${DEFAULT_ORG_ID} not found; returning empty settings.`,
        );
        return NextResponse.json({ settings: {} });
      }
      if (error.code === "42P01") {
        console.warn(
          "[Settings] organizations table missing; returning empty settings.",
        );
        return NextResponse.json({
          settings: {},
          source: "fallback_missing_table",
        });
      }

      console.error("[Settings] Load error:", error);
      console.error("[Settings] Error details:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: "Failed to load settings" },
        { status: 500 },
      );
    }

    console.log("[Settings] Settings loaded successfully");
    console.log("[Settings] SMTP config present:", !!org?.settings?.smtp);

    return NextResponse.json({
      settings: org?.settings || {},
      message: "Settings loaded from database",
    });
  } catch (error) {
    console.error("[Settings] GET error:", error);
    console.error(
      "[Settings] Error stack:",
      error instanceof Error ? error.stack : "No stack",
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    if (!supabaseClient) {
      return respondSupabaseMissing();
    }

    const { settingType, settingKey, settingValue } = await request.json();

    if (!settingType || !settingKey || settingValue === undefined) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: settingType, settingKey, settingValue",
        },
        { status: 400 },
      );
    }

    const { data: org, error: fetchError } = await supabaseClient
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("[Settings] Load error:", fetchError);
      return NextResponse.json(
        { error: "Failed to load settings" },
        { status: 500 },
      );
    }

    const currentSettings = org?.settings || {};

    const newSettings = {
      ...currentSettings,
      [settingType]: {
        ...(currentSettings[settingType] || {}),
        [settingKey]: settingValue,
      },
    };

    const { error: upsertError } = await supabaseClient
      .from("organizations")
      .upsert(
        {
          id: DEFAULT_ORG_ID,
          settings: newSettings,
        },
        { onConflict: "id" },
      );

    if (upsertError) {
      console.error("[Settings] Save error:", upsertError);
      return NextResponse.json(
        { error: "Failed to save settings", details: upsertError.message },
        { status: 500 },
      );
    }

    console.log(`[Settings] Saved: ${settingType}.${settingKey}`);

    return NextResponse.json({
      success: true,
      message: "Setting saved to database",
    });
  } catch (error) {
    console.error("[Settings] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  console.log("[Settings] PUT request received - saving all settings");
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    if (!supabaseClient) {
      console.error("[Settings] Supabase client not initialized");
      return respondSupabaseMissing();
    }

    const body = await request.json();
    console.log("[Settings] Request body keys:", Object.keys(body));

    const { settings } = body;

    if (!settings || typeof settings !== "object") {
      console.error("[Settings] Invalid settings object:", settings);
      return NextResponse.json(
        { error: "Invalid settings object" },
        { status: 400 },
      );
    }

    console.log("[Settings] Settings to save:", {
      keys: Object.keys(settings),
      hasSmtp: !!settings.smtp,
      smtpKeys: settings.smtp ? Object.keys(settings.smtp) : [],
    });

    console.log(
      "[Settings] Fetching current settings for org:",
      DEFAULT_ORG_ID,
    );

    const { data: org, error: fetchError } = await supabaseClient
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("[Settings] Load error:", fetchError);
      console.error("[Settings] Error details:", {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
      });
      return NextResponse.json(
        { error: "Failed to load settings" },
        { status: 500 },
      );
    }

    const currentSettings = org?.settings || {};
    const mergedSettings = { ...currentSettings, ...settings };

    console.log("[Settings] Merged settings:", {
      currentKeys: Object.keys(currentSettings),
      newKeys: Object.keys(settings),
      mergedKeys: Object.keys(mergedSettings),
      mergedSmtp: mergedSettings.smtp ? Object.keys(mergedSettings.smtp) : [],
    });

    console.log("[Settings] Upserting to database...");

    const { data: upsertData, error: upsertError } = await supabaseClient
      .from("organizations")
      .upsert(
        {
          id: DEFAULT_ORG_ID,
          settings: mergedSettings,
        },
        { onConflict: "id" },
      )
      .select();

    if (upsertError) {
      console.error("[Settings] Bulk save error:", upsertError);
      console.error("[Settings] Error details:", {
        code: upsertError.code,
        message: upsertError.message,
        details: upsertError.details,
        hint: upsertError.hint,
      });
      return NextResponse.json(
        { error: "Failed to save settings", details: upsertError.message },
        { status: 500 },
      );
    }

    console.log("[Settings] ✅ All settings saved to database successfully");
    console.log("[Settings] Upsert result:", upsertData);

    return NextResponse.json({
      success: true,
      message: "All settings saved to database",
    });
  } catch (error) {
    console.error("[Settings] PUT error:", error);
    console.error(
      "[Settings] Error stack:",
      error instanceof Error ? error.stack : "No stack",
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
