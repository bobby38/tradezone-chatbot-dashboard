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

      // Don't block support questions that mention "trade in" - those are legitimate inquiries
      // The agent should route actual trade-ins to tradein tools, not sendemail

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
        subject = `💬 Customer Inquiry from ${customerName}`;
        html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 5px 0 0 0; font-size: 14px; opacity: 0.9; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
    .info-box { background: #f8fafc; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: 600; color: #475569; display: inline-block; width: 80px; }
    .value { color: #1e293b; }
    .message-box { background: #fff; border: 1px solid #e2e8f0; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .message-box h3 { margin-top: 0; color: #475569; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .message-content { color: #334155; line-height: 1.8; }
    .footer { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #64748b; border: 1px solid #e2e8f0; border-top: none; }
    .badge { display: inline-block; background: #667eea; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>💬 Customer Inquiry</h1>
    <p>New inquiry from TradeZone Voice Assistant</p>
  </div>
  <div class="content">
    <div class="info-box">
      <div class="info-row">
        <span class="label">Name:</span>
        <span class="value">${customerName}</span>
      </div>
      <div class="info-row">
        <span class="label">Email:</span>
        <span class="value"><a href="mailto:${customerEmail}">${customerEmail}</a></span>
      </div>
      <div class="info-row">
        <span class="label">Phone:</span>
        <span class="value"><a href="tel:${customerPhone}">${customerPhone}</a></span>
      </div>
    </div>

    <div class="message-box">
      <h3>Customer Question</h3>
      <div class="message-content">${customerMessage.replace(/\n/g, "<br>")}</div>
    </div>

    ${
      customerNote
        ? `
    <div class="message-box">
      <h3>Additional Context</h3>
      <div class="message-content">${customerNote.replace(/\n/g, "<br>")}</div>
    </div>
    `
        : ""
    }
  </div>
  <div class="footer">
    <span class="badge">Voice Chat</span>
    <p style="margin-top: 15px;">This inquiry was handled by Amara, our AI assistant. The customer needs staff follow-up.</p>
  </div>
</body>
</html>
        `;
      } else {
        subject = `📧 Support Request from ${customerName}`;
        html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 5px 0 0 0; font-size: 14px; opacity: 0.9; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; }
    .info-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: 600; color: #475569; display: inline-block; width: 80px; }
    .value { color: #1e293b; }
    .message-box { background: #fff; border: 1px solid #e2e8f0; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .message-box h3 { margin-top: 0; color: #475569; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .message-content { color: #334155; line-height: 1.8; }
    .footer { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #64748b; border: 1px solid #e2e8f0; border-top: none; }
    .badge { display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📧 Support Request</h1>
    <p>New contact request from TradeZone Voice Assistant</p>
  </div>
  <div class="content">
    <div class="info-box">
      <div class="info-row">
        <span class="label">Name:</span>
        <span class="value">${customerName}</span>
      </div>
      <div class="info-row">
        <span class="label">Email:</span>
        <span class="value"><a href="mailto:${customerEmail}">${customerEmail}</a></span>
      </div>
      <div class="info-row">
        <span class="label">Phone:</span>
        <span class="value"><a href="tel:${customerPhone}">${customerPhone}</a></span>
      </div>
    </div>

    <div class="message-box">
      <h3>Customer Message</h3>
      <div class="message-content">${customerMessage.replace(/\n/g, "<br>")}</div>
    </div>

    ${
      customerNote
        ? `
    <div class="message-box">
      <h3>Additional Notes</h3>
      <div class="message-content">${customerNote.replace(/\n/g, "<br>")}</div>
    </div>
    `
        : ""
    }
  </div>
  <div class="footer">
    <span class="badge">Voice Chat</span>
    <p style="margin-top: 15px;">Sent via Amara, TradeZone's AI Voice Assistant</p>
  </div>
</body>
</html>
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
