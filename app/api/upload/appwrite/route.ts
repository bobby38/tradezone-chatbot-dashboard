import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

type UploadTelemetryEntry = {
  requestId: string;
  event: "upload_success" | "upload_failed";
  sessionId?: string;
  data?: Record<string, unknown>;
};

async function logTelemetry(entry: UploadTelemetryEntry) {
  console.log("[Upload Telemetry]", entry);
}

// CORS headers - Allow uploads from your domains
const ALLOWED_ORIGINS = [
  "https://tradezone.sg",
  "https://www.tradezone.sg",
  "https://rezult.co",
  "https://www.rezult.co",
  "https://trade.rezult.co",
  ...(process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3003",
      ]
    : []),
];

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin =
    origin &&
    ALLOWED_ORIGINS.some((allowed) =>
      origin.includes(allowed.replace("https://", "").replace("http://", "")),
    )
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sessionId = formData.get("sessionId") as string;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Appwrite configuration from env
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const bucketId = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID;
    const apiKey = process.env.APPWRITE_API_KEY;

    if (!endpoint || !projectId || !bucketId || !apiKey) {
      console.error("[Appwrite Upload] Missing configuration");
      return NextResponse.json(
        { error: "Appwrite is not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    // Create unique file ID
    const fileId = randomUUID();

    // Prepare upload to Appwrite
    const uploadFormData = new FormData();
    uploadFormData.append("fileId", fileId);
    uploadFormData.append("file", file);

    // Upload to Appwrite Storage with API key
    const response = await fetch(
      `${endpoint}/storage/buckets/${bucketId}/files`,
      {
        method: "POST",
        headers: {
          "X-Appwrite-Project": projectId,
          "X-Appwrite-Key": apiKey,
        },
        body: uploadFormData,
      },
    );

    if (!response.ok) {
      let errorDetails: unknown;
      try {
        errorDetails = await response.json();
      } catch {
        errorDetails = await response.text();
      }
      console.error("[Appwrite Upload] Error:", {
        requestId,
        sessionId,
        status: response.status,
        details: errorDetails,
        headers: Object.fromEntries(response.headers.entries()),
      });
      logTelemetry({
        requestId,
        event: "upload_failed",
        sessionId,
        data: {
          status: response.status,
          details: errorDetails,
          endpoint,
          bucketId,
        },
      }).catch((err) =>
        console.error("[Upload Telemetry] Failed to log failure", err),
      );
      return NextResponse.json(
        {
          error: `Appwrite upload failed: ${response.status}`,
          details: errorDetails,
        },
        { status: response.status, headers: corsHeaders },
      );
    }

    const data = await response.json();

    // Return public URL
    const imageUrl = `${endpoint}/storage/buckets/${bucketId}/files/${data.$id}/view?project=${projectId}`;

    console.log("[Appwrite Upload] Success:", imageUrl);
    logTelemetry({
      requestId,
      event: "upload_success",
      sessionId,
      data: {
        fileId: data.$id,
        mimeType: file.type,
        size: file.size,
        imageUrl,
        endpoint,
        bucketId,
      },
    }).catch((err) =>
      console.error("[Upload Telemetry] Failed to log success", err),
    );

    // Auto-create and link to trade-in lead
    if (sessionId) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const { ensureTradeInLead } = await import("@/lib/trade-in/service");

        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        console.log(
          `[Appwrite Upload] Finding/creating trade-in lead for session: ${sessionId}`,
        );

        // Find active trade-in lead for this session
        const { data: leads } = await supabase
          .from("trade_in_leads")
          .select("id")
          .eq("session_id", sessionId)
          .not("status", "in", "(completed,closed,archived)")
          .order("created_at", { ascending: false })
          .limit(1);

        let leadId: string;

        if (leads && leads.length > 0) {
          leadId = leads[0].id;
          console.log(`[Appwrite Upload] Found existing lead: ${leadId}`);
        } else {
          // No active lead found - create one automatically
          console.log(
            "[Appwrite Upload] No active lead found, creating new lead...",
          );

          const result = await ensureTradeInLead({
            sessionId,
            channel: "chat",
            initialMessage: `Trade-in session initiated via image upload (${file.name})`,
          });

          leadId = result.leadId;
          console.log(
            `[Appwrite Upload] Created new lead: ${leadId} (status: ${result.status})`,
          );
        }

        const { recordTradeInMediaEntry } = await import(
          "@/lib/trade-in/service"
        );

        await recordTradeInMediaEntry({
          leadId,
          mediaType: file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("video/")
              ? "video"
              : "document",
          url: imageUrl,
          mimeType: file.type,
          sizeBytes: file.size,
        });

        console.log(`[Appwrite Upload] Media record saved for lead ${leadId}`);

        const { error: actionError } = await supabase
          .from("trade_in_actions")
          .insert({
            lead_id: leadId,
            action_type: "note",
            payload: {
              type: "media_uploaded",
              message: "Customer uploaded trade-in media",
              file_id: data.$id,
              file_name: file.name,
              file_type: file.type,
              file_size: file.size,
              view_url: imageUrl,
              appwrite_bucket: bucketId,
            },
          });

        if (actionError) {
          console.error("[Appwrite Upload] Failed to log action:", actionError);
        } else {
          console.log(`[Appwrite Upload] Action logged for lead ${leadId}`);
        }

        console.log(
          `[Appwrite Upload] ✅ Successfully linked image to trade-in lead ${leadId}`,
        );
      } catch (linkError) {
        console.error(
          "[Appwrite Upload] Failed to link to trade-in lead:",
          linkError,
        );
        // Don't fail the upload if linking fails - image still uploaded to Appwrite
      }
    }

    return NextResponse.json(
      {
        success: true,
        url: imageUrl,
        fileId: data.$id,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    console.error("[Appwrite Upload] Server error:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500, headers: corsHeaders },
    );
  }
}
