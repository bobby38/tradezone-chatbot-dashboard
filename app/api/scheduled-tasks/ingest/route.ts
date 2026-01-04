import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/scheduled-tasks/ingest
 *
 * Endpoint for cron jobs to report their execution status.
 *
 * Required headers:
 * - X-API-Key: ChatKit API key for authentication
 *
 * Request body:
 * {
 *   "task_id": "sync-price-grid",
 *   "task_title": "Sync price grid",
 *   "status": "success" | "failed" | "running",
 *   "started_at": "2026-01-04T10:00:00Z",
 *   "ended_at": "2026-01-04T10:00:05Z",  // optional
 *   "duration_ms": 5000,                   // optional
 *   "log_url": "https://...",              // optional
 *   "notes": "Error details if failed"     // optional
 * }
 */

interface IngestRequest {
  task_id: string;
  task_title: string;
  status: "success" | "failed" | "running";
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  log_url?: string;
  notes?: string;
  environment?: string;
  owner?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate via X-API-Key header
    const apiKey = request.headers.get("X-API-Key");
    const validKey = process.env.CHATKIT_API_KEY || process.env.NEXT_PUBLIC_CHATKIT_API_KEY;

    if (!apiKey || apiKey !== validKey) {
      console.error("[ScheduledTasksIngest] Invalid or missing API key");
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body: IngestRequest = await request.json();

    // Validate required fields
    if (!body.task_id || !body.task_title || !body.status) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: task_id, task_title, status"
        },
        { status: 400 }
      );
    }

    // Validate status
    if (!["success", "failed", "running"].includes(body.status)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid status. Must be: success, failed, or running"
        },
        { status: 400 }
      );
    }

    // Initialize Supabase with service role
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("[ScheduledTasksIngest] Supabase credentials missing");
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    // Calculate duration if not provided
    let durationMs = body.duration_ms;
    if (!durationMs && body.started_at && body.ended_at) {
      const start = new Date(body.started_at).getTime();
      const end = new Date(body.ended_at).getTime();
      durationMs = end - start;
    }

    // Insert into database
    const { data, error } = await supabase
      .from("scheduled_task_runs")
      .insert({
        task_id: body.task_id,
        task_title: body.task_title,
        status: body.status,
        started_at: body.started_at || new Date().toISOString(),
        ended_at: body.ended_at || (body.status !== "running" ? new Date().toISOString() : null),
        duration_ms: durationMs,
        log_url: body.log_url,
        notes: body.notes,
        environment: body.environment || "production",
        owner: body.owner || "Coolify Cron",
      })
      .select()
      .single();

    if (error) {
      console.error("[ScheduledTasksIngest] Database error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log(`[ScheduledTasksIngest] Recorded ${body.status} run for ${body.task_id}`);

    return NextResponse.json({
      success: true,
      message: "Task execution logged successfully",
      data: {
        id: data.id,
        task_id: data.task_id,
        status: data.status,
        started_at: data.started_at,
      }
    });

  } catch (error) {
    console.error("[ScheduledTasksIngest] Unexpected error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      },
      { status: 500 }
    );
  }
}
