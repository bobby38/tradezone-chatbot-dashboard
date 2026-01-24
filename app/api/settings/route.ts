import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CHATKIT_DEFAULT_PROMPT } from "@/lib/chatkit/defaultPrompt";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables:", {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseServiceKey,
  });
}

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

const DEFAULT_SETTINGS = {
  chatkit: {
    systemPrompt: CHATKIT_DEFAULT_PROMPT,
    textModel: "gpt-4o-mini",
    voiceModel: null,
    voice: "alloy",
    vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID ?? null,
  },
};

// Default organization ID - you can make this dynamic later
const DEFAULT_ORG_ID = "765e1172-b666-471f-9b42-f80c9b5006de";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    if (!supabase) {
      console.warn("Supabase not configured, returning default settings");
      return NextResponse.json({
        settings: DEFAULT_SETTINGS,
        source: "fallback_no_supabase",
      });
    }

    // Get settings from organization settings field instead of separate table
    const { data: org, error } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    if (error) {
      // Supabase returns code PGRST116 when no rows found, treat as empty defaults
      if (
        error.code === "PGRST116" ||
        error.details?.includes("0 rows") ||
        error.message?.includes("No rows")
      ) {
        console.warn(
          `Organization ${DEFAULT_ORG_ID} not found. Returning default settings.`,
        );
        return NextResponse.json({
          settings: DEFAULT_SETTINGS,
          source: "fallback_missing_org",
        });
      }
      if (error.code === "42P01") {
        console.warn(
          "organizations table missing. Returning default settings.",
        );
        return NextResponse.json({
          settings: DEFAULT_SETTINGS,
          source: "fallback_missing_table",
        });
      }

      console.error("Error fetching organization settings:", error);
      return NextResponse.json(
        {
          settings: DEFAULT_SETTINGS,
          source: "fallback_error",
          error: error.message,
        },
        { status: 200 },
      );
    }

    const settings = org?.settings || DEFAULT_SETTINGS;
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Settings GET error:", error);
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

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 },
      );
    }

    const {
      settingType,
      settingKey,
      settingValue,
      userId = "default",
    } = await request.json();

    if (!settingType || !settingKey || settingValue === undefined) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: settingType, settingKey, settingValue",
        },
        { status: 400 },
      );
    }

    // Get current settings
    const { data: org, error: fetchError } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching organization:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch organization", code: fetchError.code },
        { status: 500 },
      );
    }

    // Update the nested settings
    const currentSettings = org?.settings || { ...DEFAULT_SETTINGS };
    if (!currentSettings[settingType]) {
      currentSettings[settingType] = {};
    }
    currentSettings[settingType][settingKey] = settingValue;

    // Save back to organization (upsert ensures row exists)
    const { data, error } = await supabase
      .from("organizations")
      .upsert(
        {
          id: DEFAULT_ORG_ID,
          settings: currentSettings,
        },
        { onConflict: "id" },
      )
      .select();

    if (error) {
      console.error("Error saving setting:", error);
      return NextResponse.json(
        { error: "Failed to save setting" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Settings POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 },
      );
    }

    const { settings } = await request.json();

    if (!settings || typeof settings !== "object") {
      return NextResponse.json(
        { error: "Invalid settings object" },
        { status: 400 },
      );
    }

    // Get current settings
    const { data: org, error: fetchError } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching organization:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch organization" },
        { status: 500 },
      );
    }

    // Merge with existing settings
    const currentSettings = org?.settings || { ...DEFAULT_SETTINGS };
    const mergedSettings = { ...currentSettings, ...settings };

    // Save back to organization
    const { data, error } = await supabase
      .from("organizations")
      .upsert(
        {
          id: DEFAULT_ORG_ID,
          settings: mergedSettings,
        },
        { onConflict: "id" },
      )
      .select();

    if (error) {
      console.error("Error batch saving settings:", error);
      return NextResponse.json(
        { error: "Failed to save settings" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Settings PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
