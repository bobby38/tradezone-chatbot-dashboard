import { EmailService } from "@/lib/email-service";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { handlePerplexitySearchWithDomain } from "./perplexitySearch";

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
  let referenceCode: string | null = null;
  try {
    if (params.emailType === "trade_in") {
      console.warn(
        "[EmailSend] Trade-in payload attempted via sendemail. Blocking.",
      );
      return "Trade-in submissions must use tradein_update_lead and tradein_submit_lead, not sendemail.";
    }

    // Block only if emailType is explicitly "trade_in" (already handled above)
    // Don't block support questions that mention "trade in" - those are legitimate inquiries
    // The agent should route actual trade-ins to tradein tools, not sendemail

    const phone = params.phone ?? params.phone_number;

    console.log("[EmailSend] Sending support email:", {
      ...params,
      phone,
    });

    // Get AI research hint for staff using cascading Perplexity search
    let aiHint = "";
    let aiSources: string[] = [];
    let searchStrategy = "";
    try {
      console.log(
        "[EmailSend] Starting cascading Perplexity search for staff hint...",
      );

      // Step 1: Always try store-specific search first
      console.log("[EmailSend] Step 1: Searching tradezone.sg...");
      let storeResult = await handlePerplexitySearchWithDomain(params.message, [
        "tradezone.sg",
      ]);

      // Check if store search found useful info
      const noInfoPhrases = [
        "no results",
        "not found",
        "cannot find",
        "no information",
        "don't have",
        "unavailable",
        "unable to find",
      ];

      const storeHasInfo =
        !noInfoPhrases.some((phrase) =>
          storeResult.toLowerCase().includes(phrase),
        ) && storeResult.length > 50;

      let perplexityResult = storeResult;

      if (storeHasInfo) {
        console.log("[EmailSend] ✅ Store search found useful info");
        searchStrategy = "🏪 TradeZone.sg";
      } else {
        // Step 2: If store has no info, try open web search
        console.log(
          "[EmailSend] Step 2: Store search yielded no results, trying open web...",
        );
        const webResult = await handlePerplexitySearchWithDomain(
          params.message,
        );

        const webHasInfo =
          !noInfoPhrases.some((phrase) =>
            webResult.toLowerCase().includes(phrase),
          ) && webResult.length > 50;

        if (webHasInfo) {
          console.log("[EmailSend] ✅ Web search found useful info");
          perplexityResult = `🏪 TradeZone.sg Search: ${storeResult}\n\n🌐 General Web Search:\n${webResult}`;
          searchStrategy = "🏪 TradeZone.sg + 🌐 Web";
        } else {
          console.log("[EmailSend] ⚠️ Both searches yielded no results");
          searchStrategy = "No useful results found";
        }
      }

      // Extract answer and sources from Perplexity response
      const lines = perplexityResult.split("\n");
      const answerLines: string[] = [];
      const sourceLines: string[] = [];
      let inSources = false;

      for (const line of lines) {
        if (line.includes("Source") || line.includes("http")) {
          inSources = true;
          if (line.trim()) sourceLines.push(line.trim());
        } else if (!inSources && line.trim()) {
          answerLines.push(line.trim());
        }
      }

      aiHint = answerLines.join(" ").slice(0, 500); // Keep it concise
      aiSources = sourceLines.slice(0, 3); // Top 3 sources

      console.log("[EmailSend] AI hint generated:", {
        hint: aiHint.slice(0, 100),
        sourcesCount: aiSources.length,
      });
    } catch (error) {
      console.warn("[EmailSend] Could not fetch Perplexity hint:", error);
      // Continue without hint - not critical
    }

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
    referenceCode =
      submissionId.split("-")[0]?.toUpperCase() ||
      submissionId.slice(0, 8).toUpperCase();

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
          reference_code: referenceCode,
          ai_hint: aiHint || undefined,
          ai_sources: aiSources.length > 0 ? aiSources : undefined,
        },
      });

    if (submissionError) {
      console.error("[EmailSend] Submission creation error:", submissionError);
      throw new Error(
        `Failed to create submission: ${submissionError.message}`,
      );
    }

    console.log("[EmailSend] Submission created:", submissionId);

    // Format message with AI research hint
    let enhancedMessage = params.message;
    if (aiHint) {
      enhancedMessage += `\n\n---\n📚 AI Research Hint for Staff (${searchStrategy}):\n${aiHint}`;
      if (aiSources.length > 0) {
        enhancedMessage += `\n\n🔗 Sources:\n${aiSources.join("\n")}`;
      }
    }

    // Send email notification
    const emailSent = await EmailService.sendFormNotification({
      type: "contact",
      submissionId,
      formData: {
        name: params.name,
        email: params.email,
        message: enhancedMessage,
        phone: phone || "Not provided",
        reference_code: referenceCode,
      },
      submittedAt: new Date().toISOString(),
      referenceCode: referenceCode ?? undefined,
    });

    console.log("[EmailSend] Email sent:", emailSent);

    // Return confirmation message
    return `Thanks, ${params.name}! I've passed your inquiry to our team. Reference ID: ${referenceCode}. They'll respond to ${params.email} shortly.`;
  } catch (error) {
    console.error("[EmailSend] Error:", error);
    if (referenceCode) {
      return `I hit a snag submitting your request, but I saved it under reference ${referenceCode}. Please email contactus@tradezone.sg and mention that code so we can follow up.`;
    }
    return "I encountered an error submitting your request. Please try contacting us directly at contactus@tradezone.sg.";
  }
}
