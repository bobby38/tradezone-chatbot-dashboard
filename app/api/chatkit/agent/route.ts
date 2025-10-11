import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import {
  handleVectorSearch,
  handlePerplexitySearch,
  handleEmailSend,
} from "@/lib/tools";
import { CHATKIT_DEFAULT_PROMPT } from "@/lib/chatkit/defaultPrompt";
import { findClosestMatch } from "@/lib/chatkit/productCatalog";
import {
  recordAgentTelemetry,
  ToolUsageSummary,
} from "@/lib/chatkit/telemetry";

// CORS headers for widget integration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_ORG_ID = "765e1172-b666-471f-9b42-f80c9b5006de";

// Default Izacc system prompt
const DEFAULT_SYSTEM_PROMPT = CHATKIT_DEFAULT_PROMPT;

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

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const { message, sessionId, history = [] } = await request.json();
  let finalResponse = "";
  let toolSummaries: ToolUsageSummary[] = [];
  let textModel = "gpt-4o-mini"; // Default model

  try {
    if (!message || !sessionId) {
      throw new Error("Missing required fields: message, sessionId");
    }

    // Load settings and system prompt
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", DEFAULT_ORG_ID)
      .single();
    const settings = org?.settings?.chatkit || {};
    textModel = settings.textModel || "gpt-4o-mini";
    const systemPrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    if (history && history.length > 0) {
      history.forEach((msg: any) => {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      });
    }
    messages.push({ role: "user", content: message });

    // First call to OpenAI to determine if tools are needed
    const response = await openai.chat.completions.create({
      model: textModel,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 2000,
    });

    const assistantMessage = response.choices[0].message;

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        let toolResult = "";

        try {
          if (functionName === "searchProducts") {
            toolResult = await handleVectorSearch(functionArgs.query);
          } else if (functionName === "searchtool") {
            toolResult = await handlePerplexitySearch(functionArgs.query);
          } else if (functionName === "sendemail") {
            toolResult = await handleEmailSend(functionArgs);
          }
          toolSummaries.push({
            name: functionName,
            args: functionArgs,
            resultPreview: toolResult.slice(0, 200),
          });
        } catch (error) {
          console.error(`[ChatKit] Tool error:`, error);
          toolResult = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
          toolSummaries.push({
            name: functionName,
            args: functionArgs,
            error: toolResult,
          });
        }

        if (
          (functionName === "searchProducts" ||
            functionName === "searchtool") &&
          (!toolResult ||
            toolResult.includes("No results found") ||
            toolResult.includes("not found"))
        ) {
          const suggestion = await findClosestMatch(functionArgs.query);
          if (suggestion) {
            finalResponse = `I couldn't find anything for \"${functionArgs.query}\". Did you mean \"${suggestion}\"?`;
            break; // Exit loop to return suggestion
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      if (!finalResponse) {
        // If no suggestion was made
        const finalCompletion = await openai.chat.completions.create({
          model: textModel,
          messages,
          temperature: 0.7,
          max_tokens: 2000,
        });
        finalResponse = finalCompletion.choices[0].message.content || "";
      }
    } else {
      finalResponse = assistantMessage.content || "";
    }
  } catch (error) {
    console.error("[ChatKit] Error in POST handler:", error);
    finalResponse =
      "I'm sorry, I ran into an issue processing your request. Please try again.";
  } finally {
    // This block ensures we ALWAYS log and have a valid response
    if (!finalResponse || finalResponse.trim() === "") {
      finalResponse =
        "I apologize, I seem to be having trouble formulating a response. Could you please rephrase that?";
    }

    recordAgentTelemetry({
      timestamp: new Date().toISOString(),
      sessionId,
      prompt: message,
      responsePreview: finalResponse.slice(0, 280),
      model: textModel,
      toolCalls: toolSummaries,
      historyLength: Array.isArray(history) ? history.length : 0,
    });

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
      console.error("[ChatKit] Supabase logging error:", logError);
    }
  }

  return NextResponse.json(
    { response: finalResponse, sessionId, model: textModel },
    { headers: corsHeaders },
  );
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "ChatKit Agent API",
    timestamp: new Date().toISOString(),
  });
}
