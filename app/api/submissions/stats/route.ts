import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authErrorResponse, verifyAdminAccess } from "@/lib/security/auth";

export const revalidate = 0;
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
  try {
    const auth = verifyAdminAccess(req);
    if (!auth.authenticated) {
      return authErrorResponse(auth.error);
    }

    // Get all submissions
    const { data: submissions, error } = await supabaseAdmin
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch submissions" },
        { status: 500 },
      );
    }

    // Calculate comprehensive stats
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      total: submissions.length,
      today: 0,
      yesterday: 0,
      thisWeek: 0,
      thisMonth: 0,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byDate: {} as Record<string, number>,
      recentActivity: [] as any[],
      topEmails: {} as Record<string, number>,
      deviceStats: {} as Record<string, number>,
      hourlyDistribution: new Array(24).fill(0),
      weeklyDistribution: new Array(7).fill(0),
    };

    // Process each submission
    submissions.forEach((submission) => {
      const submissionDate = new Date(submission.created_at);
      const dateStr = submissionDate.toISOString().split("T")[0];
      const hour = submissionDate.getHours();
      const dayOfWeek = submissionDate.getDay();

      // Date-based stats
      if (submissionDate >= today) stats.today++;
      if (submissionDate >= yesterday && submissionDate < today)
        stats.yesterday++;
      if (submissionDate >= weekAgo) stats.thisWeek++;
      if (submissionDate >= monthAgo) stats.thisMonth++;

      // Daily distribution
      stats.byDate[dateStr] = (stats.byDate[dateStr] || 0) + 1;

      // Hourly and weekly distribution
      stats.hourlyDistribution[hour]++;
      stats.weeklyDistribution[dayOfWeek]++;

      // Status stats
      stats.byStatus[submission.status] =
        (stats.byStatus[submission.status] || 0) + 1;

      // Form type detection and stats
      const metadata = submission.ai_metadata || {};

      const formType =
        submission.content_type === "Agent"
          ? "Agent"
          : metadata.device_type || metadata.console_type
            ? "Trade-in Form"
            : "Contact Form";
      stats.byType[formType] = (stats.byType[formType] || 0) + 1;

      // Email tracking (for repeat customers)
      if (metadata.email) {
        stats.topEmails[metadata.email] =
          (stats.topEmails[metadata.email] || 0) + 1;
      }

      // Device stats (from webhook metadata)
      if (metadata.device_type) {
        stats.deviceStats[metadata.device_type] =
          (stats.deviceStats[metadata.device_type] || 0) + 1;
      }

      // Recent activity (last 10 submissions)
      if (stats.recentActivity.length < 10) {
        stats.recentActivity.push({
          id: submission.id,
          type: formType,
          email: metadata.email,
          name: metadata.name,
          subject: metadata.subject,
          created_at: submission.created_at,
          status: submission.status,
        });
      }
    });

    // Calculate growth rates
    const todayGrowth =
      stats.yesterday > 0
        ? (((stats.today - stats.yesterday) / stats.yesterday) * 100).toFixed(1)
        : stats.today > 0
          ? 100
          : 0;

    const weekGrowth =
      stats.thisMonth > stats.thisWeek
        ? (
            ((stats.thisWeek - (stats.thisMonth - stats.thisWeek)) /
              (stats.thisMonth - stats.thisWeek)) *
            100
          ).toFixed(1)
        : 0;

    // Top emails (most frequent submitters)
    const topEmailsList = Object.entries(stats.topEmails)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([email, count]) => ({ email, count }));

    return NextResponse.json({
      stats: {
        ...stats,
        topEmails: topEmailsList,
        growth: {
          today: todayGrowth,
          week: weekGrowth,
        },
        averagePerDay: (stats.thisMonth / 30).toFixed(1),
        conversionRate: stats.byStatus.completed
          ? ((stats.byStatus.completed / stats.total) * 100).toFixed(1)
          : 0,
      },
    });
  } catch (error) {
    console.error("Stats API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
