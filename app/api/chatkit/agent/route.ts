import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  handleVectorSearch,
  handlePerplexitySearch,
  handleEmailSend,
} from "@/lib/tools";
import { CHATKIT_DEFAULT_PROMPT } from "@/lib/chatkit/defaultPrompt";
import {
  findCatalogMatches,
  findClosestMatch,
} from "@/lib/chatkit/productCatalog";
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

type HybridSearchSource = "vector_store" | "product_catalog" | "perplexity";

type HybridSearchResult = {
  result: string;
  source: HybridSearchSource;
};

async function runHybridSearch(query: string): Promise<HybridSearchResult> {
  let result = "";
  let source: HybridSearchSource = "vector_store";

  try {
    result = await handleVectorSearch(query);
  } catch (vectorError) {
    console.error("[ChatKit] Vector search error:", vectorError);
    result = "";
  }

  const needsFallback =
    !result ||
    result.trim().length < 80 ||
    /No product information|not found|unavailable/i.test(result);

  if (needsFallback) {
    try {
      const matches = await findCatalogMatches(query, 3);
      if (matches.length) {
        const lines = matches.map((match, index) => {
          const price = match.price ? ` — ${match.price}` : "";
          const availability = match.stockStatus
            ? ` (Availability: ${match.stockStatus})`
            : "";
          const link = match.permalink
            ? `\n• View product: ${match.permalink}`
            : "";
          return `${index + 1}. ${match.name}${price}${availability}${link}`;
        });
        result = `I found these matches in our product catalog:\n\n${lines.join("\n\n")}`;
        source = "product_catalog";
      }
    } catch (catalogError) {
      console.error("[ChatKit] Catalog fallback error:", catalogError);
    }
  }

  if (source !== "product_catalog") {
    try {
      const fallback = await handlePerplexitySearch(query);
      if (fallback && fallback.trim().length > 0) {
        result = fallback;
        source = "perplexity";
      }
    } catch (fallbackError) {
      console.error("[ChatKit] Perplexity fallback error:", fallbackError);
    }
  }

  if (!result || result.trim().length === 0) {
    result =
      "I could not find a relevant product or article for that request. Please try rephrasing or give me more detail.";
  }

  return { result, source };
}

function isGenericAssistantReply(text: string) {
  if (!text) return true;
  const normalized = text.trim().toLowerCase();
  if (normalized.length < 60) return true;
  const patterns = [
    /let me check/,
    /one moment/,
    /hold on/,
    /give me a moment/,
    /i'll look into/i,
    /checking/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function formatHybridFallback(
  query: string,
  result: string,
  source: HybridSearchSource,
) {
  const sourceLabel =
    source === "vector_store"
      ? "TradeZone knowledge base"
      : source === "product_catalog"
        ? "TradeZone product catalog"
        : "TradeZone website";
  return [
    `Here’s what I found for “${query}”:`,
    "",
    result,
    "",
    `_Source: ${sourceLabel}_`,
    "",
    "Would you like more details, pricing comparisons, or help with something else?",
  ].join("\n");
}

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

async function logToolRun(entry: {
  request_id: string
  session_id: string
  tool_name: string
  args?: any
  result_preview?: string
  source?: string
  success?: boolean
  latency_ms?: number
  error_message?: string | null
}) {
  try {
    await supabase.from("chat_tool_runs").insert({
      request_id: entry.request_id,
      session_id: entry.session_id,
      tool_name: entry.tool_name,
      args: entry.args ?? null,
      result_preview: entry.result_preview ?? null,
      source: entry.source ?? null,
      success: entry.success ?? true,
      latency_ms: entry.latency_ms ?? null,
      error_message: entry.error_message ?? null,
    })
  } catch (toolLogError) {
    console.error("[ChatKit] tool run log insert failed:", toolLogError)
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = randomUUID()
  const { message, sessionId, history = [] } = await request.json()
  const requestContext = {
    request_id: requestId,
    session_id: sessionId,
    source: request.headers.get("x-client-source") || "widget",
    user_agent: request.headers.get("user-agent") || null,
    ip_address: request.ip ?? null,
  }
  let finalResponse = ""
  let toolSummaries: ToolUsageSummary[] = []
  let textModel = "gpt-4o-mini" // Default model
  let lastHybridResult: string | null = null
  let lastHybridSource: HybridSearchSource | null = null
  let lastHybridQuery: string | null = null
  let errorMessage: string | null = null

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

        let toolSource: HybridSearchSource | undefined;
        try {
          if (functionName === "searchProducts" || functionName === "searchtool") {
            const toolStart = Date.now();
            const { result, source } = await runHybridSearch(functionArgs.query);
            toolResult = result;
            toolSource = source;
            lastHybridResult = result;
            lastHybridSource = source;
            lastHybridQuery = functionArgs.query;
            const toolLatency = Date.now() - toolStart;
            toolSummaries.push({
              name: functionName,
              args: { ...functionArgs, source },
              resultPreview: result.slice(0, 200),
            });
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: functionName,
              args: functionArgs,
              result_preview: result.slice(0, 280),
              source,
              success: true,
              latency_ms: toolLatency,
            });
          } else if (functionName === "sendemail") {
            const toolStart = Date.now();
            toolResult = await handleEmailSend(functionArgs);
            const toolLatency = Date.now() - toolStart;
            toolSummaries.push({
              name: functionName,
              args: functionArgs,
              resultPreview: toolResult.slice(0, 200),
            });
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: functionName,
              args: functionArgs,
              result_preview: toolResult.slice(0, 280),
              success: true,
              latency_ms: toolLatency,
            });
          } else {
            console.warn("[ChatKit] Unknown tool requested:", functionName);
            toolResult = `Tool ${functionName} is not implemented.`;
          }
        } catch (error) {
          console.error(`[ChatKit] Tool error:`, error);
          toolResult = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
          toolSummaries.push({
            name: functionName,
            args: functionArgs,
            error: toolResult,
          });
          await logToolRun({
            request_id: requestId,
            session_id: sessionId,
            tool_name: functionName,
            args: functionArgs,
            success: false,
            error_message: error instanceof Error ? error.message : String(error),
          });
        }

        if (
          (functionName === "searchProducts" || functionName === "searchtool") &&
          (!toolResult ||
            toolResult.includes("No results found") ||
            toolResult.includes("not found"))
        ) {
          const suggestion = await findClosestMatch(functionArgs.query);
          if (suggestion) {
            finalResponse = `I couldn't find anything for \"${functionArgs.query}\". Did you mean \"${suggestion}\"?`;
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: `${functionName}:suggestion`,
              args: { query: functionArgs.query, suggestion },
              success: true,
            });
            break; // Exit loop to return suggestion
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolSource
            ? `${toolResult}\n\n[Source: ${toolSource}]`
            : toolResult,
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

        if (
          lastHybridResult &&
          lastHybridSource &&
          lastHybridQuery &&
          isGenericAssistantReply(finalResponse)
        ) {
          finalResponse = formatHybridFallback(
            lastHybridQuery,
            lastHybridResult,
            lastHybridSource,
          );
        }
      }
    } else {
      finalResponse = assistantMessage.content || "";
    }
  } catch (error) {
    console.error("[ChatKit] Error in POST handler:", error);
    finalResponse =
      "I'm sorry, I ran into an issue processing your request. Please try again.";
    errorMessage = error instanceof Error ? error.message : "Unknown error";
  } finally {
    // This block ensures we ALWAYS log and have a valid response
    if (!finalResponse || finalResponse.trim() === "") {
      finalResponse =
        "I apologize, I seem to be having trouble formulating a response. Could you please rephrase that?";
    }

    const latencyMs = Date.now() - startedAt;

    try {
      await supabase.from("chat_request_logs").insert({
        ...requestContext,
        prompt: message,
        history_length: Array.isArray(history) ? history.length : 0,
        final_response: finalResponse,
        model: textModel,
        status: errorMessage ? "error" : "success",
        latency_ms: latencyMs,
        tool_summary: toolSummaries.length ? toolSummaries : null,
        error_message: errorMessage,
        request_payload: {
          history,
        },
      });
    } catch (logError) {
      console.error("[ChatKit] request log insert failed:", logError);
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
