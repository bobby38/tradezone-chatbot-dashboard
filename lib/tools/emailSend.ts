import { EmailService } from "@/lib/email-service";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/**
 * Email Send Tool
 * Handles trade-in requests and contact form submissions
 */

export const emailSendTool = {
  type: "function" as const,
  function: {
    name: "sendemail",
    description:
      "Send an email for trade-in requests or customer inquiries. Only use when customer explicitly requests to be contacted. IMPORTANT: Always verify customer is in Singapore first - we do not serve international customers.",
    parameters: {
      type: "object",
      properties: {
        emailType: {
          type: "string",
          enum: ["trade_in", "info_request", "contact"],
          description:
            "Type of email: trade_in for device trade-ins, info_request for product inquiries, contact for general contact",
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
        message: {
          type: "string",
          description:
            "Customer message or inquiry details. Include phone number in message if provided.",
        },
        deviceModel: {
          type: "string",
          description: "For trade-ins: device model (e.g., iPhone 14 Pro, PS5)",
        },
        deviceCondition: {
          type: "string",
          description:
            "For trade-ins: device condition (e.g., Excellent, Good, Fair)",
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
  emailType: "trade_in" | "info_request" | "contact";
  name: string;
  email: string;
  phone?: string;
  message: string;
  deviceModel?: string;
  deviceCondition?: string;
}): Promise<string> {
  try {
    console.log("[EmailSend] Sending support email:", params);

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
          phone: params.phone,
          device_model: params.deviceModel,
          device_condition: params.deviceCondition,
          sender_email: params.email,
          sender_name: params.name,
          sent_via: "chatkit_agent",
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
      type: params.emailType === "trade_in" ? "trade-in" : "contact",
      submissionId,
      formData: {
        name: params.name,
        email: params.email,
        message: params.message,
        device_model: params.deviceModel,
        device_condition: params.deviceCondition,
      },
      submittedAt: new Date().toISOString(),
    });

    console.log("[EmailSend] Email sent:", emailSent);

    // Return confirmation message
    if (params.emailType === "trade_in") {
      return `Thanks, ${params.name}! I've sent your trade-in request for the ${params.deviceModel} to our team. They'll email you at ${params.email} with a quote within 24 hours.`;
    } else {
      return `Thanks, ${params.name}! I've passed your inquiry to our team. They'll respond to ${params.email} shortly.`;
    }
  } catch (error) {
    console.error("[EmailSend] Error:", error);
    return "I encountered an error submitting your request. Please try contacting us directly at contactus@tradezone.sg.";
  }
}
