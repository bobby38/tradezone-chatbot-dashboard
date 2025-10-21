import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read
 */
export async function POST(request: NextRequest) {
  try {
    // TODO: Implement mark all as read in Supabase
    return NextResponse.json({
      success: true,
      message: "Notification system not yet implemented",
      markedCount: 0,
    });
  } catch (error) {
    console.error("[Notifications] Error marking all as read:", error);
    return NextResponse.json(
      { error: "Failed to mark all as read" },
      { status: 500 },
    );
  }
}
