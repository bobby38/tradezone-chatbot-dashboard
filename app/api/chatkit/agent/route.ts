import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  handleVectorSearch,
  handlePerplexitySearch,
  handleEmailSend,
  type VectorSearchContext,
} from "@/lib/tools";
import {
  ensureTradeInLead,
  submitTradeInLead,
  TradeInValidationError,
  updateTradeInLead,
  getTradeInLeadDetail,
  type TradeInUpdateInput,
} from "@/lib/trade-in/service";
import { CHATKIT_DEFAULT_PROMPT } from "@/lib/chatkit/defaultPrompt";
import { TRADE_IN_SYSTEM_CONTEXT } from "@/lib/chatkit/tradeInPrompts";
import {
  findCatalogMatches,
  findClosestMatch,
} from "@/lib/chatkit/productCatalog";
import {
  recordAgentTelemetry,
  ToolUsageSummary,
} from "@/lib/chatkit/telemetry";
import { ensureSession, getNextTurnIndex } from "@/lib/chatkit/sessionManager";

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
  "https://sabaisensations.com",
  "https://www.sabaisensations.com",
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

// Default Amara system prompt
const DEFAULT_SYSTEM_PROMPT = CHATKIT_DEFAULT_PROMPT;

type HybridSearchSource =
  | "vector_store"
  | "trade_in_vector_store"
  | "product_catalog"
  | "perplexity";

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

function deriveSessionName(
  history: Array<{ role?: string; content?: string }> | undefined,
  latestMessage: string,
): string | null {
  const candidateFromHistory = history?.find(
    (entry) => entry?.role === "user" && typeof entry?.content === "string",
  )?.content;

  const candidate = (candidateFromHistory || latestMessage || "").trim();
  if (!candidate) return null;
  return candidate.slice(0, 120);
}

const TRADE_IN_KEYWORD_PATTERNS = [
  /\btrade[- ]?in\b/i,
  /\btra[iy]n\b/i,
  /\bbuy[- ]?back\b/i,
  /\btop[- ]?up\b/i,
  /\btrade[- ]?up\b/i,
  /\bupgrade\b/i,
  /\bquote\b/i,
  /\boffer\b/i,
  /\bvaluation\b/i,
  /\bpayout\b/i,
  /\bsell (my|the|this)\b/i,
  /\binstant cash\b/i,
];

const TRADE_IN_DEVICE_HINTS =
  /\b(ps ?5|ps ?4|playstation|xbox|switch|steam deck|rog ally|legion go|msi claw|meta quest|dji osmo|iphone|ipad|samsung|mobile phone|console|handheld)\b/i;

const TRADE_IN_ACTION_HINTS =
  /\b(trade|tra[iy]n|sell|worth|value|price|quote|offer|top[- ]?up)\b/i;

const PLACEHOLDER_NAME_TOKENS = new Set([
  "here",
  "there",
  "see",
  "you",
  "see you",
  "thanks",
  "thank",
  "thankyou",
  "thank you",
  "bye",
  "good",
  "later",
  "photo",
  "photos",
  "pic",
  "pics",
  "cash",
  "paynow",
  "bank",
  "ok",
  "okay",
  "none",
  "na",
  "n/a",
  "no",
  "sure",
  "yup",
  "yeah",
  "yep",
  "alright",
  "alrighty",
  "thanks!",
]);

function isPlaceholderName(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length <= 2) return true;
  if (PLACEHOLDER_NAME_TOKENS.has(normalized)) return true;
  return false;
}

function detectTradeInIntent(query: string): boolean {
  const normalized = query.trim();
  if (!normalized) return false;

  if (TRADE_IN_KEYWORD_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  return (
    TRADE_IN_DEVICE_HINTS.test(normalized) &&
    TRADE_IN_ACTION_HINTS.test(normalized)
  );
}

const TRADE_IN_PRICE_OVERRIDES: Array<{
  patterns: RegExp[];
  range: string;
  header: string;
}> = [
  {
    patterns: [/osmo pocket 3/i, /creator combo/i],
    range: "S$350 – S$400",
    header:
      "Approximate trade-in value for the DJI Osmo Pocket 3 Creator Combo: S$350 – S$400 (subject to inspection).",
  },
];

function applyTradeInPriceOverrides(
  text: string,
  query: string,
  source: HybridSearchSource,
): string {
  if (source !== "trade_in_vector_store") {
    return text;
  }

  const corpus = `${query}\n${text}`.toLowerCase();

  for (const override of TRADE_IN_PRICE_OVERRIDES) {
    const matchesAll = override.patterns.every((pattern) =>
      pattern.test(corpus),
    );
    if (!matchesAll) continue;

    const priceRegex = /S\$[\d.,]+(?:\s*[–-]\s*S\$[\d.,]+)?/;
    let updated = text;

    if (priceRegex.test(updated)) {
      updated = updated.replace(priceRegex, override.range);
    } else if (!updated.toLowerCase().includes(override.range.toLowerCase())) {
      updated = `${override.header}\n\n${updated}`;
    }

    if (!updated.toLowerCase().includes("subject to inspection")) {
      updated = `${override.header}\n\n${updated}`;
    }

    return updated;
  }

  return text;
}

function enforceTradeInResponseOverrides(response: string): string {
  const desiredRange = "S$350 – S$400";
  const lower = response.toLowerCase();

  if (lower.includes("osmo pocket 3") && lower.includes("creator combo")) {
    let updated = response;

    const tradeInSentenceRegex =
      /(trade[- ]?in[^.!?\n]{0,120})S\$[0-9][0-9,]*(?:\s*[–-]\s*S\$[0-9][0-9,]*)?/gi;
    updated = updated.replace(tradeInSentenceRegex, (match) => {
      if (match.includes(desiredRange)) {
        return match.includes("subject to inspection")
          ? match
          : match.replace(
              desiredRange,
              `${desiredRange} (subject to inspection)`,
            );
      }
      return match.replace(
        /S\$[0-9][0-9,]*(?:\s*[–-]\s*S\$[0-9][0-9,]*)?/g,
        `${desiredRange} (subject to inspection)`,
      );
    });

    if (!updated.includes(desiredRange)) {
      updated = updated.replace(/osmo pocket 3[^.!?\n]*/i, (segment) => {
        if (segment.includes(desiredRange)) return segment;
        return `${segment.trim()} (trade-in range ${desiredRange} subject to inspection)`;
      });
    }

    updated = updated.replace(
      /(-\s*Device:\s*DJI Osmo Pocket 3 Creator Combo[^\n]*)/i,
      (line) =>
        line
          .replace(/S\$350 – S\$400 \(subject to inspection\)/i, "")
          .trimEnd(),
    );

    return updated;
  }

  return response;
}

const DEVICE_PATTERNS: Array<{
  regex: RegExp;
  brand: string;
  model: string;
}> = [
  { regex: /legion go/i, brand: "Lenovo", model: "Legion Go Gen 1" },
  { regex: /rog ally/i, brand: "Asus", model: "ROG Ally" },
  { regex: /steam deck oled/i, brand: "Valve", model: "Steam Deck OLED" },
  { regex: /steam deck/i, brand: "Valve", model: "Steam Deck" },
  { regex: /switch oled/i, brand: "Nintendo", model: "Switch OLED" },
  { regex: /nintendo switch/i, brand: "Nintendo", model: "Switch" },
  { regex: /playstation 5|ps ?5/i, brand: "Sony", model: "PlayStation 5" },
  { regex: /playstation 4|ps ?4/i, brand: "Sony", model: "PlayStation 4" },
  {
    regex: /xbox series x|\bxsx\b/i,
    brand: "Microsoft",
    model: "Xbox Series X",
  },
  {
    regex: /xbox series s|\bxss\b/i,
    brand: "Microsoft",
    model: "Xbox Series S",
  },
  { regex: /xbox one/i, brand: "Microsoft", model: "Xbox One" },
  { regex: /msi claw/i, brand: "MSI", model: "Claw" },
  {
    regex: /iphone\s*(\d+\s*(pro\s*max|pro)?)?/i,
    brand: "Apple",
    model: "iPhone",
  },
  { regex: /ipad/i, brand: "Apple", model: "iPad" },
  { regex: /meta quest 3/i, brand: "Meta", model: "Quest 3" },
  { regex: /meta quest 2/i, brand: "Meta", model: "Quest 2" },
  { regex: /meta quest/i, brand: "Meta", model: "Quest" },
  { regex: /dji osmo/i, brand: "DJI", model: "Osmo" },
];

function extractTradeInClues(message: string): TradeInUpdateInput {
  const trimmed = message.trim();
  if (!trimmed) {
    return {};
  }

  const lower = message.toLowerCase();
  const normalizedSimple = lower
    .replace(/[\r\n]+/g, " ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const shortPhotoDecline =
    /^(?:no|nope|none|nah|not yet|later|maybe later|not now|can't now|cant now)$/i.test(
      trimmed,
    );

  const patch: TradeInUpdateInput = {};
  if (shortPhotoDecline) {
    patch.notes = "Photos: Not provided — customer has none on hand.";
  }

  if (trimmed.length < 4) {
    return patch;
  }

  const accessories = new Set<string>();

  for (const pattern of DEVICE_PATTERNS) {
    if (pattern.regex.test(message)) {
      patch.brand = patch.brand || pattern.brand;
      patch.model = patch.model || pattern.model;
      break;
    }
  }

  const storageMatch = message.match(/\b(\d+)\s*(tb|gb)\b/i);
  if (storageMatch) {
    patch.storage = `${storageMatch[1]}${storageMatch[2].toUpperCase()}`;
  }

  if (/\ball\s+accessor/i.test(lower) || /\bwith accessories/i.test(lower)) {
    accessories.add("all accessories");
  } else if (/accessor/i.test(lower)) {
    accessories.add("accessories");
  }

  if (/\bbox/i.test(lower)) {
    accessories.add("box");
  }

  if (/charger/i.test(lower)) {
    accessories.add("charger");
  }

  if (accessories.size > 0) {
    patch.accessories = Array.from(accessories);
  }

  if (/\bmint\b/i.test(lower)) {
    patch.condition = "mint";
  } else if (/\bgood\b/i.test(lower)) {
    patch.condition = "good";
  } else if (/\bfair\b/i.test(lower)) {
    patch.condition = "fair";
  } else if (/faulty|broken|defect/i.test(lower)) {
    patch.condition = "faulty";
  }

  if (/cash/i.test(lower)) {
    patch.preferred_payout = "cash";
  } else if (/pay\s*now|paynow/i.test(lower)) {
    patch.preferred_payout = "paynow";
  } else if (/bank/i.test(lower)) {
    patch.preferred_payout = "bank";
  }

  const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) {
    patch.contact_email = emailMatch[0];
  }

  const phoneMatch = message.match(/\+?\d[\d\s-]{7,}/);
  if (phoneMatch) {
    patch.contact_phone = phoneMatch[0].replace(/\s+/g, " ").trim();
  }

  const declinedWithContext =
    /\b(?:no|not|dont|do not|cant|cannot|havent|without)\b(?:\s+\w+){0,2}\s+(?:photo|photos|picture|pictures|pic|pics|image|images|media)\b/.test(
      normalizedSimple,
    ) ||
    /\b(?:photo|photos|picture|pictures|pic|pics|image|images|media)\b\s+(?:not|n't)\s+(?:available|provided|ready|with\s+me|on\s+hand|yet)\b/.test(
      normalizedSimple,
    ) ||
    /\b(?:send|share)\b\s+(?:them\s+)?(?:photo|photos|picture|pictures|pic|pics|image|images|media)\b\s+(?:later|tomorrow|another time|next time)\b/.test(
      normalizedSimple,
    ) ||
    /\b(?:cant|can't|cannot|unable)\b(?:\s+to)?\s+(?:send|share)\b(?:\s+\w+){0,2}\s+(?:photo|photos|picture|pictures|pic|pics|image|images|media)\b/.test(
      normalizedSimple,
    );

  if (!patch.notes && (declinedWithContext || shortPhotoDecline)) {
    patch.notes = "Photos: Not provided — customer has none on hand.";
  }

  const scrubbed = message
    .replace(emailMatch ? emailMatch[0] : "", " ")
    .replace(phoneMatch ? phoneMatch[0] : "", " ")
    .replace(/all accessories?/gi, " ")
    .replace(/yes|yeah|yep|sure|okay|ok/gi, " ")
    .replace(/cash|paynow|bank transfer?/gi, " ")
    .replace(/[,.;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!patch.contact_name && scrubbed.length >= 2) {
    const candidateTokens = scrubbed
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => {
        if (!token) return false;
        if (!/^[A-Za-z][A-Za-z'\-]{1,}$/.test(token)) return false;
        return !PLACEHOLDER_NAME_TOKENS.has(token.toLowerCase());
      });

    if (candidateTokens.length > 0) {
      const candidateName = candidateTokens.slice(0, 3).join(" ");
      if (!isPlaceholderName(candidateName)) {
        patch.contact_name = candidateName;
      }
    }
  }

  return patch;
}

async function autoSubmitTradeInLeadIfComplete(params: {
  leadId: string;
  requestId: string;
  sessionId: string;
}): Promise<{ status?: string } | null> {
  try {
    const detail = await getTradeInLeadDetail(params.leadId);
    if (!detail) return null;

    const alreadyNotified = Array.isArray(detail.trade_in_actions)
      ? detail.trade_in_actions.some(
          (action: any) => action.action_type === "email_sent",
        )
      : false;

    const hasDevice = Boolean(detail.brand && detail.model);
    const hasContact = Boolean(detail.contact_name && detail.contact_phone);
    const hasEmail = Boolean(detail.contact_email);
    const hasPayout = Boolean(detail.preferred_payout);
    const photoAcknowledged =
      (Array.isArray(detail.trade_in_media) &&
        detail.trade_in_media.length > 0) ||
      (typeof detail.notes === "string" &&
        /photos?:\s*not provided/i.test(detail.notes)) ||
      (typeof detail.source_message_summary === "string" &&
        /photos?:\s*not provided/i.test(detail.source_message_summary));

    if (
      alreadyNotified ||
      !hasDevice ||
      !hasContact ||
      !hasEmail ||
      !hasPayout ||
      !photoAcknowledged
    ) {
      return null;
    }

    const summary = await buildTradeInSummary(params.leadId);
    const newStatus =
      detail.status && detail.status !== "new" ? detail.status : "in_review";

    const { lead, emailSent } = await submitTradeInLead({
      leadId: params.leadId,
      summary: summary || undefined,
      notify: true,
      status: newStatus,
    });

    await logToolRun({
      request_id: params.requestId,
      session_id: params.sessionId,
      tool_name: "tradein_submit_lead_auto",
      args: { leadId: params.leadId, status: newStatus },
      result_preview: emailSent
        ? "Auto-submitted trade-in lead and emailed staff."
        : "Auto-submitted trade-in lead (email failed).",
      source: "trade_in_lead",
      success: emailSent,
      latency_ms: 0,
    });

    return { status: lead.status || newStatus };
  } catch (autoSubmitError) {
    console.error(
      "[ChatKit] Auto submit trade-in lead failed",
      autoSubmitError,
    );
    await logToolRun({
      request_id: params.requestId,
      session_id: params.sessionId,
      tool_name: "tradein_submit_lead_auto",
      args: { leadId: params.leadId },
      result_preview: "Failed to auto-submit trade-in lead.",
      source: "trade_in_lead",
      success: false,
      latency_ms: 0,
      error_message:
        autoSubmitError instanceof Error
          ? autoSubmitError.message
          : String(autoSubmitError),
    });
    return null;
  }
}

async function runHybridSearch(
  query: string,
  context?: VectorSearchContext,
): Promise<HybridSearchResult> {
  const searchStartTime = Date.now();
  let vectorResult = "";
  let vectorSource: HybridSearchSource = "vector_store";
  let vectorLatency = 0;
  let catalogLatency = 0;
  let perplexityLatency = 0;

  let responseMatches: Awaited<ReturnType<typeof findCatalogMatches>> = [];

  try {
    const vectorStart = Date.now();
    const response = await handleVectorSearch(query, context);
    vectorLatency = Date.now() - vectorStart;
    vectorResult = response.text;
    vectorSource =
      response.store === "trade_in" ? "trade_in_vector_store" : "vector_store";
    responseMatches = response.matches || [];

    if (vectorLatency > 2000) {
      console.warn(
        `[ChatKit] Slow vector search: ${vectorLatency}ms for query: "${query.substring(0, 50)}"`,
      );
    }
  } catch (vectorError) {
    console.error("[ChatKit] Vector search error:", vectorError);
    vectorResult = "";
    vectorSource = "vector_store";
  }

  let catalogMatches = responseMatches;
  if (vectorSource !== "trade_in_vector_store" && catalogMatches.length === 0) {
    try {
      const catalogStart = Date.now();
      catalogMatches = await findCatalogMatches(query, 3);
      catalogLatency = Date.now() - catalogStart;

      if (catalogLatency > 500) {
        console.warn(
          `[ChatKit] Slow catalog search: ${catalogLatency}ms for query: "${query.substring(0, 50)}"`,
        );
      }
    } catch (catalogError) {
      console.error("[ChatKit] Catalog fallback error:", catalogError);
      catalogMatches = [];
    }

    if (catalogMatches.length === 0) {
      console.warn("[ChatKit] No catalog matches found for query:", query);
    }
  }

  const catalogSection =
    catalogMatches.length > 0
      ? `Here are items from the TradeZone catalog that match your request:\n\n${renderCatalogMatches(catalogMatches)}`
      : "";

  const disallowedVectorPatterns = [
    /you mentioned/i,
    /uploaded some files/i,
    /analyze .* uploaded/i,
    /summarize the uploaded/i,
    /within your uploaded/i,
    /could you please clarify/i,
    /let me know how i can assist/i,
    /if you want information from your uploaded/i,
    /please specify what details/i,
    /looking for recommendations or reviews/i,
  ];

  // 🔴 CRITICAL: For trade-in queries, ALWAYS trust the vector store - never fall back to Perplexity
  const isTradeInQuery = vectorSource === "trade_in_vector_store";

  const vectorUseful =
    vectorResult &&
    vectorResult.trim().length >= 160 &&
    !/No product information|not found|unavailable|no results|don't have|do not have|not available|no items|no specific|were no|not listed/i.test(
      vectorResult,
    ) &&
    !disallowedVectorPatterns.some((pattern) => pattern.test(vectorResult));

  // For trade-in queries, use vector result even if short (pricing data is concise)
  if (vectorUseful || (isTradeInQuery && vectorResult.trim().length > 0)) {
    const combined = catalogSection
      ? `${vectorResult}\n\n${catalogSection}`
      : vectorResult;
    const adjusted = applyTradeInPriceOverrides(combined, query, vectorSource);
    console.log(
      `[ChatKit] Using ${isTradeInQuery ? "TRADE-IN" : "vector"} result (${vectorResult.length} chars)`,
    );
    return { result: adjusted, source: vectorSource };
  }

  if (catalogSection) {
    const totalLatency = Date.now() - searchStartTime;
    if (totalLatency > 3000) {
      console.warn(
        `[ChatKit] Slow hybrid search (catalog path): ${totalLatency}ms total`,
      );
    }
    return { result: catalogSection, source: "product_catalog" };
  }

  try {
    const perplexityStart = Date.now();
    const fallback = await handlePerplexitySearch(query);
    perplexityLatency = Date.now() - perplexityStart;

    if (perplexityLatency > 3000) {
      console.warn(
        `[ChatKit] Slow Perplexity search: ${perplexityLatency}ms for query: "${query.substring(0, 50)}"`,
      );
    }

    if (fallback && fallback.trim().length > 0) {
      const totalLatency = Date.now() - searchStartTime;
      console.log(
        `[ChatKit] Hybrid search completed: vector=${vectorLatency}ms, catalog=${catalogLatency}ms, perplexity=${perplexityLatency}ms, total=${totalLatency}ms`,
      );
      return { result: fallback, source: "perplexity" };
    }
  } catch (fallbackError) {
    console.error("[ChatKit] Perplexity fallback error:", fallbackError);
  }

  const fallbackMessage =
    vectorResult && vectorResult.trim().length > 0
      ? vectorResult
      : "I could not find a relevant product or article for that request. Please try rephrasing or give me more detail.";

  const totalLatency = Date.now() - searchStartTime;
  if (totalLatency > 3000) {
    console.warn(
      `[ChatKit] Slow hybrid search (fallback path): ${totalLatency}ms total`,
    );
  }

  return { result: fallbackMessage, source: vectorSource };
}

async function buildTradeInSummary(leadId: string) {
  try {
    const { data: lead } = await supabase
      .from("trade_in_leads")
      .select(
        `brand, model, storage, condition, accessories, preferred_payout,
         contact_name, contact_phone, contact_email, notes,
         trade_in_media ( id )`,
      )
      .eq("id", leadId)
      .maybeSingle();

    if (!lead) return null;

    const device = [lead.brand, lead.model, lead.storage]
      .filter(Boolean)
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");
    const accessories = Array.isArray(lead.accessories)
      ? lead.accessories.join(", ")
      : lead.accessories || "None";
    const photosProvided = lead.trade_in_media?.length
      ? "Provided"
      : "Not provided — final quote upon inspection";

    return [
      "Trade-In Context Summary:",
      device ? `Device: ${device}` : null,
      lead.condition ? `Condition: ${lead.condition}` : null,
      accessories ? `Accessories: ${accessories}` : null,
      lead.preferred_payout
        ? `Payout Preference: ${lead.preferred_payout}`
        : null,
      lead.contact_name || lead.contact_email || lead.contact_phone
        ? `Contact: ${[lead.contact_name, lead.contact_phone, lead.contact_email].filter(Boolean).join(" · ")}`
        : null,
      `Photos: ${photosProvided}`,
      lead.notes ? `Latest Notes: ${lead.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  } catch (err) {
    console.error("[ChatKit] Failed to build trade-in summary", err);
    return null;
  }
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
      : source === "trade_in_vector_store"
        ? "TradeZone trade-in knowledge base"
        : source === "product_catalog"
          ? "TradeZone product catalog"
          : "TradeZone website";
  const callToAction =
    source === "product_catalog"
      ? "I can reserve stock with the team or notify you when it’s back—just say the word."
      : source === "trade_in_vector_store"
        ? "Need a precise quote or want to submit photos? I can guide you through the trade-in form."
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

function buildMissingTradeInFieldPrompt(detail: any): string | null {
  if (!detail) return null;

  const hasDevice = Boolean(detail.brand && detail.model);
  const hasCondition = Boolean(detail.condition);
  const accessoriesCaptured = Array.isArray(detail.accessories)
    ? detail.accessories.length > 0
    : Boolean(detail.accessories);
  const hasContactName = Boolean(detail.contact_name);
  const hasContactPhone = Boolean(detail.contact_phone);
  const hasContactEmail = Boolean(detail.contact_email);
  const hasPayout = Boolean(detail.preferred_payout);
  const hasAnyPhoto = Array.isArray(detail.trade_in_media)
    ? detail.trade_in_media.length > 0
    : false;
  const photoAcknowledged =
    hasAnyPhoto ||
    (typeof detail.notes === "string" &&
      /photos?:\s*not provided/i.test(detail.notes)) ||
    (typeof detail.source_message_summary === "string" &&
      /photos?:\s*not provided/i.test(detail.source_message_summary));

  const steps: Array<{ missing: boolean; message: string }> = [
    {
      missing: !hasDevice,
      message:
        'Ask: "What device are we trading? Brand and model?" Save brand/model before moving on.',
    },
    {
      missing: !hasCondition,
      message: 'Ask: "Condition? (mint, good, fair, faulty?)" then save it.',
    },
    {
      missing: !accessoriesCaptured,
      message: 'Ask: "Accessories or box included?" and save accessories.',
    },
    {
      missing: !hasContactName,
      message: 'Ask: "What name should I note down?" and save contact_name.',
    },
    {
      missing: !hasContactPhone,
      message: 'Ask: "Best phone number?" and save contact_phone.',
    },
    {
      missing: !hasContactEmail,
      message:
        'Ask for the email address: provider first ("Gmail, Hotmail, Outlook?") then the part before @. Read it back and save contact_email.',
    },
    {
      missing: !photoAcknowledged,
      message:
        'Ask: "Got photos? Helps us quote faster." If they say no, respond "Photos noted as not provided" and save it.',
    },
    {
      missing: !hasPayout,
      message:
        'Ask: "Cash, PayNow, or bank?" and save preferred payout before submitting.',
    },
  ];

  const nextStep = steps.find((step) => step.missing);
  if (!nextStep) return null;

  return [
    `🔴 Trade-in task: ${nextStep.message}`,
    "Keep reply ≤12 words, wait for the answer, then acknowledge briefly.",
  ].join("\n");
}

function isImageDownloadError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    message?: string;
    code?: string | null;
    error?: { code?: string | null; message?: string };
  };
  const message =
    err.message || err.error?.message || (error as Error)?.message || "";
  const code = err.code || err.error?.code || "";

  return (
    (typeof message === "string" &&
      /timeout while downloading/i.test(message)) ||
    code === "invalid_image_url"
  );
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
        "Escalate a support request to TradeZone staff when the customer explicitly asks for human follow-up and you cannot resolve the issue. Never use this for trade-in submissions.",
      parameters: {
        type: "object",
        properties: {
          emailType: {
            type: "string",
            enum: ["info_request", "contact"],
          },
          name: { type: "string" },
          email: { type: "string" },
          message: { type: "string" },
          phone: { type: "string" },
          phone_number: { type: "string" },
        },
        required: ["emailType", "name", "email", "message"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "tradein_update_lead",
      description:
        "Persist trade-in lead information (brand, model, condition, contact, price range). leadId is handled automatically.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string" },
          brand: { type: "string" },
          model: { type: "string" },
          storage: { type: "string" },
          condition: {
            type: "string",
            enum: ["mint", "good", "fair", "faulty"],
          },
          accessories: {
            type: "array",
            items: { type: "string" },
          },
          defects: {
            type: "array",
            items: { type: "string" },
          },
          purchase_year: { type: "number" },
          price_hint: { type: ["number", "string", "null"] },
          range_min: { type: ["number", "string", "null"] },
          range_max: { type: ["number", "string", "null"] },
          pricing_version: { type: "string" },
          preferred_payout: {
            type: "string",
            enum: ["cash", "paynow", "bank"],
          },
          preferred_fulfilment: {
            type: "string",
            enum: ["walk_in", "pickup", "courier"],
          },
          contact_name: { type: "string" },
          contact_phone: { type: "string" },
          contact_email: { type: "string" },
          telegram_handle: { type: "string" },
          notes: { type: "string" },
          status: {
            type: "string",
            enum: [
              "new",
              "in_review",
              "quoted",
              "awaiting_customer",
              "scheduled",
              "completed",
              "closed",
              "archived",
            ],
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "tradein_submit_lead",
      description:
        "Finalize the trade-in lead, send notifications, and provide a summary. leadId handled automatically.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string" },
          notify: { type: "boolean" },
          status: {
            type: "string",
            enum: [
              "in_review",
              "quoted",
              "awaiting_customer",
              "scheduled",
              "completed",
              "closed",
              "archived",
            ],
          },
        },
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
    const response = ipRateLimit.response!;
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([key, value]) =>
      response.headers.set(key, value as string),
    );
    return response;
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
      return authErrorResponse(authResult.error, getCorsHeaders(origin));
    }

    // Verify origin for additional security
    if (!verifyOrigin(request)) {
      await logSuspiciousActivity("auth_failure", {
        clientIp,
        endpoint: "/api/chatkit/agent",
        metadata: { reason: "invalid_origin", origin },
      });
      return originErrorResponse(getCorsHeaders(origin));
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
    return validationErrorResponse(
      validation.errors,
      400,
      getCorsHeaders(origin),
    );
  }

  const { message, sessionId, history, image } = validation.sanitized!;
  const sessionName = deriveSessionName(history, message);

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
    const response = sessionRateLimit.response!;
    const corsHeaders = getCorsHeaders(origin);
    Object.entries(corsHeaders).forEach(([key, value]) =>
      response.headers.set(key, value as string),
    );
    return response;
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
  let tradeInLeadId: string | null = null;
  let tradeInLeadStatus: string | null = null;
  let tradeInIntent = false;
  let tradeInLeadDetail: any = null;
  let autoExtractedClues: TradeInUpdateInput | null = null;

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
      // Always include trade-in context so agent knows to use tools throughout conversation
      { role: "system", content: TRADE_IN_SYSTEM_CONTEXT },
    ];

    if (history && history.length > 0) {
      history.forEach((msg: any) => {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      });
    }
    const userMessage: OpenAI.Chat.ChatCompletionMessageParam = image
      ? {
          role: "user",
          content: [
            { type: "text", text: message },
            { type: "image_url", image_url: { url: image } },
          ],
        }
      : { role: "user", content: message };

    messages.push(userMessage);

    tradeInIntent = detectTradeInIntent(message);

    // Check if there's an existing trade-in lead for this session
    // This ensures we don't lose context mid-conversation
    try {
      const { data: existingLead } = await supabase
        .from("trade_in_leads")
        .select("id, status")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLead) {
        tradeInLeadId = existingLead.id;
        tradeInLeadStatus = existingLead.status;
        tradeInIntent = true; // Force trade-in mode if active lead exists

        // Add current trade-in summary
        const tradeInSummary = await buildTradeInSummary(existingLead.id);
        if (tradeInSummary) {
          messages.splice(2, 0, { role: "system", content: tradeInSummary });
        }
      } else if (tradeInIntent) {
        // Create new lead only if trade-in intent detected and no existing lead
        const ensureResult = await ensureTradeInLead({
          sessionId,
          channel: "chat",
          initialMessage: message,
          source: "chatkit.agent",
        });
        tradeInLeadId = ensureResult.leadId;
        tradeInLeadStatus = ensureResult.status;

        // Add current trade-in summary if available
        const tradeInSummary = await buildTradeInSummary(ensureResult.leadId);
        if (tradeInSummary) {
          messages.splice(2, 0, { role: "system", content: tradeInSummary });
        }
      }
    } catch (ensureError) {
      console.error("[ChatKit] ensureTradeInLead failed", ensureError);
      tradeInIntent = false;
    }

    if (tradeInIntent && tradeInLeadId) {
      autoExtractedClues = extractTradeInClues(message);
      if (autoExtractedClues && Object.keys(autoExtractedClues).length > 0) {
        try {
          const { lead } = await updateTradeInLead(
            tradeInLeadId,
            autoExtractedClues,
          );
          tradeInLeadStatus = lead.status;

          await logToolRun({
            request_id: requestId,
            session_id: sessionId,
            tool_name: "tradein_update_lead_auto",
            args: { ...autoExtractedClues, leadId: tradeInLeadId },
            result_preview: "Auto-saved trade-in details from user message.",
            source: "trade_in_lead",
            success: true,
            latency_ms: 0,
          });
        } catch (autoError) {
          console.error("[ChatKit] Auto trade-in update failed", autoError);
          await logToolRun({
            request_id: requestId,
            session_id: sessionId,
            tool_name: "tradein_update_lead_auto",
            args: { ...autoExtractedClues, leadId: tradeInLeadId },
            result_preview: "Failed to auto-save trade-in details.",
            source: "trade_in_lead",
            success: false,
            latency_ms: 0,
            error_message:
              autoError instanceof Error
                ? autoError.message
                : String(autoError),
          });
        }
      }
    }

    if (tradeInIntent && tradeInLeadId) {
      try {
        tradeInLeadDetail = await getTradeInLeadDetail(tradeInLeadId);
      } catch (detailError) {
        console.error("[ChatKit] Failed to fetch trade-in detail", detailError);
      }

      const missingPrompt = buildMissingTradeInFieldPrompt(tradeInLeadDetail);
      if (missingPrompt) {
        messages.push({ role: "system", content: missingPrompt });
      }
    }

    // First call to OpenAI to determine if tools are needed
    // 🔴 CRITICAL FIX: Force searchProducts for trade-in pricing queries
    const isTradeInPricingQuery =
      detectTradeInIntent(message) &&
      /\b(price|worth|value|quote|offer|how much|goes? for|typically|payout|cash out)\b/i.test(
        message,
      );

    const toolChoice = isTradeInPricingQuery
      ? { type: "function" as const, function: { name: "searchProducts" } }
      : ("auto" as const);

    console.log("[ChatKit] Tool choice:", {
      isTradeInPricingQuery,
      toolChoice: isTradeInPricingQuery ? "FORCED searchProducts" : "auto",
    });

    const userMessageIndex = messages.length - 1;
    let imageStrippedForTimeout = false;

    const execChatCompletion = async () =>
      openai.chat.completions.create({
        model: textModel,
        messages,
        tools,
        tool_choice: toolChoice,
        temperature: 0.7,
        max_tokens: 800, // Reduced from 2000 for cost control
      });

    let response;
    try {
      response = await execChatCompletion();
    } catch (initialError) {
      if (
        image &&
        !imageStrippedForTimeout &&
        isImageDownloadError(initialError)
      ) {
        console.warn(
          "[ChatKit] Image download failed for OpenAI. Retrying without image.",
          { sessionId, image },
        );
        messages[userMessageIndex] = { role: "user", content: message };
        imageStrippedForTimeout = true;
        response = await execChatCompletion();
      } else {
        throw initialError;
      }
    }

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
            const rawQuery =
              typeof functionArgs.query === "string"
                ? functionArgs.query.trim()
                : "";

            if (!rawQuery) {
              const warningMessage =
                "I need the exact model name or more details to check pricing.";
              console.warn(
                `[ChatKit] ${functionName} called without a usable query`,
                {
                  args: functionArgs,
                  sessionId,
                },
              );
              toolResult = warningMessage;
              toolSummaries.push({
                name: functionName,
                args: functionArgs,
                resultPreview: warningMessage,
              });
              await logToolRun({
                request_id: requestId,
                session_id: sessionId,
                tool_name: functionName,
                args: functionArgs,
                result_preview: warningMessage,
                success: false,
                latency_ms: Date.now() - toolStart,
                error_message: "Missing search query",
              });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: warningMessage,
              });
              continue;
            }

            const isTradeInIntent =
              detectTradeInIntent(rawQuery) ||
              tradeInIntent ||
              Boolean(tradeInLeadId);
            console.log(`[ChatKit] 🔍 Tool called: ${functionName}`, {
              query: rawQuery,
              isTradeInIntent,
              sessionId,
            });
            const vectorContext: VectorSearchContext | undefined =
              isTradeInIntent
                ? { intent: "trade_in", toolUsed: functionName }
                : { toolUsed: functionName };
            console.log(`[ChatKit] Vector context:`, vectorContext);
            const { result, source } = await runHybridSearch(
              rawQuery,
              vectorContext,
            );
            toolResult = result;
            toolSource = source;
            lastHybridResult = result;
            lastHybridSource = source;
            lastHybridQuery = rawQuery;
            const toolLatency = Date.now() - toolStart;
            const loggedArgs = { ...functionArgs, query: rawQuery };
            toolSummaries.push({
              name: functionName,
              args: { ...loggedArgs, source },
              resultPreview: result.slice(0, 200),
            });
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: functionName,
              args: loggedArgs,
              result_preview: result.slice(0, 280),
              source,
              success: true,
              latency_ms: toolLatency,
            });
          } else if (functionName === "tradein_update_lead") {
            const toolStart = Date.now();
            try {
              if (!tradeInLeadId) {
                const ensured = await ensureTradeInLead({
                  sessionId,
                  channel: "chat",
                  initialMessage: message,
                  source: "chatkit.agent.autostart",
                });
                tradeInLeadId = ensured.leadId;
                tradeInLeadStatus = ensured.status;
              }

              if (!tradeInLeadId) {
                throw new Error("Unable to obtain trade-in lead ID");
              }

              const patch = functionArgs as TradeInUpdateInput;
              const { lead } = await updateTradeInLead(tradeInLeadId, patch);
              tradeInLeadStatus = lead.status;

              const updatedFields = Object.keys(patch);
              const fieldSummary = updatedFields.length
                ? updatedFields.join(", ")
                : "no fields";

              toolResult = `Saved trade-in lead. Updated ${fieldSummary}. Current status: ${lead.status}.`;
              toolSummaries.push({
                name: functionName,
                args: { ...patch, leadId: tradeInLeadId },
                resultPreview: toolResult.slice(0, 200),
              });

              const toolLatency = Date.now() - toolStart;
              await logToolRun({
                request_id: requestId,
                session_id: sessionId,
                tool_name: functionName,
                args: { ...patch, leadId: tradeInLeadId },
                result_preview: toolResult.slice(0, 280),
                source: "trade_in_lead",
                success: true,
                latency_ms: toolLatency,
              });
            } catch (err) {
              const toolLatency = Date.now() - toolStart;
              if (err instanceof TradeInValidationError) {
                toolResult = `Validation error: ${err.message}`;
              } else {
                toolResult = "Failed to save trade-in details. Please retry.";
              }

              await logToolRun({
                request_id: requestId,
                session_id: sessionId,
                tool_name: functionName,
                args: functionArgs,
                result_preview: toolResult.slice(0, 280),
                source: "trade_in_lead",
                success: false,
                latency_ms: toolLatency,
                error_message: err instanceof Error ? err.message : String(err),
              });
            }
          } else if (functionName === "tradein_submit_lead") {
            const toolStart = Date.now();
            try {
              if (!tradeInLeadId) {
                const ensured = await ensureTradeInLead({
                  sessionId,
                  channel: "chat",
                  initialMessage: message,
                  source: "chatkit.agent.autostart",
                });
                tradeInLeadId = ensured.leadId;
                tradeInLeadStatus = ensured.status;
              }

              if (!tradeInLeadId) {
                throw new Error("Unable to obtain trade-in lead ID");
              }

              const submitArgs = functionArgs as {
                summary?: string;
                notify?: boolean;
                status?: string;
              };

              const { emailSent } = await submitTradeInLead({
                leadId: tradeInLeadId,
                summary: submitArgs.summary,
                notify: submitArgs.notify,
                status: submitArgs.status,
              });

              toolResult = emailSent
                ? "Trade-in lead submitted and email notification sent."
                : "Trade-in lead submitted (email notification disabled).";
              toolSummaries.push({
                name: functionName,
                args: { ...submitArgs, leadId: tradeInLeadId },
                resultPreview: toolResult,
              });

              const toolLatency = Date.now() - toolStart;
              await logToolRun({
                request_id: requestId,
                session_id: sessionId,
                tool_name: functionName,
                args: { ...submitArgs, leadId: tradeInLeadId },
                result_preview: toolResult.slice(0, 280),
                source: "trade_in_lead",
                success: true,
                latency_ms: toolLatency,
              });
            } catch (err) {
              const toolLatency = Date.now() - toolStart;
              if (err instanceof TradeInValidationError) {
                toolResult = `Validation error: ${err.message}`;
              } else {
                toolResult = "Failed to submit trade-in lead.";
              }
              await logToolRun({
                request_id: requestId,
                session_id: sessionId,
                tool_name: functionName,
                args: functionArgs,
                result_preview: toolResult.slice(0, 280),
                source: "trade_in_lead",
                success: false,
                latency_ms: toolLatency,
                error_message: err instanceof Error ? err.message : String(err),
              });
            }
          } else if (functionName === "sendemail") {
            const toolStart = Date.now();
            const normalizedArgs = {
              ...functionArgs,
              phone:
                functionArgs.phone ??
                functionArgs.phone_number ??
                functionArgs.phoneNumber ??
                undefined,
            };
            toolResult = await handleEmailSend(normalizedArgs);
            const toolLatency = Date.now() - toolStart;
            toolSummaries.push({
              name: functionName,
              args: normalizedArgs,
              resultPreview: toolResult.slice(0, 200),
            });
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: functionName,
              args: normalizedArgs,
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
          const rawQuery =
            typeof functionArgs.query === "string"
              ? functionArgs.query.trim()
              : "";
          const suggestion = rawQuery ? await findClosestMatch(rawQuery) : null;
          if (suggestion) {
            finalResponse = `I couldn't find anything for \"${rawQuery}\". Did you mean \"${suggestion}\"?`;
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: `${functionName}:suggestion`,
              args: { query: rawQuery, suggestion },
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

      // 🔴 CRITICAL: Add system reminder to enforce concise responses after tool calls
      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        messages.push({
          role: "system",
          content:
            "🔴 REMINDER: Extract ONLY the key info from the tool results above (price, condition, etc.). Respond in MAX 2-3 SHORT sentences. DO NOT copy/paste or repeat verbose details. Be CONCISE and conversational. Avoid filler like “Let me check” or “One moment” — go straight to the answer.",
        });
      }

      if (!finalResponse) {
        // If no suggestion was made
        const execFinalCompletion = async () =>
          openai.chat.completions.create({
            model: textModel,
            messages,
            temperature: 0.7,
            max_tokens: 800, // Reduced from 2000 for cost control
          });

        let finalCompletion;
        try {
          finalCompletion = await execFinalCompletion();
        } catch (finalError) {
          if (
            image &&
            !imageStrippedForTimeout &&
            isImageDownloadError(finalError)
          ) {
            console.warn(
              "[ChatKit] Final response image fetch failed, retrying without image.",
              { sessionId, image },
            );
            messages[userMessageIndex] = { role: "user", content: message };
            imageStrippedForTimeout = true;
            finalCompletion = await execFinalCompletion();
          } else {
            throw finalError;
          }
        }
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

          // 🔴 CRITICAL: For trade-in queries, NEVER append verbose fallback
          // The LLM already has the concise response from the system reminder
          const isTradeInQuery = lastHybridSource === "trade_in_vector_store";

          if (
            isGenericAssistantReply(finalResponse) ||
            (lastHybridSource === "product_catalog" && !hasLink)
          ) {
            finalResponse = fallback;
          } else if (
            !hasLink &&
            !isTradeInQuery &&
            lastHybridSource !== "vector_store"
          ) {
            // Only append fallback for non-trade-in queries
            finalResponse = `${finalResponse}\n\n${fallback}`;
          }
          // For trade-in queries: keep the concise LLM response, don't append fallback
        }
      }
    } else {
      finalResponse = assistantMessage.content || "";
    }

    const noToolCalls =
      !assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0;
    if (tradeInIntent && tradeInLeadId && noToolCalls) {
      const autoSubmitResult = await autoSubmitTradeInLeadIfComplete({
        leadId: tradeInLeadId,
        requestId,
        sessionId,
      });
      if (autoSubmitResult?.status) {
        tradeInLeadStatus = autoSubmitResult.status;
      }
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

    finalResponse = enforceTradeInResponseOverrides(finalResponse);

    const nowIso = new Date().toISOString();
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
      timestamp: nowIso,
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
      timestamp: nowIso,
      sessionId,
      prompt: message,
      responsePreview: finalResponse.slice(0, 280),
      model: textModel,
      toolCalls: toolSummaries,
      historyLength: Array.isArray(history) ? history.length : 0,
    });

    try {
      const ensuredSession = await ensureSession(supabase, {
        sessionId,
        userId: sessionId,
        source: "chatkit",
        sessionName,
        clientIp,
        userAgent: requestContext.user_agent,
        metadata: { channel: "text" },
      });

      const turnIndex = await getNextTurnIndex(supabase, sessionId);

      const sessionDisplayName =
        ensuredSession.sessionName ||
        sessionName ||
        (message
          ? message.substring(0, 120)
          : `Session ${nowIso.substring(0, 10)}`);

      await supabase.from("chat_logs").insert({
        session_id: sessionId,
        user_id: sessionId,
        prompt: message,
        response: finalResponse,
        source: "chatkit",
        status: errorMessage ? "error" : "success",
        turn_index: turnIndex,
        created_at: nowIso,
        session_name: sessionDisplayName,
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
