import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { EmailService } from "@/lib/email-service";

// CORS headers for widget on tradezone.sg
const ALLOWED_ORIGINS = [
  "https://tradezone.sg",
  "https://www.tradezone.sg",
  "https://trade.rezult.co",
  "https://rezult.co",
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
      origin.includes(allowed.replace("https://", "")),
    )
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
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

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const body = await request.json();

    // Check if this is a ChatKit tool call (has emailType, name, email, message)
    if (body.emailType && body.name && body.email && body.message) {
      // ChatKit tool format - convert to email
      const staffEmail = process.env.STAFF_EMAIL || "contactus@tradezone.sg";
      const devEmail = process.env.DEV_EMAIL || "info@rezult.co"; // BCC for testing
      const emailType = body.emailType as
        | "info_request"
        | "contact"
        | "trade_in";

      if (emailType === "trade_in") {
        console.warn(
          "[Email Tool] Trade-in payload attempted via sendemail. Blocking.",
        );
        return NextResponse.json(
          {
            result:
              "Trade-in submissions must use tradein_update_lead followed by tradein_submit_lead. Do not use sendemail for trade-ins.",
          },
          { headers: corsHeaders },
        );
      }

      const customerName = body.name;
      let customerEmail = body.email;
      const customerPhone = body.phone_number || "Not provided";
      const customerMessage = body.message;
      const customerNote = body.note || null;

      const normalizedMessage =
        `${customerMessage} ${customerNote || ""}`.toLowerCase();
      if (
        normalizedMessage.includes("trade in") ||
        normalizedMessage.includes("trade-in") ||
        normalizedMessage.includes("tradein")
      ) {
        console.warn(
          "[Email Tool] Trade-in keywords detected in sendemail payload. Blocking.",
        );
        return NextResponse.json(
          {
            result:
              "It looks like this is a trade-in request. Please submit it with tradein_update_lead followed by tradein_submit_lead so our team gets the full form and photos.",
          },
          { headers: corsHeaders },
        );
      }

      // Email validation and correction
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      // Common voice transcription mishearings - auto-correct
      const emailCorrections: Record<string, string> = {
        "utmail.com": "hotmail.com",
        "artmail.com": "hotmail.com",
        "oatmail.com": "hotmail.com",
        "outmail.com": "hotmail.com",
        "geemail.com": "gmail.com",
        "g-mail.com": "gmail.com",
      };

      // Check for corrections needed
      for (const [wrong, correct] of Object.entries(emailCorrections)) {
        if (customerEmail.includes(wrong)) {
          customerEmail = customerEmail.replace(wrong, correct);
          console.log(
            `[Email Tool] Auto-corrected domain: ${wrong} → ${correct}`,
          );
        }
      }

      // Validate email format
      if (!emailRegex.test(customerEmail)) {
        console.error(`[Email Tool] Invalid email format: ${customerEmail}`);
        return NextResponse.json(
          {
            result: `I'm having trouble understanding the email address. Please ask the customer to confirm it's spelled correctly, or they can type it in the chat box instead. I heard: ${customerEmail}`,
          },
          { headers: corsHeaders },
        );
      }

      console.log(`[Email Tool] Validated email: ${customerEmail}`);

      let subject = "";
      let html = "";

      if (emailType === "info_request") {
        subject = `ℹ️ Information Request from ${customerName}`;
        html = `
          <h2>Customer Information Request (Voice Chat)</h2>
          <p><strong>Customer:</strong> ${customerName}</p>
          <p><strong>Email:</strong> ${customerEmail}</p>
          <p><strong>Phone:</strong> ${customerPhone}</p>
          <h3>Question:</h3>
          <p>${customerMessage.replace(/\n/g, "<br>")}</p>
          ${customerNote ? `<h3>Additional Context:</h3><p>${customerNote.replace(/\n/g, "<br>")}</p>` : ""}
          <hr>
          <p><em>Amara couldn't answer this question - customer needs staff follow-up.</em></p>
        `;
      } else {
        subject = `📧 Contact Request from ${customerName}`;
        html = `
          <h2>Customer Contact Request (Voice Chat)</h2>
          <p><strong>Customer:</strong> ${customerName}</p>
          <p><strong>Email:</strong> ${customerEmail}</p>
          <p><strong>Phone:</strong> ${customerPhone}</p>
          <h3>Message:</h3>
          <p>${customerMessage.replace(/\n/g, "<br>")}</p>
          ${customerNote ? `<h3>Additional Notes:</h3><p>${customerNote.replace(/\n/g, "<br>")}</p>` : ""}
          <hr>
          <p><em>Sent via TradeZone Voice Assistant (Amara)</em></p>
        `;
      }

      const smtpConfig = await EmailService.getSmtpConfig();

      if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
        throw new Error("SMTP configuration missing");
      }

      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: smtpConfig.auth,
      });

      await transporter.verify().catch((error) => {
        console.warn("SMTP verify failed (continuing)", error);
      });

      await transporter.sendMail({
        from: smtpConfig.fromName
          ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`
          : smtpConfig.fromEmail,
        to: staffEmail,
        bcc: devEmail, // BCC to dev for testing/monitoring
        replyTo: customerEmail,
        subject,
        html,
        text: customerMessage,
      });

      // Create submission record in dashboard
      const { createClient } = await import("@supabase/supabase-js");
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

      const submissionData = {
        content_type: "Agent", // Changed from "Contact Form" to "Agent"
        content_input: customerMessage, // Table uses content_input, not message
        ai_metadata: {
          email_type: emailType,
          phone: customerPhone,
          sender_email: customerEmail,
          sender_name: customerName,
          sent_via: "voice_assistant",
          timestamp: new Date().toISOString(),
          note: customerNote,
        },
        status: "unread",
      };

      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .insert(submissionData)
        .select()
        .single();

      if (submissionError) {
        console.error(
          "[Email Tool] Failed to create submission:",
          submissionError,
        );
        // Don't fail the whole request if submission creation fails
      } else {
        console.log("[Email Tool] Submission created:", submission?.id);
      }

      // Return success message for ChatKit
      const resultMessage =
        emailType === "info_request"
          ? `Thanks, ${customerName}! I've passed your question to our team. They'll email you at ${customerEmail} with the answer within 24 hours.`
          : `Thanks, ${customerName}! I've sent your message to our team. They'll respond to ${customerEmail} shortly.`;

      return NextResponse.json(
        { result: resultMessage },
        { headers: corsHeaders },
      );
    }

    // Legacy direct email format
    const {
      to,
      subject,
      html,
      text,
      replyTo,
      cc,
      bcc,
    }: {
      to?: string;
      subject?: string;
      html?: string;
      text?: string;
      replyTo?: string;
      cc?: string;
      bcc?: string;
    } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: to, subject, html OR emailType, name, email, message",
        },
        { status: 400, headers: corsHeaders },
      );
    }

    console.log("[Email Tool] Legacy email format - sending direct email");
    console.log("[Email Tool] To:", to);
    console.log("[Email Tool] Subject:", subject);

    const smtpConfig = await EmailService.getSmtpConfig();

    if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
      console.error("[Email Tool] SMTP config missing:", {
        hasUser: !!smtpConfig.auth.user,
        hasPass: !!smtpConfig.auth.pass,
      });
      throw new Error("SMTP configuration missing");
    }

    console.log("[Email Tool] SMTP config loaded:", {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.auth.user,
    });

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.auth,
    });

    console.log("[Email Tool] Verifying SMTP connection...");
    await transporter.verify().catch((error) => {
      console.warn("[Email Tool] SMTP verify failed (continuing)", error);
    });

    console.log("[Email Tool] Sending email...");
    await transporter.sendMail({
      from: smtpConfig.fromName
        ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`
        : smtpConfig.fromEmail,
      to,
      cc,
      bcc,
      replyTo,
      subject,
      html,
      text,
    });

    console.log("[Email Tool] ✅ Email sent successfully to:", to);
    return NextResponse.json(
      { result: "Email sent successfully" },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[Email Tool] ❌ Error sending email:", error);
    console.error("[Email Tool] Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send email",
      },
      { status: 500, headers: corsHeaders },
    );
  }
}
