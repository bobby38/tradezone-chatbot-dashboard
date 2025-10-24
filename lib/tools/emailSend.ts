import { EmailService } from "@/lib/email-service";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const emailSendTool = {
  type: "function" as const,
  function: {
    name: "sendemail",
    description:
      "Escalate a support request to TradeZone staff after you've confirmed the customer is in Singapore and you cannot resolve the issue yourself. Never use this to submit trade-in requests—those must go through the trade-in tools.",
    parameters: {
      type: "object",
      properties: {
        emailType: {
          type: "string",
          enum: ["info_request", "contact"],
          description:
            "Type of escalation: info_request for unanswered questions, contact for general support follow-up.",
        },
        name: {
          type: "string",
          description: "Customer full name",
        },
        email: {
          type: "string",
          description: "Customer email address",
        },
        phone: {
          type: "string",
          description:
            "Customer phone number (with +65 country code for Singapore)",
        },
        phone_number: {
          type: "string",
          description:
            "Alias for phone number (used by some prompts). Include +65 when possible.",
        },
        message: {
          type: "string",
          description:
            "Customer message or inquiry details. Include phone number in message if provided.",
        },
      },
      required: ["emailType", "name", "email", "message"],
    },
  },
};

/**
 * Handler function for sending emails
 * Creates submission record and sends notification email
 */
export async function handleEmailSend(params: {
  emailType: "info_request" | "contact" | "trade_in";
  name: string;
  email: string;
  phone?: string;
  phone_number?: string;
  message: string;
  deviceModel?: string;
  deviceCondition?: string;
}): Promise<string> {
  try {
    if (params.emailType === "trade_in") {
      console.warn(
        "[EmailSend] Trade-in payload attempted via sendemail. Blocking.",
      );
      return "Trade-in submissions must use tradein_update_lead and tradein_submit_lead, not sendemail.";
    }

    const normalizedMessage =
      `${params.message} ${params.deviceModel || ""}`.toLowerCase();
    if (
      normalizedMessage.includes("trade in") ||
      normalizedMessage.includes("trade-in") ||
      normalizedMessage.includes("tradein")
    ) {
      console.warn(
        "[EmailSend] Trade-in language detected in contact request. Blocking.",
      );
      return "I already saved this as a trade-in. Please confirm so I can submit it via tradein_submit_lead.";
    }

    const phone = params.phone ?? params.phone_number;

    console.log("[EmailSend] Sending support email:", {
      ...params,
      phone,
    });

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const submissionId = randomUUID();

    // Create submission record
    const { error: submissionError } = await supabase
      .from("submissions")
      .insert({
        id: submissionId,
        content_type: "Agent",
        content_input: params.message,
        status: "unread",
        ai_metadata: {
          email_type: params.emailType,
          phone,
          sender_email: params.email,
          sender_name: params.name,
          sent_via: "chatkit_agent",
          context: params.message,
        },
      });

    if (submissionError) {
      console.error("[EmailSend] Submission creation error:", submissionError);
      throw new Error(
        `Failed to create submission: ${submissionError.message}`,
      );
    }

    console.log("[EmailSend] Submission created:", submissionId);

    // Send email notification
    const emailSent = await EmailService.sendFormNotification({
      type: "contact",
      submissionId,
      formData: {
        name: params.name,
        email: params.email,
        message: params.message,
        phone: phone || "Not provided",
      },
      submittedAt: new Date().toISOString(),
    });

    console.log("[EmailSend] Email sent:", emailSent);

    // Return confirmation message
    return `Thanks, ${params.name}! I've passed your inquiry to our team. They'll respond to ${params.email} shortly.`;
  } catch (error) {
    console.error("[EmailSend] Error:", error);
    return "I encountered an error submitting your request. Please try contacting us directly at contactus@tradezone.sg.";
  }
}
