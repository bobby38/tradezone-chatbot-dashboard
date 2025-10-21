import { NextRequest, NextResponse } from "next/server";
import { submitTradeInLead } from "@/lib/trade-in/service";

/**
 * Resend email notification for an existing trade-in lead
 * Useful for leads that were submitted when email was broken
 */
export async function POST(request: NextRequest) {
  try {
    const { leadId } = await request.json();

    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required" },
        { status: 400 }
      );
    }

    console.log(`[Resend Email] Attempting to resend email for lead: ${leadId}`);

    // Re-submit the lead with notify=true to trigger email
    const { lead, emailSent } = await submitTradeInLead({
      leadId,
      summary: "Email resend request",
      notify: true, // Force email send
      status: undefined, // Don't change status
    });

    if (emailSent) {
      console.log(`[Resend Email] ✅ Email successfully sent for lead ${leadId}`);
      return NextResponse.json({
        success: true,
        message: "Email sent successfully",
        lead: {
          id: lead.id,
          contact_name: lead.contact_name,
          contact_email: lead.contact_email,
        },
      });
    } else {
      console.log(`[Resend Email] ❌ Email failed to send for lead ${leadId}`);
      return NextResponse.json({
        success: false,
        message: "Email failed to send - check logs for details",
      });
    }
  } catch (error) {
    console.error("[Resend Email] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to resend email",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
