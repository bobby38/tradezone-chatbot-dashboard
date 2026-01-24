import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/notifications
 * Fetch all notifications for the dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    // For now, return empty notifications
    // TODO: Implement notifications table in Supabase
    const notifications: any[] = [];

    return NextResponse.json({
      notifications,
      count: notifications.length,
      unread: 0,
    });
  } catch (error) {
    console.error("[Notifications] Error fetching notifications:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch notifications",
        notifications: [],
        count: 0,
        unread: 0,
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/notifications
 * Create a new notification
 */
export async function POST(request: NextRequest) {
  try {
    const auth = verifyAdminAccess(request);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    const body = await request.json();

    // TODO: Implement notification creation
    // For now, just return success
    return NextResponse.json({
      success: true,
      message: "Notification system not yet implemented",
    });
  } catch (error) {
    console.error("[Notifications] Error creating notification:", error);
    return NextResponse.json(
      { error: "Failed to create notification" },
      { status: 500 },
    );
  }
}
