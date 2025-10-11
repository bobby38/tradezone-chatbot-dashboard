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

// Security imports
import {
  getClientIdentifier,
  applyRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rateLimit";
import {
  validateChatMessage,
  validationErrorResponse,
  sanitizeMessage,
  estimateTokens,
} from "@/lib/security/validation";
import {
  verifyApiKey,
  verifyOrigin,
  authErrorResponse,
  originErrorResponse,
  isAuthRequired,
} from "@/lib/security/auth";
import {
  logUsage,
  calculateCost,
  isHighUsage,
  logSuspiciousActivity,
  checkDailyBudget,
} from "@/lib/security/monitoring";

// CORS headers - Restrict to your domains only
const ALLOWED_ORIGINS = [
  "https://tradezone.sg",
  "https://www.tradezone.sg",
  "https://rezult.co",
  "https://www.rezult.co",
  "https://trade.rezult.co",
  ...(process.env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:3003"]
    : []),
];

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin =
    origin &&
    ALLOWED_ORIGINS.some((allowed) =>
      origin.includes(allowed.replace("https://", "").replace("http://", "")),
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

function renderCatalogMatches(
  matches: Awaited<ReturnType<typeof findCatalogMatches>>,
) {
  if (!matches.length) return "";
  const lines = matches.map((match, index) => {
    const order = index + 1;
    const price = match.price ? ` — ${match.price}` : "";
    const availability = match.stockStatus
      ? ` (Availability: ${match.stockStatus})`
      : "";
    const title = match.permalink
      ? `[${match.name}](${match.permalink})`
      : match.name;
    const image = match.image ? `\n![${match.name}](${match.image})` : "";
    return `**${order}. ${title}**${price}${availability}${image}`;
  });
  return lines.join("\n\n");
}

async function runHybridSearch(query: string): Promise<HybridSearchResult> {
  let vectorResult = "";
  try {
    vectorResult = await handleVectorSearch(query);
  } catch (vectorError) {
    console.error("[ChatKit] Vector search error:", vectorError);
    vectorResult = "";
  }

  let catalogMatches: Awaited<ReturnType<typeof findCatalogMatches>> = [];
  try {
    catalogMatches = await findCatalogMatches(query, 3);
  } catch (catalogError) {
    console.error("[ChatKit] Catalog fallback error:", catalogError);
    catalogMatches = [];
  }

  if (catalogMatches.length === 0) {
    console.warn("[ChatKit] No catalog matches found for query:", query);
  }

  const catalogSection = catalogMatches.length
    ? `Here are items from the TradeZone catalog that match your request:\n\n${renderCatalogMatches(catalogMatches)}`
    : "";

  const disallowedVectorPatterns = [
    /you mentioned/i,
    /uploaded some files/i,
    /analyze .* uploaded/i,
    /summarize the uploaded/i,
    /within your uploaded/i,
  ];

  const vectorUseful =
    vectorResult &&
    vectorResult.trim().length >= 160 &&
    !/No product information|not found|unavailable|no results|don't have|do not have|not available|no items|no specific|were no|not listed/i.test(
      vectorResult,
    ) &&
    !disallowedVectorPatterns.some((pattern) => pattern.test(vectorResult));

  if (vectorUseful) {
    const combined = catalogSection
      ? `${vectorResult}\n\n${catalogSection}`
      : vectorResult;
    return { result: combined, source: "vector_store" };
  }

  if (catalogSection) {
    return { result: catalogSection, source: "product_catalog" };
  }

  try {
    const fallback = await handlePerplexitySearch(query);
    if (fallback && fallback.trim().length > 0) {
      return { result: fallback, source: "perplexity" };
    }
  } catch (fallbackError) {
    console.error("[ChatKit] Perplexity fallback error:", fallbackError);
  }

  const fallbackMessage =
    vectorResult && vectorResult.trim().length > 0
      ? vectorResult
      : "I could not find a relevant product or article for that request. Please try rephrasing or give me more detail.";
  return { result: fallbackMessage, source: "vector_store" };
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
  const callToAction =
    source === "product_catalog"
      ? "I can reserve stock with the team or notify you when it’s back—just say the word."
      : "Need help comparing options or checking stock? Let me know.";
  return [
    `Here’s what I found for “${query}”:`,
    "",
    result,
    "",
    `_Source: ${sourceLabel}_`,
    "",
    callToAction,
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
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { headers: getCorsHeaders(origin) });
}

async function logToolRun(entry: {
  request_id: string;
  session_id: string;
  tool_name: string;
  args?: any;
  result_preview?: string;
  source?: string;
  success?: boolean;
  latency_ms?: number;
  error_message?: string | null;
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
    });
  } catch (toolLogError) {
    console.error("[ChatKit] tool run log insert failed:", toolLogError);
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const origin = request.headers.get("origin");
  const clientIp = getClientIdentifier(request);

  // ============================================
  // SECURITY LAYER 1: Rate Limiting
  // ============================================
  const ipRateLimit = applyRateLimit(
    clientIp,
    RATE_LIMITS.CHATKIT_PER_IP,
    "/api/chatkit/agent",
  );

  if (!ipRateLimit.allowed) {
    await logSuspiciousActivity("rate_limit_hit", {
      clientIp,
      endpoint: "/api/chatkit/agent",
      metadata: { reason: "ip_rate_limit" },
    });
    return ipRateLimit.response!;
  }

  // ============================================
  // SECURITY LAYER 2: Authentication
  // ============================================
  if (isAuthRequired()) {
    const authResult = verifyApiKey(request);
    if (!authResult.authenticated) {
      await logSuspiciousActivity("auth_failure", {
        clientIp,
        endpoint: "/api/chatkit/agent",
        metadata: { error: authResult.error },
      });
      return authErrorResponse(authResult.error);
    }

    // Verify origin for additional security
    if (!verifyOrigin(request)) {
      await logSuspiciousActivity("auth_failure", {
        clientIp,
        endpoint: "/api/chatkit/agent",
        metadata: { reason: "invalid_origin", origin },
      });
      return originErrorResponse();
    }
  }

  // ============================================
  // SECURITY LAYER 3: Budget Check
  // ============================================
  const budgetCheck = await checkDailyBudget();
  if (budgetCheck.exceeded) {
    console.error("[ChatKit] Daily budget exceeded:", budgetCheck);
    return NextResponse.json(
      {
        error: "Service temporarily unavailable",
        message: "Daily usage limit reached. Please try again tomorrow.",
      },
      {
        status: 503,
        headers: getCorsHeaders(origin),
      },
    );
  }

  // ============================================
  // Parse and validate input
  // ============================================
  let body;
  try {
    body = await request.json();
  } catch (parseError) {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers: getCorsHeaders(origin) },
    );
  }

  const validation = validateChatMessage(body);
  if (!validation.valid) {
    return validationErrorResponse(validation.errors);
  }

  const { message, sessionId, history } = validation.sanitized!;

  // Session-based rate limiting
  const sessionRateLimit = applyRateLimit(
    sessionId,
    RATE_LIMITS.CHATKIT_PER_SESSION,
    "/api/chatkit/agent",
  );

  if (!sessionRateLimit.allowed) {
    await logSuspiciousActivity("rate_limit_hit", {
      sessionId,
      clientIp,
      endpoint: "/api/chatkit/agent",
      metadata: { reason: "session_rate_limit" },
    });
    return sessionRateLimit.response!;
  }

  const requestContext = {
    request_id: requestId,
    session_id: sessionId,
    source: request.headers.get("x-client-source") || "widget",
    user_agent: request.headers.get("user-agent") || null,
    ip_address: clientIp,
  };

  let finalResponse = "";
  let toolSummaries: ToolUsageSummary[] = [];
  let textModel = "gpt-4o-mini"; // Default model
  let lastHybridResult: string | null = null;
  let lastHybridSource: HybridSearchSource | null = null;
  let lastHybridQuery: string | null = null;
  let errorMessage: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;

  try {
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
      max_tokens: 800, // Reduced from 2000 for cost control
    });

    const assistantMessage = response.choices[0].message;

    // Track token usage
    if (response.usage) {
      promptTokens += response.usage.prompt_tokens || 0;
      completionTokens += response.usage.completion_tokens || 0;
    }

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      messages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        let toolResult = "";

        let toolSource: HybridSearchSource | undefined;
        try {
          if (
            functionName === "searchProducts" ||
            functionName === "searchtool"
          ) {
            const toolStart = Date.now();
            const { result, source } = await runHybridSearch(
              functionArgs.query,
            );
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
            error_message:
              error instanceof Error ? error.message : String(error),
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
          max_tokens: 800, // Reduced from 2000 for cost control
        });
        finalResponse = finalCompletion.choices[0].message.content || "";

        // Track second call token usage
        if (finalCompletion.usage) {
          promptTokens += finalCompletion.usage.prompt_tokens || 0;
          completionTokens += finalCompletion.usage.completion_tokens || 0;
        }

        if (lastHybridResult && lastHybridSource && lastHybridQuery) {
          const hasLink = /https?:\/\//i.test(finalResponse);
          const fallback = formatHybridFallback(
            lastHybridQuery,
            lastHybridResult,
            lastHybridSource,
          );

          if (
            isGenericAssistantReply(finalResponse) ||
            (lastHybridSource === "product_catalog" && !hasLink)
          ) {
            finalResponse = fallback;
          } else if (!hasLink) {
            finalResponse = `${finalResponse}\n\n${fallback}`;
          }
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

    // Log repeated errors as suspicious activity
    await logSuspiciousActivity("repeated_errors", {
      sessionId,
      clientIp,
      endpoint: "/api/chatkit/agent",
      metadata: { error: errorMessage },
    });
  } finally {
    // This block ensures we ALWAYS log and have a valid response
    if (!finalResponse || finalResponse.trim() === "") {
      finalResponse =
        "I apologize, I seem to be having trouble formulating a response. Could you please rephrase that?";
    }

    const latencyMs = Date.now() - startedAt;
    const totalTokens = promptTokens + completionTokens;
    const estimatedCost = calculateCost(
      textModel,
      promptTokens,
      completionTokens,
    );

    // Log usage metrics for monitoring
    await logUsage({
      requestId,
      sessionId,
      endpoint: "/api/chatkit/agent",
      model: textModel,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
      latencyMs,
      success: !errorMessage,
      errorMessage,
      clientIp,
      timestamp: new Date().toISOString(),
    });

    // Alert on high usage
    if (isHighUsage(totalTokens, estimatedCost)) {
      console.warn("[ChatKit] High usage detected:", {
        sessionId,
        tokens: totalTokens,
        cost: estimatedCost,
      });
      await logSuspiciousActivity("high_usage", {
        sessionId,
        clientIp,
        endpoint: "/api/chatkit/agent",
        metadata: { totalTokens, estimatedCost },
      });
    }

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
    {
      response: finalResponse,
      sessionId,
      model: textModel,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    },
    { headers: getCorsHeaders(origin) },
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
