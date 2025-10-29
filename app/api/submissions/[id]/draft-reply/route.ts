import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Submission ID is required" },
        { status: 400 },
      );
    }

    // Get the submission details
    const { data: submission, error: fetchError } = await supabaseAdmin
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    const metadata = submission.ai_metadata || {};
    const primaryEmail =
      metadata.email ||
      metadata.sender_email ||
      metadata.customer_email ||
      metadata.contact_email ||
      metadata.user_email ||
      null;

    const contactName =
      metadata.name ||
      metadata.sender_name ||
      (metadata.names
        ? `${metadata.names.first_name || ""} ${metadata.names.last_name || ""}`.trim()
        : metadata.customer_name || metadata.contact_name || "there");

    const requestSubject = metadata.subject || "Your Inquiry";
    const requestSummary =
      metadata.context ||
      metadata.message ||
      metadata.summary ||
      metadata.subject ||
      "No message provided";

    const emailType =
      typeof metadata.email_type === "string" ? metadata.email_type : "";
    const isTradeIn = Boolean(
      metadata.device_type || metadata.console_type || metadata.body_condition,
    );
    const isAgent =
      submission.content_type === "Agent" ||
      metadata.sent_via === "chatkit_agent" ||
      emailType === "contact" ||
      emailType === "info_request";

    // Generate AI-powered reply based on submission type and content
    let draftReply = "";
    let subject = "";

    if (isTradeIn) {
      // Trade-in form reply
      subject =
        `Re: Trade-in Inquiry - ${metadata.device_type || "Device"} ${metadata.brand || ""} ${metadata.model || ""}`.trim();

      draftReply = `Hi ${contactName},

Thank you for your interest in trading in your ${metadata.device_type || "device"}${metadata.brand ? ` ${metadata.brand}` : ""}${metadata.model ? ` ${metadata.model}` : ""}.

Based on the information you provided:
${metadata.body_condition ? `- Condition: ${metadata.body_condition}` : ""}
${metadata.storage ? `- Storage: ${metadata.storage}` : ""}
${metadata.color ? `- Color: ${metadata.color}` : ""}

We are pleased to inform you that we are interested in your trade-in. Here's what happens next:

1. **Device Assessment**: We will need to physically inspect your device to confirm its condition and functionality.

2. **Quote Validation**: Once inspected, we will provide you with a final trade-in value based on current market conditions.

3. **Quick Process**: The entire evaluation process typically takes 15-30 minutes.

**Next Steps:**
- Please visit our store at [Your Address] during business hours
- Bring your device along with any original accessories
- Don't forget to backup and factory reset your device before bringing it in

If you have any questions or would like to schedule an appointment, please feel free to contact us.

We look forward to helping you with your trade-in!

Best regards,
TradeZone Team

---
TradeZone Singapore
Email: info@tradezone.sg
Phone: [Your Phone]
Website: https://tradezone.sg`;
    } else if (isAgent) {
      subject = `Re: ${requestSubject}`;

      draftReply = `Hi ${contactName},

Thanks for contacting TradeZone Singapore. We've received your request about "${requestSummary}" and our support team will follow up within the next business day.

If you need urgent help, feel free to reach us directly:
- Phone: [Your Phone Number]
- WhatsApp: [Your WhatsApp Number]
- Visit our store: [Your Address]

We'll keep an eye on this and get back to you as soon as possible.

Best regards,
TradeZone Team

---
TradeZone Singapore
Email: info@tradezone.sg
Phone: [Your Phone]
Website: https://tradezone.sg`;
    } else {
      // Contact form reply
      subject = `Re: ${requestSubject}`;

      draftReply = `Hi ${contactName},

Thank you for contacting TradeZone Singapore. We have received your message and appreciate you reaching out to us.

Your inquiry: "${requestSummary}"

We will review your message and get back to you within 24 hours during business days. Our team is committed to providing you with the best possible assistance.

If your inquiry is urgent, please feel free to contact us directly:
- Phone: [Your Phone Number]
- WhatsApp: [Your WhatsApp Number]
- Visit our store: [Your Address]

In the meantime, feel free to browse our website at https://tradezone.sg for the latest deals and promotions.

Thank you for choosing TradeZone Singapore!

Best regards,
TradeZone Team

---
TradeZone Singapore
Email: info@tradezone.sg
Phone: [Your Phone]
Website: https://tradezone.sg`;
    }

    // Store the draft in the database for future reference
    const { error: draftError } = await supabaseAdmin
      .from("submission_drafts")
      .upsert({
        submission_id: id,
        subject,
        content: draftReply,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (draftError) {
      console.warn("Failed to save draft to database:", draftError);
      // Continue anyway, as the draft can still be returned to the user
    }

    return NextResponse.json({
      success: true,
      draft: {
        to: primaryEmail || "",
        subject,
        content: draftReply,
        type: isTradeIn ? "trade-in" : isAgent ? "agent" : "contact",
      },
    });
  } catch (error) {
    console.error("Draft reply error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
