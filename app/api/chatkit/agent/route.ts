import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  handleVectorSearch,
  handlePerplexitySearch,
  handleEmailSend,
} from "@/lib/tools";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_ORG_ID = "765e1172-b666-471f-9b42-f80c9b5006de";

// Default Izacc system prompt
const DEFAULT_SYSTEM_PROMPT = `IMPORTANT: "Do NOT include [USER_INPUT: …] or any internal tags in replies."

# Izacc — TradeZone.sg Gaming & Gadget Assistant

You are Izacc from TradeZone.sg, a friendly assistant helping customers with products, prices, trade-ins, and store information.

## Quick Answers (NO tool calls needed):
- TradeZone.sg sells new and second-hand electronics, gaming gear, and gadgets
- Location: 21 Hougang St 51, #02-09, Hougang Green Shopping Mall, Singapore 538719
- Shipping: Flat S$5, 1–3 business days within Singapore
- Payment: PayNow, cards, PayPal
- Returns: Unopened items within 14 days
- Contact: contactus@tradezone.sg, +65 6123 4567

## When to Use Tools:
- Use searchProducts for product queries, stock checks, pricing
- Use searchtool for website policies or general tradezone.sg info
- Use sendemail ONLY when customer explicitly asks to be contacted

Keep replies short, friendly, and gamer-savvy.`;

// Simple function definitions for OpenAI
const tools = [
  {
    type: "function" as const,
    function: {
      name: "searchProducts",
      description: "Search TradeZone products using vector store",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Product search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchtool",
      description: "Search TradeZone.sg website",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sendemail",
      description:
        "Send email for trade-ins or inquiries (only when customer requests contact)",
      parameters: {
        type: "object",
        properties: {
          emailType: {
            type: "string",
            enum: ["trade_in", "info_request", "contact"],
          },
          name: { type: "string" },
          email: { type: "string" },
          message: { type: "string" },
          deviceModel: { type: "string" },
          deviceCondition: { type: "string" },
        },
        required: ["emailType", "name", "email", "message"],
      },
    },
  },
];

export async function POST(request: NextRequest) {
  try {
    const { message, sessionId, history = [] } = await request.json();

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: "Missing required fields: message, sessionId" },
        { status: 400 },
      );
    }

    // Load settings
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();

    const settings = org?.settings?.chatkit || {};
    const textModel = settings.textModel || "gpt-4o-mini";
    const systemPrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    console.log(`[ChatKit] Session: ${sessionId}, Model: ${textModel}`);

    // Build simple messages array - NO complex content types
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: systemPrompt }];

    // Add history as simple text messages only
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role && msg.content && typeof msg.content === "string") {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    // Add current user message
    messages.push({ role: "user", content: message });

    // First call to OpenAI
    let response = await openai.chat.completions.create({
      model: textModel,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 2000,
    });

    let assistantMessage = response.choices[0].message;
    let finalResponse = assistantMessage.content || "";

    // Handle tool calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(
        `[ChatKit] Processing ${assistantMessage.tool_calls.length} tool calls`,
      );

      // Execute each tool
      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[ChatKit] Calling: ${functionName}`, functionArgs);

        let toolResult = "";

        try {
          if (functionName === "searchProducts") {
            toolResult = await handleVectorSearch(functionArgs.query);
          } else if (functionName === "searchtool") {
            toolResult = await handlePerplexitySearch(functionArgs.query);
          } else if (functionName === "sendemail") {
            toolResult = await handleEmailSend(functionArgs);
          }
        } catch (error) {
          console.error(`[ChatKit] Tool error:`, error);
          toolResult = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
        }

        // Add tool result to messages as simple text
        messages.push({
          role: "assistant",
          content: `[Searched: ${functionName}]`,
        });
        messages.push({
          role: "user",
          content: `Search results: ${toolResult}`,
        });
      }

      // Get final response after tools
      const finalCompletion = await openai.chat.completions.create({
        model: textModel,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      finalResponse =
        finalCompletion.choices[0].message.content ||
        "Sorry, I encountered an error.";
    }

    // Log to Supabase
    try {
      await supabase.from("chat_logs").insert({
        session_id: sessionId,
        prompt: message,
        response: finalResponse,
        source: "chatkit",
        user_id: sessionId,
        status: "success",
        created_at: new Date().toISOString(),
        session_name:
          message.substring(0, 50) + (message.length > 50 ? "..." : ""),
      });
    } catch (logError) {
      console.error("[ChatKit] Logging error:", logError);
    }

    return NextResponse.json({
      response: finalResponse,
      sessionId,
      model: textModel,
    });
  } catch (error) {
    console.error("[ChatKit] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to process chat",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "ChatKit Agent API",
    timestamp: new Date().toISOString(),
  });
}
