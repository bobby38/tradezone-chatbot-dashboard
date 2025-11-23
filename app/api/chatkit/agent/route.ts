import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createGeminiChatCompletion } from "@/lib/gemini-client";
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
  getCatalogModelById,
  type CatalogMatch,
} from "@/lib/chatkit/productCatalog";
import {
  recordAgentTelemetry,
  ToolUsageSummary,
} from "@/lib/chatkit/telemetry";
import { ensureSession, getNextTurnIndex } from "@/lib/chatkit/sessionManager";
import {
  addZepMemoryTurn,
  fetchZepContext,
  queryZepGraphContext,
  type ZepGraphNodeSummary,
} from "@/lib/zep";
import {
  normalizeProduct,
  priceLookup,
  calculateTopUp,
  inventoryCheck,
  createOrder,
  scheduleInspection,
  enqueueHumanReview,
  ocrAndExtract,
  type TopUpResult,
} from "@/lib/agent-tools";
import { searchWooProducts } from "@/lib/agent-tools";

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

// Fallback price hints (rough) used when tool results are missing or the model fails to include math
const TRADE_IN_PRICE_HINTS: Array<{ pattern: RegExp; value: number }> = [
  { pattern: /ps4\s*pro/i, value: 100 },
  { pattern: /ps4/i, value: 80 },
  { pattern: /ps5\s*pro/i, value: 380 },
  { pattern: /ps5/i, value: 350 },
  { pattern: /xbox\s*series\s*x/i, value: 350 },
  { pattern: /xbox\s*series\s*s/i, value: 150 },
  { pattern: /osmo\s+pocket\s*3/i, value: 350 },
];

const RETAIL_PRICE_HINTS: Array<{ pattern: RegExp; value: number }> = [
  { pattern: /xbox\s*series\s*x/i, value: 600 },
  { pattern: /xbox\s*series\s*s/i, value: 300 },
  { pattern: /ps5\s*pro/i, value: 900 },
  { pattern: /ps5/i, value: 800 },
  { pattern: /ps4\s*pro/i, value: 250 },
  { pattern: /osmo\s+pocket\s*3/i, value: 600 },
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
  | "woo_snapshot"
  | "perplexity";

type HybridSearchResult = {
  result: string;
  source: HybridSearchSource;
  matches: CatalogMatch[];
};

type CatalogMatches = Awaited<ReturnType<typeof findCatalogMatches>>;
type PriceModifier = "high_end" | "budget";

function renderCatalogMatches(
  matches: Awaited<ReturnType<typeof findCatalogMatches>>,
) {
  if (!matches.length) return "";
  const lines = matches.slice(0, 3).map((match) => {
    const title = match.permalink
      ? `[${match.name}](${match.permalink})`
      : match.name;
    const flagship =
      match.flagshipCondition?.basePrice !== null &&
      match.flagshipCondition?.basePrice !== undefined
        ? " — S$" +
          match.flagshipCondition.basePrice.toFixed(0) +
          ` (${match.flagshipCondition.label})`
        : match.price
          ? " — S$" + match.price
          : "";
    const range =
      match.priceRange && match.priceRange.min !== match.priceRange.max
        ? ` (Variants ${formatRangeSummary(match.priceRange)})`
        : "";
    return `- ${title}${flagship}${range}`;
  });
  return lines.join("\n");
}

function formatRangeSummary(
  range?: { min: number | null; max: number | null } | null,
) {
  if (!range) return "";
  const { min, max } = range;
  if (typeof min !== "number" || typeof max !== "number") return "";
  if (min === max) return "S$" + min.toFixed(0);
  return "S$" + min.toFixed(0) + "–S$" + max.toFixed(0);
}

function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function analyzePriceModifier(query: string): {
  modifier: PriceModifier | null;
  cleanedQuery: string;
} {
  const tokens = tokenizeQuery(query);
  let modifier: PriceModifier | null = null;
  const filtered: string[] = [];

  for (const rawToken of tokens) {
    const token = rawToken.replace(/[^a-z0-9]/g, "");
    if (!token) continue;

    if (HIGH_END_KEYWORDS.has(token)) {
      modifier = "high_end";
      continue;
    }
    if (BUDGET_KEYWORDS.has(token)) {
      modifier = "budget";
      continue;
    }
    if (MODIFIER_FILLER_TOKENS.has(token)) {
      continue;
    }
    filtered.push(rawToken);
  }

  return { modifier, cleanedQuery: filtered.join(" ") };
}

function summarizeMatchesByModifier(
  matches: CatalogMatches,
  modifier: PriceModifier,
): string | null {
  if (!matches.length) return null;

  const pricedMatches = matches
    .map((match) => {
      const flagshipPrice = match.flagshipCondition?.basePrice;
      const fallbackPrice = match.priceRange?.max ?? match.priceRange?.min;
      const price =
        typeof flagshipPrice === "number"
          ? flagshipPrice
          : typeof fallbackPrice === "number"
            ? fallbackPrice
            : null;
      return { match, price };
    })
    .filter(({ price }) => typeof price === "number") as Array<{
    match: CatalogMatch;
    price: number;
  }>;

  if (!pricedMatches.length) return null;

  const sorted = [...pricedMatches].sort((a, b) => a.price - b.price);
  const sliceSize = Math.max(1, Math.ceil(sorted.length * 0.25));
  const subset =
    modifier === "high_end"
      ? sorted.slice(-sliceSize).reverse()
      : sorted.slice(0, sliceSize);

  const heading =
    modifier === "high_end" ? "Higher-end picks" : "Best value picks";

  const lines = subset.map(({ match, price }) => {
    const flagship = match.flagshipCondition;
    const label = flagship?.label ? ` (${flagship.label})` : "";
    const range = formatRangeSummary(match.priceRange);
    const rangeSuffix = range ? ` (Variants ${range})` : "";
    return `- ${match.name} — S$` + price.toFixed(0) + label + rangeSuffix;
  });

  const section = `${heading} from the TradeZone catalog:\n\n${lines.join("\n")}`;
  return `${section}\n\nNeed details on any of these?`;
}

function truncateString(text: string, max = 280): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function computeConfidence(
  priceComponent: number | null,
  normalizeComponent: number | null,
  ocrComponent: number | null,
): number | null {
  const weighted: Array<{ value: number; weight: number }> = [];
  if (typeof priceComponent === "number") {
    weighted.push({ value: priceComponent, weight: 0.5 });
  }
  if (typeof normalizeComponent === "number") {
    weighted.push({ value: normalizeComponent, weight: 0.3 });
  }
  if (typeof ocrComponent === "number") {
    weighted.push({ value: ocrComponent, weight: 0.2 });
  }
  if (!weighted.length) return null;
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const score =
    weighted.reduce((sum, item) => sum + item.value * item.weight, 0) /
    totalWeight;
  return Math.max(0, Math.min(1, score));
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
  /\b(trade|tra[iy]n|sell|worth|value|quote|offer|top[- ]?up)\b/i;

const CONVERSATION_EXIT_PATTERNS =
  /\b(never\s?-?\s?mind|forget\s+it|no\s+need|cancel\s+that|stop\s+please|bye|goodbye|its\s+ok|it's\s+ok|leave\s+it|nvm)\b/i;

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

const CONTACT_MESSAGE_STOP_WORDS = new Set([
  "my",
  "name",
  "is",
  "this",
  "its",
  "it's",
  "im",
  "i'm",
  "call",
  "reach",
  "contact",
  "number",
  "no",
  "num",
  "phone",
  "hp",
  "mobile",
  "email",
  "mail",
  "address",
  "best",
  "can",
  "me",
  "at",
  "on",
  "the",
  "and",
  "also",
  "pls",
  "please",
  "thanks",
  "thank",
  "thx",
  "here",
  "there",
  "dear",
  "sir",
  "madam",
]);

interface VerificationSlots {
  trade_in_brand: string | null;
  trade_in_model: string | null;
  trade_in_variant: string | null;
  trade_in_condition: string | null;
  trade_in_value_sgd: number | null;
  target_brand: string | null;
  target_model: string | null;
  target_variant: string | null;
  target_price_sgd: number | null;
  used_device_discount_sgd: number | null;
}

interface VerificationPayload {
  reply_text: string;
  slots_filled: VerificationSlots;
  top_up_sgd: number | null;
  calculation_steps: string[];
  confidence: number;
  provenance: Array<{ field: string; source: string; confidence: number }>;
  flags: { requires_human_review: boolean; is_provisional: boolean };
}

function createVerificationPayload(): VerificationPayload {
  return {
    reply_text: "",
    slots_filled: {
      trade_in_brand: null,
      trade_in_model: null,
      trade_in_variant: null,
      trade_in_condition: null,
      trade_in_value_sgd: null,
      target_brand: null,
      target_model: null,
      target_variant: null,
      target_price_sgd: null,
      used_device_discount_sgd: null,
    },
    top_up_sgd: null,
    calculation_steps: [],
    confidence: 0,
    provenance: [],
    flags: {
      requires_human_review: false,
      is_provisional: false,
    },
  };
}

interface MemoryHints {
  names: string[];
  emails: string[];
  phones: string[];
  devices: string[];
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values.filter((value) => typeof value === "string" && value.trim()),
    ),
  ).map((value) => value.trim());
}

function normalizeNameCase(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildMemoryHintsFromZep(zep: ZepContextResult): MemoryHints {
  const blob = [zep.userSummary, zep.context]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!blob) {
    return { names: [], emails: [], phones: [], devices: [] };
  }

  const emailMatches =
    blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const phoneMatches = blob.match(/\+?\d[\d\s-]{7,}/g) ?? [];
  const nameMatches =
    blob.match(/name[:\s-]+([A-Za-z][A-Za-z\s]{2,40})/gi) ?? [];
  const deviceMatches =
    blob.match(
      /ps5|ps4|playstation|xbox|switch|steam deck|rog ally|quest|portal|iphone|ipad/gi,
    ) ?? [];

  const names = nameMatches
    .map((match) => match.split(/name[:\s-]+/i)[1]?.trim())
    .filter(Boolean)
    .map((name) => normalizeNameCase(name!));

  return {
    names: dedupeStrings(names),
    emails: dedupeStrings(emailMatches.map((email) => email.toLowerCase())),
    phones: dedupeStrings(
      phoneMatches.map((phone) => phone.replace(/\s+/g, " ").trim()),
    ),
    devices: dedupeStrings(deviceMatches.map((device) => device.trim())),
  };
}

function buildMemoryGuardrailMessages(
  detail: any,
  hints: MemoryHints,
): string[] {
  const messages: string[] = [];
  if (!detail?.contact_email && hints.emails.length) {
    const email = hints.emails[0];
    messages.push(
      `Memory already has the customer's email (${email}). Say "Still using ${email}?" instead of asking from scratch, and only update if they correct it.`,
    );
  }
  if (!detail?.contact_phone && hints.phones.length) {
    const phone = hints.phones[0];
    messages.push(
      `Memory shows their phone as ${phone}. Confirm it rather than re-asking, and note if they change it.`,
    );
  }
  if (!detail?.contact_name && hints.names.length) {
    const name = hints.names[0];
    messages.push(
      `Use "Still going by ${name}?" before requesting their name again. Only overwrite if they give a different one.`,
    );
  }
  if ((!detail?.brand || !detail?.model) && hints.devices.length) {
    messages.push(
      `Earlier memory mentions ${hints.devices[0]}. Reference that model before asking the customer to repeat their device details.`,
    );
  }
  return messages;
}

interface GraphConflict {
  modelId: string;
  nodeName: string;
  graphPrice: number | null;
  catalogPrice: number | null;
  delta: number | null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractGraphNodePrice(payload: Record<string, any>): number | null {
  if (Array.isArray(payload.conditions)) {
    for (const condition of payload.conditions) {
      const price = asNumber(condition?.basePrice ?? condition?.price);
      if (price !== null) return price;
    }
  }
  if (payload.tradeIn) {
    const tradeMin = asNumber(payload.tradeIn.min);
    if (tradeMin !== null) return tradeMin;
    const tradeMax = asNumber(payload.tradeIn.max);
    if (tradeMax !== null) return tradeMax;
  }
  if (
    typeof payload.tradeMin !== "undefined" ||
    typeof payload.tradeMax !== "undefined"
  ) {
    const tradeValue = asNumber(payload.tradeMin ?? payload.tradeMax);
    if (tradeValue !== null) return tradeValue;
  }
  if (payload.metadata) {
    const metaValue =
      asNumber(payload.metadata.trade_in_value_min_sgd) ||
      asNumber(payload.metadata.trade_in_value_max_sgd) ||
      asNumber(payload.metadata.target_price_sgd);
    if (metaValue !== null) return metaValue;
  }
  if (payload.price) {
    const price = asNumber(payload.price);
    if (price !== null) return price;
  }
  return null;
}

function pushGraphProvenanceEntries(params: {
  nodes: ZepGraphNodeSummary[];
  verificationData: VerificationPayload;
}): void {
  const { nodes, verificationData } = params;
  nodes.slice(0, 3).forEach((node) => {
    const payload = node.data || {};
    const price = extractGraphNodePrice(payload);
    if (price === null) return;
    const field =
      payload.kind === "trade_in" ? "trade_in_value_sgd" : "target_price_sgd";
    verificationData.provenance.push({
      field,
      source: `zep_graph:${payload.modelId || payload.kind || node.name || "node"}`,
      confidence: 0.7,
    });
    if (
      field === "target_price_sgd" &&
      verificationData.slots_filled.target_price_sgd === null
    ) {
      verificationData.slots_filled.target_price_sgd = price;
    }
    if (
      field === "trade_in_value_sgd" &&
      verificationData.slots_filled.trade_in_value_sgd === null
    ) {
      verificationData.slots_filled.trade_in_value_sgd = price;
    }
    if (
      !verificationData.slots_filled.target_model &&
      typeof payload.title === "string"
    ) {
      verificationData.slots_filled.target_model = payload.title;
    }
  });
}

async function detectGraphConflictsFromNodes(
  nodes: ZepGraphNodeSummary[],
): Promise<GraphConflict[]> {
  const conflicts: GraphConflict[] = [];
  for (const node of nodes) {
    const payload = node.data || {};
    const modelId = payload.modelId;
    if (!modelId || !Array.isArray(payload.conditions)) continue;
    const graphPrice = extractGraphNodePrice(payload);
    if (graphPrice === null) continue;
    const catalogModel = await getCatalogModelById(modelId);
    if (!catalogModel) continue;
    const catalogPriceEntry = catalogModel.conditions.find(
      (condition) => typeof condition.basePrice === "number",
    );
    const catalogPrice = catalogPriceEntry?.basePrice ?? null;
    if (catalogPrice === null) continue;
    const delta = Math.abs(catalogPrice - graphPrice);
    if (delta >= 25) {
      conflicts.push({
        modelId,
        nodeName: node.name || payload.title || modelId,
        graphPrice,
        catalogPrice,
        delta,
      });
    }
  }
  return conflicts;
}

function formatCurrency(value: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return "S$" + value.toFixed(0);
}

function formatGraphConflictSystemMessage(conflicts: GraphConflict[]): string {
  const lines = conflicts.slice(0, 3).map((conflict) => {
    return `${conflict.nodeName}: graph ${formatCurrency(conflict.graphPrice)} vs catalog ${formatCurrency(conflict.catalogPrice)} (Δ ${formatCurrency(conflict.delta ?? null)})`;
  });
  return [
    "⚠️ Catalog mismatch detected between Zep graph and local master file.",
    ...lines,
    "Respond with provisional language, cite both sources, and offer a human review before locking pricing.",
  ].join("\n");
}

function summarizeGraphNodesForPrompt(
  nodes: ZepGraphNodeSummary[],
): string | null {
  if (!nodes.length) return null;
  const lines = nodes.slice(0, 3).map((node) => {
    const payload = node.data || {};
    const price = extractGraphNodePrice(payload);
    const priceLabel =
      price !== null ? `~${formatCurrency(price)}` : "reference only";
    const label = payload.kind || (node.labels && node.labels[0]) || "product";
    return `• ${node.name || payload.title || payload.modelId || "node"} (${label}) ${priceLabel}`;
  });
  return [
    "Use these Zep graph facts as cited sources in your reply (e.g., 'from Zep graph: ...').",
    ...lines,
  ].join("\n");
}

const MODIFIER_FILLER_TOKENS = new Set([
  "yes",
  "yeah",
  "yep",
  "ok",
  "okay",
  "pls",
  "please",
  "give",
  "me",
  "more",
  "another",
  "other",
  "others",
  "option",
  "options",
  "one",
  "ones",
  "some",
  "something",
  "anything",
  "any",
  "show",
  "list",
  "maybe",
  "still",
  "need",
  "want",
  "prefer",
  "the",
  "a",
  "an",
  "for",
  "with",
  "without",
  "again",
  "thank",
  "thanks",
  "bring",
  "back",
  "make",
  "keep",
  "showing",
  "kind",
  "sir",
  "madam",
  "on",
  "in",
  "to",
  "per",
  "percent",
  "percentage",
  "quarter",
  "25",
  "25%",
  "50",
  "50%",
]);

const ZEP_GRAPH_CACHE_TTL_MS = 60 * 1000;
const ZEP_GRAPH_CACHE_LIMIT = 200;
const ZEP_GRAPH_RATE_LIMIT_COOLDOWN_MS = 30 * 1000;
const zepGraphCache = new Map<
  string,
  { result: ZepGraphQueryResult; expiresAt: number }
>();
const zepGraphSessionCooldowns = new Map<string, number>();

function normalizeGraphQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function getCachedGraphResult(
  sessionId: string,
  normalizedQuestion: string,
): ZepGraphQueryResult | null {
  const cacheKey = `${sessionId}:${normalizedQuestion}`;
  const cached = zepGraphCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  if (cached) {
    zepGraphCache.delete(cacheKey);
  }
  return null;
}

function storeGraphResult(
  sessionId: string,
  normalizedQuestion: string,
  result: ZepGraphQueryResult,
) {
  const cacheKey = `${sessionId}:${normalizedQuestion}`;
  zepGraphCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + ZEP_GRAPH_CACHE_TTL_MS,
  });
  if (zepGraphCache.size > ZEP_GRAPH_CACHE_LIMIT) {
    const oldest = zepGraphCache.keys().next().value;
    if (oldest) {
      zepGraphCache.delete(oldest);
    }
  }
}

const HIGH_END_KEYWORDS = new Set([
  "highend",
  "high",
  "premium",
  "top",
  "toptier",
  "flagship",
  "expensive",
  "best",
  "upper",
  "elite",
]);

const BUDGET_KEYWORDS = new Set([
  "cheap",
  "cheaper",
  "cheapest",
  "budget",
  "entry",
  "entrylevel",
  "low",
  "lowend",
  "affordable",
  "value",
  "bottom",
  "economy",
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

// Detects explicit two-device trade/upgrade phrasing ("trade X for Y", "upgrade X to Y")
function detectTradeUpPair(query: string): boolean {
  const normalized = query.toLowerCase();
  if (!normalized) return false;
  const tradePairPattern =
    /(trade|upgrade|swap|exchange)\s+.+\s+(for|to)\s+.+/i;
  return tradePairPattern.test(normalized);
}

function parseTradeUpParts(
  query: string,
): { source?: string; target?: string } | null {
  const match = query.match(
    /(trade|upgrade|swap|exchange)\s+(.+?)\s+(for|to)\s+(.+?)(?:[,.]| on | with |$)/i,
  );
  if (!match) return null;
  const source = match[2]?.trim();
  const target = match[4]?.trim();
  if (!source || !target) return null;
  return { source, target };
}

function pickFirstNumber(
  text: string | null | undefined,
  query?: string,
): number | null {
  if (!text) return null;

  // If query provided, try to find price near the matching product name
  if (query) {
    const queryLower = query.toLowerCase();
    const lines = text.split("\n");

    // Look for a line containing key terms from the query
    for (const line of lines) {
      const lineLower = line.toLowerCase();

      // Extract key product identifiers from query (e.g., "series x", "series s")
      const keyTerms =
        queryLower.match(/(?:series\s+[xs]|pro|slim|digital|disc)/gi) || [];

      // Check if this line contains the key terms
      const hasKeyTerms =
        keyTerms.length === 0 ||
        keyTerms.some((term) => lineLower.includes(term.toLowerCase()));

      if (hasKeyTerms) {
        // Extract price from this line (format: S$XXX or $XXX)
        const priceMatch = line.match(/S?\$\s*(\d{2,5})(?:\.\d{2})?/);
        if (priceMatch) {
          return Number(priceMatch[1]);
        }
      }
    }
  }

  // Fallback: pick first number
  const m = text.match(/\b(\d{2,5})\b/);
  return m ? Number(m[1]) : null;
}

function pickHintPrice(
  name: string | undefined | null,
  table: Array<{ pattern: RegExp; value: number }>,
): number | null {
  if (!name) return null;
  for (const entry of table) {
    if (entry.pattern.test(name)) return entry.value;
  }
  return null;
}

function normalizeProductName(name: string | undefined | null): string {
  if (!name) return "device";
  return name.trim().replace(/\s+/g, " ");
}

async function fetchApproxPrice(
  query: string,
  contextIntent: "trade_in" | "retail",
): Promise<number | null> {
  try {
    const ctx: VectorSearchContext = {
      intent: contextIntent === "trade_in" ? "trade_in" : "product",
      toolUsed: "server_fetch",
    };
    const result = await runHybridSearch(query, ctx);
    const num = pickFirstNumber(result.result, query);
    console.log("[TradeUp] fetchApproxPrice result:", {
      query,
      contextIntent,
      resultPreview: result.result?.substring(0, 200),
      extractedNumber: num,
    });
    return num ?? null;
  } catch (err) {
    console.warn("[TradeUp] fetchApproxPrice failed", { query, err });
    return null;
  }
}

// PRODUCT_KEYWORDS: Used to detect when user is asking about products
// Note: Catalog JSON doesn't include keywords, they're only in build script
// TODO: Extract to shared constants file for consistency
const PRODUCT_KEYWORDS = [
  // Gaming consoles & handhelds
  "switch",
  "nintendo",
  "ps5",
  "ps4",
  "ps5 pro",
  "playstation",
  "playstation portal",
  "xbox",
  "series x",
  "series s",
  "steam deck",
  "steam deck oled",
  "rog ally",
  "ally",
  "legion",
  "legion go",
  "claw",
  "msi claw",
  "ayaneo",
  "handheld",
  "portal",
  "quest",
  "meta quest",
  "quest 3",
  "vr",
  "psvr",
  "psvr2",
  "console",
  // Phones & tablets
  "phone",
  "iphone",
  "samsung",
  "galaxy",
  "pixel",
  "oppo",
  "smartphone",
  "tablet",
  "ipad",
  // Computers & PC parts
  "laptop",
  "notebook",
  "macbook",
  "pc",
  "computer",
  "desktop",
  "motherboard",
  "mobo",
  "cpu",
  "processor",
  "central processing unit",
  "intel",
  "ryzen",
  "ram",
  "memory",
  "ddr4",
  "ddr5",
  "storage",
  "ssd",
  "nvme",
  "hard drive",
  "hdd",
  "cpu cooler",
  "cooler",
  "aio",
  "fan",
  "pc fan",
  "case",
  "pc case",
  "tower",
  "psu",
  "power supply",
  // Accessories & peripherals
  "mouse",
  "mousepad",
  "mouse pad",
  "keyboard",
  "headset",
  "headphone",
  "earbuds",
  "earphone",
  "speaker",
  "soundbar",
  "monitor",
  "display",
  "screen",
  "webcam",
  "microphone",
  "mic",
  "chair",
  "gaming chair",
  "office chair",
  "desk",
  "table",
  "gaming desk",
  // Cameras & content creation
  "osmo",
  "osmo pocket",
  "dji",
  "camera",
  "vlog",
  "gimbal",
  "drone",
  // Smart glasses & VR
  "glass",
  "glasses",
  "smart glasses",
  "xreal",
  "rayban",
  "ray-ban",
  "meta glasses",
  "oakley",
  // AI & robots
  "robot",
  "looi",
  "ai robot",
  // Graphics cards
  "gpu",
  "rtx",
  "graphics card",
  "nvidia",
  "amd",
  "radeon",
  "geforce",
  "3060",
  "3070",
  "3080",
  "3090",
  "4060",
  "4070",
  "4080",
  "4090",
  "5050",
  "5060",
  "5070",
  "5080",
  "5090",
  // Charging & power
  "charging",
  "charger",
  "cable",
  "adapter",
  "powerbank",
  "power bank",
  "battery",
  "usb",
  "usb-c",
  "type-c",
  "lightning",
  // Phone/console accessories
  "case",
  "cover",
  "stand",
  "mount",
  "grip",
  "skin",
  // Network
  "router",
  "wifi",
  "wifi router",
  "mesh",
  "access point",
  // General product terms
  "game",
  "bundle",
  "controller",
  "accessory",
  "accessories",
  "gadget",
  "gadgets",
  "warranty",
  "extended warranty",
  "refurbished",
  "pre-order",
  "preorder",
  "brand new",
  "pre-owned",
  "used",
  // Popular game franchises
  "final fantasy",
  "call of duty",
  "assassin's creed",
  "zelda",
  "mario",
  "pokemon",
  "battlefield",
  "fifa",
  "nba 2k",
  "gran turismo",
  "horizon",
  "spiderman",
  "spider-man",
  "god of war",
  "uncharted",
  "resident evil",
  "street fighter",
  "tekken",
  "naruto",
  "dragon ball",
  "minecraft",
  "fortnite",
  "apex",
  "overwatch",
  "diablo",
  "starcraft",
  "warcraft",
  "halo",
  "gears of war",
  "forza",
  "persona",
  "yakuza",
  "dark souls",
  "elden ring",
  "bloodborne",
  "sekiro",
  "monster hunter",
  "metal gear",
];

const PRODUCT_NEED_PATTERNS: RegExp[] = [
  /\bprice\b/i,
  /\bprices\b/i,
  /\bhow much\b/i,
  /\bcost\b/i,
  /\bavailable\b/i,
  /\bavailability\b/i,
  /\bstock\b/i,
  /\bhave\b/i,
  /\bdo you have\b/i,
  /\bcan i buy\b/i,
  /\bbundles?\b/i,
  /\binstal{1,2}ment\b/i,
  /\bbnpl\b/i,
  /\border\b/i,
  /\bpre[- ]?order\b/i,
  /\bget\b/i,
  /\bany\b/i,
  /\bshow\b/i,
  /\bcheap\b/i,
  /\bcheaper\b/i,
  /\bcheapest\b/i,
  /\baffordable\b/i,
  /\bbudget\b/i,
  /\binexpensive\b/i,
  /\bunder\b/i,
  /\bbelow\b/i,
  /\bless than\b/i,
];

function detectProductInfoIntent(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  if (detectTradeInIntent(normalized)) return false;

  const mentionsProduct = PRODUCT_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
  if (!mentionsProduct) return false;

  return PRODUCT_NEED_PATTERNS.some((pattern) => pattern.test(normalized));
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

function enforceFamilyContentFilter(response: string, userMessage: string) {
  const query = userMessage.toLowerCase();
  const lines = response.split(/\n+/);

  let banned: string[] = [];
  if (/xbox/.test(query)) {
    banned = ["ps5", "ps4", "playstation", "switch", "nintendo"];
  } else if (/switch|nintendo/.test(query)) {
    banned = ["ps5", "ps4", "playstation", "xbox", "series x", "series s"];
  } else if (/ps5|ps4|playstation/.test(query)) {
    banned = ["xbox", "series x", "series s", "switch", "nintendo"];
  }

  if (!banned.length) return response;

  const filtered = lines.filter((line) => {
    const lower = line.toLowerCase();
    return !banned.some((kw) => lower.includes(kw));
  });

  if (filtered.length === lines.length) return response;
  const cleaned = filtered.join("\n").trim();
  if (cleaned) return cleaned;

  if (/xbox/.test(query)) {
    return "Here are Xbox options I can help with—tell me the model or budget.";
  }
  if (/switch|nintendo/.test(query)) {
    return "Here are Nintendo Switch options—OLED, V2, or bundles?";
  }
  if (/ps5|ps4|playstation/.test(query)) {
    return "Here are PlayStation options—PS5 Disc/Digital or bundles?";
  }

  return response;
}

function injectXboxPriceHints(response: string, userMessage: string) {
  const query = userMessage.toLowerCase();
  let updated = response;

  if (query.includes("xbox series s") && !/s\$?\s*150/i.test(updated)) {
    updated =
      "Xbox Series S trade-in is ~S$150 (subject to inspection).\n" + updated;
  }

  if (query.includes("xbox series x") && !/s\$?\s*350/i.test(updated)) {
    updated =
      "Xbox Series X trade-in is ~S$350 (subject to inspection).\n" + updated;
  }

  return updated;
}

function forceXboxPricePreface(response: string, userMessage: string) {
  const query = userMessage.toLowerCase();
  const needsSeriesS = /xbox series s/.test(query);
  const needsSeriesX = /xbox series x/.test(query);

  const preface: string[] = [];
  if (needsSeriesS)
    preface.push("Xbox Series S trade-in is ~S$150 (subject to inspection).");
  if (needsSeriesX)
    preface.push("Xbox Series X trade-in is ~S$350 (subject to inspection).");

  if (!preface.length) return response;

  const body = response && response.trim().length > 0 ? response : "";
  return [...preface, body].filter(Boolean).join("\n\n");
}

function ensureUpgradeCue(response: string, userMessage: string) {
  const msg = userMessage.toLowerCase();
  const mentionsUpgradeIntent = /upgrade/.test(msg) || /series x/.test(msg);
  if (!mentionsUpgradeIntent) return response;

  const respLower = response.toLowerCase();
  const trimmedResponse = response
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      const isConditionPrompt = /condition|mint|good|fair|faulty/.test(lower);
      const isQuestion = /\?$/.test(line.trim());
      return !(isConditionPrompt && isQuestion);
    })
    .join("\n")
    .trim();

  if (
    respLower.includes("upgrade") ||
    respLower.includes("series x") ||
    respLower.includes("top up")
  ) {
    return trimmedResponse || response;
  }

  const base = trimmedResponse || response;
  return `${base}\n\nUpgrade to Xbox Series X is available — I can give you the top-up and pricing now if you'd like.`;
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
  // Order matters: specific variants first, then general fallbacks
  {
    regex: /ps5\s*pro|playstation 5\s*pro/i,
    brand: "Sony",
    model: "PlayStation 5 Pro",
  },
  {
    regex: /ps5\s*digital|playstation 5\s*digital/i,
    brand: "Sony",
    model: "PlayStation 5 Digital",
  },
  {
    regex: /ps5\s*disc|playstation 5\s*disc/i,
    brand: "Sony",
    model: "PlayStation 5 Disc",
  },
  { regex: /ps5|playstation 5|ps ?5/i, brand: "Sony", model: "PlayStation 5" },
  {
    regex: /ps4\s*pro|playstation 4\s*pro/i,
    brand: "Sony",
    model: "PlayStation 4 Pro",
  },
  {
    regex: /ps4\s*slim|playstation 4\s*slim/i,
    brand: "Sony",
    model: "PlayStation 4 Slim",
  },
  { regex: /ps4|playstation 4|ps ?4/i, brand: "Sony", model: "PlayStation 4" },
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
  } else if (
    /installment|instalment|payment\s+plan|\b\d+\s*(month|mth|mo)\b/i.test(
      lower,
    )
  ) {
    patch.preferred_payout = "installment";
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

function isPhotoStepAcknowledged(
  detail: any,
  recentHistory?: Array<{ role: string; content: string }>,
) {
  if (!detail) return false;

  if (
    Array.isArray(detail.trade_in_media) &&
    detail.trade_in_media.length > 0
  ) {
    return true;
  }

  const acknowledgementSources = [detail.notes, detail.source_message_summary];
  if (
    acknowledgementSources.some(
      (text) =>
        typeof text === "string" && /photos?:\s*not provided/i.test(text),
    )
  ) {
    return true;
  }

  if (recentHistory && recentHistory.length > 0) {
    const recentUserMessages = recentHistory
      .filter((msg) => msg.role === "user")
      .slice(-5)
      .map((msg) => msg.content.toLowerCase());

    // More specific photo-related patterns to avoid false positives
    const photoPatterns = [
      /\b(upload|send|attach|sent)\s+(photo|image|pic|picture)/i,
      /\b(photo|image|pic|picture)\s+(upload|send|sent|attach)/i,
      /\bno\s+(photo|image|pic)/i,
      /\b(don't|dont|do not)\s+have\s+(photo|image|pic)/i,
      /\b(will|can)\s+(send|upload)\s+later/i,
      /\b(here|uploaded|attached)\s+(is|are)\s+(the\s+)?(photo|image|pic)/i,
    ];

    if (
      recentUserMessages.some((entry) =>
        photoPatterns.some((pattern) => pattern.test(entry)),
      )
    ) {
      return true;
    }
  }

  return false;
}

async function autoSubmitTradeInLeadIfComplete(params: {
  leadId: string;
  requestId: string;
  sessionId: string;
  history?: Array<{ role: string; content: string }>;
}): Promise<{ status?: string } | null> {
  try {
    let detail = await getTradeInLeadDetail(params.leadId);
    if (!detail) return null;

    const alreadyNotified = Array.isArray(detail.trade_in_actions)
      ? detail.trade_in_actions.some(
          (action: any) => action.action_type === "email_sent",
        )
      : false;

    const hasDevice = Boolean(detail.brand && detail.model);
    // Storage is optional - many devices have fixed storage (PS5 825GB/2TB, Switch 64GB, etc.)
    const hasStorage = Boolean(detail.storage);
    let hasContactPhone = Boolean(detail.contact_phone);
    let hasEmail = Boolean(detail.contact_email);
    let hasContactName = Boolean(detail.contact_name);
    const hasPayout = Boolean(detail.preferred_payout);

    // Check if photos step acknowledged (encouraged but no longer blocking email)
    let photoStepAcknowledged = isPhotoStepAcknowledged(detail, params.history);

    // Attempt to backfill missing contact from recent user messages
    if ((!hasContactName || !hasContactPhone || !hasEmail) && params.history) {
      const recentUserConcat = params.history
        .filter((m) => m.role === "user")
        .slice(-6)
        .map((m) => m.content)
        .join(" ");
      const contactClues = extractTradeInClues(recentUserConcat);
      const contactPatch: TradeInUpdateInput = {};
      if (!hasContactName && contactClues.contact_name) {
        contactPatch.contact_name = contactClues.contact_name;
      }
      if (!hasContactPhone && contactClues.contact_phone) {
        contactPatch.contact_phone = contactClues.contact_phone;
      }
      if (!hasEmail && contactClues.contact_email) {
        contactPatch.contact_email = contactClues.contact_email;
      }
      if (Object.keys(contactPatch).length > 0) {
        try {
          await updateTradeInLead(params.leadId, contactPatch);
          detail = await getTradeInLeadDetail(params.leadId);
          hasContactPhone = Boolean(detail.contact_phone);
          hasEmail = Boolean(detail.contact_email);
          hasContactName = Boolean(detail.contact_name);
        } catch (backfillError) {
          console.warn("[ChatKit] Contact backfill failed", backfillError);
        }
      }
    }

    // Photos are strongly encouraged but never block auto-submit.
    // If not acknowledged, we still auto-mark a note so downstream summary is clear.
    if (!photoStepAcknowledged) {
      try {
        await updateTradeInLead(params.leadId, {
          notes:
            "Photos: Not provided — final quote upon inspection (auto-marked)",
        });
        photoStepAcknowledged = true;
      } catch (markPhotoError) {
        console.warn(
          "[ChatKit] Failed to auto-mark photo acknowledgement",
          markPhotoError,
        );
      }
    }

    if (
      alreadyNotified ||
      !hasDevice ||
      !hasContactPhone ||
      !hasEmail ||
      !hasPayout ||
      !photoStepAcknowledged
    ) {
      console.log("[ChatKit] Auto-submit conditions not met:", {
        alreadyNotified,
        hasDevice,
        hasStorage,
        hasContactPhone,
        hasEmail,
        hasPayout,
        photoStepAcknowledged,
      });
      return null;
    }

    if (!hasContactName) {
      console.warn(
        "[ChatKit] Auto-submit proceeding without confirmed contact name",
        { leadId: params.leadId },
      );
    }

    console.log(
      "[ChatKit] Auto-submit conditions met, submitting trade-in lead...",
    );

    const summary = await buildTradeInSummary(params.leadId, params.history);
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

  let responseMatches: CatalogMatches = [];

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

  if (vectorSource !== "trade_in_vector_store" && catalogMatches.length === 0) {
    try {
      const wooFallback = await searchWooProducts(query, 3);
      if (wooFallback.length) {
        const lines = wooFallback
          .map((product) => {
            const priceLabel =
              typeof product.price_sgd === "number"
                ? " — S$" + product.price_sgd.toFixed(2)
                : "";
            const link = product.permalink
              ? ` (View: ${product.permalink})`
              : "";
            return `- ${product.name}${priceLabel}${link}`;
          })
          .join("\n");
        const wooMessage = `I spotted these on TradeZone.sg:\n\n${lines}\n\nI can double-check any of these for you—just ask.`;
        return {
          result: wooMessage,
          source: "woo_snapshot",
          matches: [],
        };
      }
    } catch (wooError) {
      console.warn("[ChatKit] Woo fallback failed", wooError);
    }
  }

  const catalogSection =
    catalogMatches.length > 0
      ? `Here are items from the TradeZone catalog that match your request:\n\n${renderCatalogMatches(catalogMatches)}\n\nWant me to read the details for any of these?`
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

  // Force Perplexity for promotion/sale/deal queries - always check live website
  const isPromotionQuery =
    /\b(promotion|promo|sale|deal|discount|offer|special|black friday|cyber monday|clearance)\b/i.test(
      query,
    );

  const vectorUseful =
    vectorResult &&
    vectorResult.trim().length >= 160 &&
    !/No product information|not found|unavailable|no results|don't have|do not have|not available|no items|no specific|were no|not listed/i.test(
      vectorResult,
    ) &&
    !disallowedVectorPatterns.some((pattern) => pattern.test(vectorResult)) &&
    !isPromotionQuery; // Always skip vector for promotions

  // For trade-in queries, use vector result even if short (pricing data is concise)
  if (vectorUseful || (isTradeInQuery && vectorResult.trim().length > 0)) {
    const combined = catalogSection
      ? `${vectorResult}\n\n${catalogSection}`
      : vectorResult;
    const adjusted = applyTradeInPriceOverrides(combined, query, vectorSource);
    console.log(
      `[ChatKit] Using ${isTradeInQuery ? "TRADE-IN" : "vector"} result (${vectorResult.length} chars)`,
    );
    return {
      result: adjusted,
      source: vectorSource,
      matches: vectorSource === "trade_in_vector_store" ? [] : catalogMatches,
    };
  }

  if (catalogSection) {
    const totalLatency = Date.now() - searchStartTime;
    if (totalLatency > 3000) {
      console.warn(
        `[ChatKit] Slow hybrid search (catalog path): ${totalLatency}ms total`,
      );
    }
    return {
      result: catalogSection,
      source: "product_catalog",
      matches: catalogMatches,
    };
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
      return { result: fallback, source: "perplexity", matches: [] };
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

  return { result: fallbackMessage, source: vectorSource, matches: [] };
}

async function buildTradeInSummary(
  leadId: string,
  recentHistory?: Array<{ role: string; content: string }>,
  detailOverride?: any,
) {
  try {
    // Wait a moment for any pending media uploads to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    let lead = detailOverride;
    if (!lead) {
      const { data: fetched } = await supabase
        .from("trade_in_leads")
        .select(
          `brand, model, storage, condition, accessories, preferred_payout,
           contact_name, contact_phone, contact_email, notes,
           trade_in_media ( id )`,
        )
        .eq("id", leadId)
        .maybeSingle();
      lead = fetched;
    }

    if (!lead) return null;

    const device = [lead.brand, lead.model, lead.storage]
      .filter(Boolean)
      .join(" ")
      .trim()
      .replace(/\s+/g, " ");
    const accessories = Array.isArray(lead.accessories)
      ? lead.accessories.join(", ")
      : lead.accessories || "None";

    // Check if user indicated they're providing photos (from recent conversation)
    let photoIntentDetected = false;
    if (recentHistory) {
      const recentUserMessages = recentHistory
        .filter((msg) => msg.role === "user")
        .slice(-5) // Check last 5 user messages
        .map((msg) => msg.content.toLowerCase());

      const photoKeywords = [
        "here",
        "uploaded",
        "sent",
        "attached",
        "sending",
        "image",
        "photo",
        "pic",
      ];
      photoIntentDetected = recentUserMessages.some((msg) =>
        photoKeywords.some((keyword) => msg.includes(keyword)),
      );
    }

    const photosProvided = lead.trade_in_media?.length
      ? "Provided"
      : photoIntentDetected
        ? "Upload in progress"
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

function buildTradeInUserSummary(detail: any): string | null {
  if (!detail) return null;
  const deviceParts = [detail.brand, detail.model, detail.storage]
    .filter(Boolean)
    .map((value: string) => value.trim())
    .filter(Boolean);
  const accessories = Array.isArray(detail.accessories)
    ? detail.accessories.join(", ")
    : detail.accessories;

  const lines = [
    "Saved trade-in info so far:",
    deviceParts.length ? `Device: ${deviceParts.join(" ")}` : null,
    detail.condition ? `Condition: ${detail.condition}` : null,
    accessories ? `Accessories: ${accessories}` : null,
    detail.preferred_payout
      ? `Payout preference: ${detail.preferred_payout}`
      : null,
    detail.contact_name || detail.contact_phone || detail.contact_email
      ? `Contact: ${[
          detail.contact_name,
          detail.contact_phone,
          detail.contact_email,
        ]
          .filter(Boolean)
          .join(" · ")}`
      : null,
  ].filter(Boolean);

  if (lines.length <= 1) return null;
  lines.push("Ask the customer if anything needs updating before proceeding.");
  return lines.join("\n");
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
      ? "I can reserve stock or notify you if it changes—just let me know."
      : source === "trade_in_vector_store"
        ? "I can guide you through the trade-in form whenever you’re ready."
        : "I can double-check any of these for you—just ask.";
  return [
    `Here’s what I found for “${query}”:`,
    "",
    result,
    "",
    `_(source: ${sourceLabel})_`,
    "",
    callToAction,
  ].join("\n");
}

function buildMissingTradeInFieldPrompt(detail: any): string | null {
  if (!detail) return null;

  const hasDevice = Boolean(detail.brand && detail.model);
  let hasStorage = Boolean(detail.storage);
  const hasCondition = Boolean(detail.condition);
  const accessoriesCaptured = Array.isArray(detail.accessories)
    ? detail.accessories.length > 0
    : Boolean(detail.accessories);
  const hasContactName = Boolean(detail.contact_name);
  const hasContactPhone = Boolean(detail.contact_phone);
  const hasContactEmail = Boolean(detail.contact_email);
  const hasPayout = Boolean(detail.preferred_payout);
  const photoAcknowledged = isPhotoStepAcknowledged(detail);

  const storageLikelyFixed = (() => {
    const label = `${detail.brand || ""} ${detail.model || ""}`.toLowerCase();
    return /switch|ps5|ps4|playstation|xbox|portal|quest|steam deck|rog ally|legion go|msi claw/.test(
      label,
    );
  })();
  if (!hasStorage && storageLikelyFixed) {
    hasStorage = true;
  }

  const readyForPhotos =
    hasDevice &&
    hasCondition &&
    accessoriesCaptured &&
    hasContactName &&
    hasContactPhone &&
    hasContactEmail &&
    hasPayout;

  const steps: Array<{ missing: boolean; message: string }> = [
    {
      missing: false, // Never re-ask device if already parsed; we infer from prior messages
      message:
        "Device already captured or inferred. Do NOT ask what device they're trading.",
    },
    {
      missing: !hasStorage,
      message:
        'Ask: "What storage size is it—like 128GB or 1TB?" and save the storage field.',
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
      message:
        'Ask: "Best phone number?" Repeat the digits back once to confirm, then save contact_phone.',
    },
    {
      missing: !hasContactEmail,
      message:
        "Ask for the full email address (not just the provider), repeat the entire address back, wait for a clear yes, then save contact_email.",
    },
    {
      missing: !hasPayout,
      message:
        'Ask: "Cash, PayNow, or bank transfer?" and save preferred payout unless the user already said they want installments. If they asked for installments, set preferred_payout=installment and skip this question.',
    },
    {
      missing: readyForPhotos && !photoAcknowledged,
      message:
        'All details captured—now ask once: "Got photos? Helps us quote faster." If they say no, respond "Photos noted as not provided — final quote upon inspection" and keep moving.',
    },
  ];

  const nextStep = steps.find((step) => step.missing);
  if (!nextStep) return null;

  return [
    `🔴 Trade-in task: ${nextStep.message}`,
    "Keep reply ≤12 words, wait for the answer, then acknowledge briefly.",
  ].join("\n");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|\[\]\\]/g, "\\$&");
}

function stripContactContent(
  message: string,
  clues?: TradeInUpdateInput | null,
) {
  if (!message) return "";
  let remainder = message;

  if (clues?.contact_email) {
    const emailPattern = new RegExp(escapeRegex(clues.contact_email), "gi");
    remainder = remainder.replace(emailPattern, " ");
  }

  if (clues?.contact_phone) {
    const digitsOnly = clues.contact_phone.replace(/[^0-9]/g, "");
    if (digitsOnly.length >= 4) {
      const digitPattern = new RegExp(
        digitsOnly.split("").join("\\s*[-.]?\\s*"),
        "gi",
      );
      remainder = remainder.replace(digitPattern, " ");
    }

    const displayPattern = new RegExp(
      escapeRegex(clues.contact_phone).replace(/\\s+/g, "\\\\s+"),
      "gi",
    );
    remainder = remainder.replace(displayPattern, " ");
  }

  if (clues?.contact_name) {
    remainder = remainder.replace(
      new RegExp(escapeRegex(clues.contact_name), "gi"),
      " ",
    );
  }

  remainder = remainder
    .replace(/[0-9+().-]+/g, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ")
    .replace(/\s+/g, " ");

  const filtered = remainder
    .split(/\s+/)
    .filter(
      (token) => token && !CONTACT_MESSAGE_STOP_WORDS.has(token.toLowerCase()),
    )
    .join(" ");

  return filtered.trim();
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .map((token) =>
      token ? token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() : "",
    )
    .filter(Boolean)
    .join(" ");
}

function determineNextTradeInQuestion(detail: any): string | null {
  if (!detail) return null;

  const hasDevice = Boolean(detail.brand && detail.model);
  let hasStorage = Boolean(detail.storage);
  const storageLikelyFixed = (() => {
    const label = `${detail.brand || ""} ${detail.model || ""}`.toLowerCase();
    return /switch|ps5|ps4|playstation|xbox|portal|quest|steam deck|rog ally|legion go|msi claw/.test(
      label,
    );
  })();
  if (!hasStorage && storageLikelyFixed) {
    hasStorage = true;
  }

  const hasCondition = Boolean(detail.condition);
  const accessoriesCaptured = Array.isArray(detail.accessories)
    ? detail.accessories.length > 0
    : Boolean(detail.accessories);
  const hasContactEmail = Boolean(detail.contact_email);
  const hasContactPhone = Boolean(detail.contact_phone);
  const hasContactName = Boolean(detail.contact_name);
  const hasPayout = Boolean(detail.preferred_payout);
  const photoAcknowledged = isPhotoStepAcknowledged(detail);

  if (!hasDevice) {
    return "What device are we trading? Brand and model?";
  }
  if (!hasStorage) {
    return "What storage size are we working with?";
  }
  if (!hasCondition) {
    return "What condition is it in? (mint, good, fair, faulty)";
  }
  if (!accessoriesCaptured) {
    return "Any box or accessories included?";
  }
  if (!hasContactEmail) {
    return "What's the best email for your quote?";
  }
  if (!hasContactPhone) {
    return "And the best phone number to reach you?";
  }
  if (!hasContactName) {
    return "Whose name should I note down?";
  }
  if (!photoAcknowledged) {
    return "Got photos to speed inspection? Optional—note 'Photos: Not provided' if they can't send any.";
  }
  if (!hasPayout) {
    return "Which payout suits you best: cash, PayNow, or bank transfer? Skip this if they already picked installment—just set preferred_payout=installment.";
  }

  return null;
}

function buildTradeDeviceQuery(
  detail?: any,
  clues?: TradeInUpdateInput | null,
): string | null {
  const brand = (clues?.brand || detail?.brand || "").trim();
  const model = (clues?.model || detail?.model || "").trim();
  const storage = (clues?.storage || detail?.storage || "").trim();
  const parts = [brand, model, storage].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

function buildContactAcknowledgementResponse(params: {
  clues?: TradeInUpdateInput | null;
  detail?: any;
  message: string;
}): string | null {
  const { clues, detail, message } = params;
  if (!clues) return null;

  const email =
    typeof clues.contact_email === "string" ? clues.contact_email.trim() : "";
  const phone =
    typeof clues.contact_phone === "string" ? clues.contact_phone.trim() : "";
  if (!email || !phone) {
    return null;
  }

  const remainder = stripContactContent(message, clues);
  const leftoverWords = remainder ? remainder.split(/\s+/).filter(Boolean) : [];
  if (leftoverWords.length > 3) {
    return null;
  }

  const name =
    typeof clues.contact_name === "string" ? clues.contact_name.trim() : "";

  const lines = [
    name ? `- Name: ${toTitleCase(name)}` : null,
    `- Phone: ${phone}`,
    `- Email: ${email.toLowerCase()}`,
  ].filter(Boolean);

  if (!lines.length) {
    return null;
  }

  let response = `Perfect, I noted your contact details:\n${lines.join("\n")}`;
  const nextStep = determineNextTradeInQuestion(detail);
  if (nextStep) {
    response += `\n\n${nextStep}`;
  } else {
    response += "\n\nAnything else you want me to capture?";
  }

  return response;
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
      name: "tradezone_graph_query",
      description:
        "Query TradeZone's structured catalog/trade graph for bundles, upgrades, or price relationships when vector search needs richer context.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "Natural language question",
          },
        },
        required: ["question"],
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
            enum: ["cash", "paynow", "bank", "installment"],
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
  if (CONVERSATION_EXIT_PATTERNS.test(message.toLowerCase())) {
    const exitResponse =
      "No problem—I'll stop here. Just message me again if you need help.";
    return NextResponse.json(
      {
        response: exitResponse,
        sessionId,
        model: "gpt-4o-mini",
      },
      { status: 200, headers: getCorsHeaders(origin) },
    );
  }
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
  let textModel = "gpt-4.1-mini-2025-04-14"; // Default model (text)
  let lastHybridResult: string | null = null;
  let lastHybridSource: HybridSearchSource | null = null;
  let lastHybridQuery: string | null = null;
  let lastHybridMatches: CatalogMatches = [];
  let lastSearchProductsResult: string | null = null;
  let lastTradeInPrice: number | null = null;
  let lastRetailPrice: number | null = null;
  let precomputedTradeUp: {
    tradeValue?: number | null;
    retailPrice?: number | null;
  } = {};
  let errorMessage: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let tradeInLeadId: string | null = null;
  let tradeInLeadStatus: string | null = null;
  let tradeInIntent = false;
  let tradeUpPairIntent = false;
  let tradeUpParts: { source?: string; target?: string } | null = null;
  let forcedTradeUpMath: {
    source?: string;
    target?: string;
    tradeValue?: number | null;
    retailPrice?: number | null;
    confirmed?: boolean;
  } | null = null;
  let tradeInLeadDetail: any = null;
  let autoExtractedClues: TradeInUpdateInput | null = null;
  let productSlug: string | null = null;
  let installmentRequested = false;
  let isProductInfoQuery = false;
  let isTradeInPricingQuery = false;
  let verificationData = createVerificationPayload();
  let normalizeConfidence: number | null = null;
  let priceConfidence: number | null = null;
  let ocrConfidence: number | null = null;
  let latestTopUp: TopUpResult | null = null;
  let tradeInNeedsPayoutPrompt = false;
  let tradeInReadyForPhotoPrompt = false;
  let tradeInPhotoAcknowledged = false;
  let tradeDeviceQuery: string | null = null;
  let tradeInPriceShared = false;

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
      {
        role: "system",
        content:
          "Skip greetings and get to the answer quickly. No 'Hi/Hello', no repeated clarifications—respond directly to the latest user ask.",
      },
    ];

    // ⚠️ Zep.ai memory DISABLED (quota exceeded, $25/month not viable)
    // TODO: Evaluate Graphiti as alternative later
    let zepContext: Awaited<ReturnType<typeof fetchZepContext>> = {
      userSummary: null,
      context: null,
    };
    // try {
    //   zepContext = await fetchZepContext(sessionId);
    //   console.log("[ChatKit] Zep context loaded", {
    //     sessionId,
    //     hasUserSummary: Boolean(zepContext.userSummary),
    //     hasContext: Boolean(zepContext.context),
    //   });
    // } catch (zepError: any) {
    //   // Graceful fallback when Zep is unavailable (rate limits, quota exceeded, etc.)
    //   console.warn(
    //     "[ChatKit] Zep unavailable, continuing without memory context",
    //     {
    //       error: zepError?.message || String(zepError),
    //       statusCode: zepError?.statusCode,
    //     },
    //   );
    // }
    const memoryHints = buildMemoryHintsFromZep(zepContext);
    let contextInsertIndex = 1;
    if (zepContext.userSummary) {
      messages.splice(contextInsertIndex, 0, {
        role: "system",
        content: `Customer summary:\n${zepContext.userSummary}`,
      });
      contextInsertIndex += 1;
    }
    if (zepContext.context) {
      messages.splice(contextInsertIndex, 0, {
        role: "system",
        content: `Context from memory:\n${zepContext.context}`,
      });
      contextInsertIndex += 1;
    }

    // Truncate to last 20 messages (10 exchanges) to reduce token usage
    const maxHistoryMessages = 20;
    const truncatedHistory =
      history && history.length > maxHistoryMessages
        ? history.slice(-maxHistoryMessages)
        : history || [];

    if (history && history.length > maxHistoryMessages) {
      console.log(
        `[ChatKit] History truncated: ${history.length} → ${truncatedHistory.length} messages`,
      );
    }

    if (history && history.length > 0) {
      truncatedHistory.forEach((msg: any) => {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      });
    }

    const isFirstTurn = !history || history.length === 0;
    const userOpenedWithQuestion =
      isFirstTurn &&
      /\?|have\s+you|do\s+you|can\s+i|can\s+you|got\s+any|any\s+|price|how much|what'?s|need\s|looking for|recommend|suggest|trade.+for|trade.+to/i.test(
        message,
      );
    if (userOpenedWithQuestion) {
      messages.push({
        role: "system",
        content:
          "Skip the canned greeting. The user already asked a question, so reply directly to it.",
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
    tradeUpPairIntent = detectTradeUpPair(message);
    tradeUpParts = parseTradeUpParts(message);
    if (tradeUpPairIntent) {
      tradeInIntent = true; // force trade-in tool path for trade-up phrasing
      // Pre-set forced math slots so we can synthesize the reply later
      forcedTradeUpMath = {
        source: tradeUpParts?.source,
        target: tradeUpParts?.target,
        tradeValue: null,
        retailPrice: null,
        confirmed: false,
      };

      // Confirm the pair once up front
      messages.push({
        role: "system",
        content: `First, confirm the trade-up pair in one short question: "Confirm: trade ${normalizeProductName(
          tradeUpParts?.source,
        )} for ${normalizeProductName(tradeUpParts?.target)}?"

After user confirms devices, show the pricing using the precomputed values, then ask: "Want to proceed with this trade-up?"

Only after user says yes/proceed, start collecting details (condition, accessories, contact info, photos, payout). If they say no or hesitate, offer to help with something else.`,
      });

      // Pre-fetch prices server-side to avoid LLM gaps
      if (tradeUpParts?.source) {
        precomputedTradeUp.tradeValue = await fetchApproxPrice(
          `trade-in ${tradeUpParts.source}`,
          "trade_in",
        );
        console.log("[TradeUp] Precomputed trade-in value:", {
          query: `trade-in ${tradeUpParts.source}`,
          value: precomputedTradeUp.tradeValue,
        });
      }
      if (tradeUpParts?.target) {
        // CRITICAL: Use "buy price" or "new price" to get RETAIL price, not trade-in value
        precomputedTradeUp.retailPrice = await fetchApproxPrice(
          `buy price ${tradeUpParts.target}`,
          "retail",
        );
        console.log("[TradeUp] Precomputed retail price:", {
          query: `buy price ${tradeUpParts.target}`,
          value: precomputedTradeUp.retailPrice,
        });
      }
    }

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
        // Only resume trade-in if it's not completed/submitted AND user shows trade-in intent
        const completedStatuses = [
          "submitted",
          "completed",
          "closed",
          "archived",
        ];
        const isCompleted = completedStatuses.includes(
          existingLead.status || "",
        );

        if (!isCompleted && tradeInIntent) {
          // Resume active trade-in
          tradeInLeadId = existingLead.id;
          tradeInLeadStatus = existingLead.status;

          console.log(
            `[ChatKit] Resuming trade-in lead ${existingLead.id} (status: ${existingLead.status})`,
          );

          // Add current trade-in summary (pass recent history for photo detection)
          const tradeInSummary = await buildTradeInSummary(
            existingLead.id,
            truncatedHistory,
          );
          if (tradeInSummary) {
            messages.splice(2, 0, { role: "system", content: tradeInSummary });
          }
        } else if (isCompleted) {
          console.log(
            `[ChatKit] Ignoring completed trade-in lead ${existingLead.id} (status: ${existingLead.status})`,
          );
          // Don't load completed trade-in context
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

        // Add current trade-in summary if available (pass recent history for photo detection)
        const tradeInSummary = await buildTradeInSummary(
          ensureResult.leadId,
          truncatedHistory,
        );
        if (tradeInSummary) {
          messages.splice(2, 0, { role: "system", content: tradeInSummary });
        }
      }
    } catch (ensureError) {
      console.error("[ChatKit] ensureTradeInLead failed", ensureError);
      tradeInIntent = false;
    }

    // Always auto-save extracted trade-in clues when a lead is active,
    // even if the current message isn’t explicitly tagged as trade-in intent.
    if (tradeInLeadId) {
      autoExtractedClues = extractTradeInClues(message);
      // Block auto-setting preferred_payout until contact is present to avoid validation errors
      if (
        autoExtractedClues?.preferred_payout &&
        (!tradeInLeadDetail ||
          !tradeInLeadDetail.contact_email ||
          !tradeInLeadDetail.contact_phone ||
          !tradeInLeadDetail.contact_name)
      ) {
        delete autoExtractedClues.preferred_payout;
      }
      if (autoExtractedClues && Object.keys(autoExtractedClues).length > 0) {
        if (!tradeDeviceQuery) {
          const clueQuery = buildTradeDeviceQuery(null, autoExtractedClues);
          if (clueQuery) {
            tradeDeviceQuery = clueQuery;
          }
        }
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

      try {
        tradeInLeadDetail = await getTradeInLeadDetail(tradeInLeadId);
      } catch (detailError) {
        console.error("[ChatKit] Failed to fetch trade-in detail", detailError);
      }

      // Merge freshly auto-extracted clues so step reminders don't re-ask for data just provided this turn
      if (tradeInLeadDetail && autoExtractedClues) {
        tradeInLeadDetail = { ...tradeInLeadDetail, ...autoExtractedClues };
      }

      if (tradeInLeadDetail) {
        const guardrails = buildMemoryGuardrailMessages(
          tradeInLeadDetail,
          memoryHints,
        );
        guardrails.forEach((content) =>
          messages.push({ role: "system", content }),
        );
      }

      if (tradeInLeadDetail && autoExtractedClues) {
        const acknowledgement = buildContactAcknowledgementResponse({
          clues: autoExtractedClues,
          detail: tradeInLeadDetail,
          message,
        });
        if (acknowledgement) {
          messages.push({
            role: "system",
            content: [
              "AUTO-CONFIRM CONTACT DETAILS:",
              acknowledgement,
              "Repeat the confirmation above (same formatting) before your next checklist question, and do not re-ask for the contact info you just saved.",
            ].join("\n"),
          });
        }

        const hasContactName = Boolean(tradeInLeadDetail?.contact_name);
        const hasContactPhone = Boolean(tradeInLeadDetail?.contact_phone);
        const hasContactEmail = Boolean(tradeInLeadDetail?.contact_email);
        const hasCondition = Boolean(tradeInLeadDetail?.condition);
        const accessoriesCaptured = Array.isArray(
          tradeInLeadDetail?.accessories,
        )
          ? tradeInLeadDetail.accessories.length > 0
          : Boolean(tradeInLeadDetail?.accessories);
        const photoAcknowledged = isPhotoStepAcknowledged(tradeInLeadDetail);
        tradeInPhotoAcknowledged = photoAcknowledged;

        const deviceCaptured = Boolean(
          tradeInLeadDetail.brand && tradeInLeadDetail.model,
        );
        const payoutSet = Boolean(tradeInLeadDetail.preferred_payout);
        const readyForPayoutPrompt =
          deviceCaptured &&
          hasCondition &&
          accessoriesCaptured &&
          hasContactName &&
          hasContactPhone &&
          hasContactEmail;
        const needsPayoutPrompt =
          readyForPayoutPrompt && !payoutSet && tradeInPriceShared;
        tradeInNeedsPayoutPrompt = needsPayoutPrompt;
        // Photo prompt should trigger as soon as device+condition+accessories+contact are locked,
        // independent of payout choice (works for upgrades/installments too).
        const readyForPhotoNudge =
          deviceCaptured &&
          hasCondition &&
          accessoriesCaptured &&
          hasContactName &&
          hasContactPhone &&
          hasContactEmail;
        tradeInReadyForPhotoPrompt = readyForPhotoNudge && !photoAcknowledged;

        if (tradeInReadyForPhotoPrompt) {
          messages.push({
            role: "system",
            content:
              "You've locked device, condition, accessories, contact, and payout. Ask ONCE, clearly yes/no: 'Got photos to speed inspection? Say yes to upload now, or no if you can't.' If they say yes, invite the upload briefly. If they say no, save 'Photos: Not provided — final quote upon inspection' and continue. Do not block submission; do not repeat this ask.",
          });
        }

        if (deviceCaptured && hasContactEmail && hasContactPhone) {
          const userSummary = buildTradeInUserSummary(tradeInLeadDetail);
          if (userSummary) {
            messages.push({
              role: "system",
              content: `${userSummary}\nOnly recap once unless the customer changes something.`,
            });
          }
        }
      }

      const missingPrompt = buildMissingTradeInFieldPrompt(tradeInLeadDetail);
      if (missingPrompt) {
        messages.push({ role: "system", content: missingPrompt });
      }
    }

    // First call to OpenAI to determine if tools are needed
    // 🔴 CRITICAL FIX: Force searchProducts for trade-in pricing queries
    isTradeInPricingQuery =
      detectTradeInIntent(message) &&
      /\b(price|worth|value|quote|offer|how much|goes? for|typically|payout|cash out)\b/i.test(
        message,
      );

    isProductInfoQuery = detectProductInfoIntent(message);
    const productLinkMatch = message.match(/tradezone\.sg\/product\/([\w-]+)/i);
    productSlug = productLinkMatch?.[1] || productSlug;

    if (productSlug) {
      messages.push({
        role: "system",
        content: `User shared a TradeZone product link. Treat this as a direct request for "${productSlug.replace(/-/g, " ")}". Respond with a short peek (1-2 sentences) plus the product link. Do NOT speculate about stock; say the page has live availability and they can add to cart there or ask us to reserve.`,
      });
    }

    // Trade-up pairs should always pull catalog/trade data
    if (tradeUpPairIntent) {
      isTradeInPricingQuery = true;
    }

    const shouldForceCatalog =
      tradeUpPairIntent ||
      isTradeInPricingQuery ||
      isProductInfoQuery ||
      Boolean(productSlug);

    const toolChoice = shouldForceCatalog
      ? { type: "function" as const, function: { name: "searchProducts" } }
      : ("auto" as const);

    // Query-specific guardrails
    if (/\bgalaxy\s+tab\b/i.test(message)) {
      messages.push({
        role: "system",
        content:
          "User asked for Samsung Galaxy Tab tablets. Recommend only Samsung tablets (Tab A7/A8/A9/S6/S7/S8/S9, etc.). Exclude phones (Fold/Flip/S series), games, and non-tablet items. Prefer affordable options first if they said cheap. Provide price + product link; keep response under 3 bullet points plus one closing line if needed.",
      });
    }

    // Installment guardrail: include rough estimates (3 / 6 / 12) when user asks about installment
    if (/installment|instalment|payment\s*plan/i.test(message)) {
      installmentRequested = true;
      messages.push({
        role: "system",
        content:
          "Installment request: Offer rough monthly estimates (3/6/12 months) using top-up ÷ months, rounded, and say it's an estimate subject to checkout. Keep the price + installment reply to MAX 2 short sentences (≤25 words total). Set preferred_payout=installment when confirmed.",
      });
    }

    // Trade-up pair guardrail: math-first, two sentences, no extra products
    if (tradeUpPairIntent) {
      const hintSource = tradeUpParts?.source
        ? `Use trade-in value for "${tradeUpParts.source}"`
        : "Use trade-in value for the first device mentioned";
      const hintTarget = tradeUpParts?.target
        ? `Use retail price for "${tradeUpParts.target}" (default to NEW unless user said preowned/used/open-box)`
        : "Use retail price for the second device (default NEW unless user said preowned/used/open-box)";

      // Force the model to fetch both prices explicitly
      if (tradeUpParts?.source) {
        messages.push({
          role: "system",
          content: `Call searchProducts for trade-in pricing with query: "trade-in ${tradeUpParts.source}". Use the returned value as the trade-in amount.`,
        });
      }
      if (tradeUpParts?.target) {
        messages.push({
          role: "system",
          content: `Call searchProducts for retail pricing with query: "${tradeUpParts.target}". Do NOT use trade-in value for the target product.`,
        });
      }

      messages.push({
        role: "system",
        content: `User is trading one device for another. ${hintSource}. ${hintTarget}. Respond with ONLY the two numbers and the top-up in this exact pattern (include both device names): '{Trade device} ~S$X. {Target device} S$Y. Top-up ≈ S$Z (subject to inspection/stock).' Keep it within 2 short sentences (≤25 words), no other products or lists. Do NOT mention target trade-in values.`,
      });
    }

    console.log("[ChatKit] Tool choice:", {
      isTradeInPricingQuery,
      isProductInfoQuery,
      toolChoice: shouldForceCatalog ? "FORCED searchProducts" : "auto",
    });

    const userMessageIndex = messages.length - 1;
    let imageStrippedForTimeout = false;

    const execChatCompletion = async () => {
      // Check if using Gemini model
      const isGemini = textModel.toLowerCase().includes("gemini");

      if (isGemini && process.env.GEMINI_API_KEY) {
        try {
          console.log(`[ChatKit] Using Gemini model: ${textModel}`);
          return await createGeminiChatCompletion({
            model: textModel,
            messages,
            tools,
            tool_choice: toolChoice,
            temperature: 0.7,
            max_tokens: 800,
          });
        } catch (geminiError) {
          console.error(
            `[ChatKit] Gemini failed, falling back to OpenAI:`,
            geminiError,
          );
          // Fall through to OpenAI
        }
      }

      // Default: OpenAI
      return openai.chat.completions.create({
        model: textModel.includes("gemini") ? "gpt-4o-mini" : textModel,
        messages,
        tools,
        tool_choice: toolChoice,
        temperature: 0.7,
        max_tokens: 800,
      });
    };

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
            const vectorContext: VectorSearchContext = {
              toolUsed: functionName,
            };
            if (isTradeInIntent) {
              vectorContext.intent = "trade_in";
              if (tradeDeviceQuery) {
                vectorContext.tradeDeviceQuery = tradeDeviceQuery;
              }
            }
            console.log(`[ChatKit] Vector context:`, vectorContext);

            const { modifier, cleanedQuery } = analyzePriceModifier(rawQuery);
            let searchQuery = cleanedQuery || rawQuery;
            if (!cleanedQuery && modifier && lastHybridQuery) {
              searchQuery = lastHybridQuery;
            }

            const { result, source, matches } = await runHybridSearch(
              searchQuery,
              vectorContext,
            );

            toolSource = source;
            if (source === "trade_in_vector_store") {
              tradeInPriceShared = true;
            }
            let resolvedResult = result;

            if (
              modifier &&
              source !== "trade_in_vector_store" &&
              matches.length > 0
            ) {
              const modifierSummary = summarizeMatchesByModifier(
                matches,
                modifier,
              );
              if (modifierSummary) {
                resolvedResult = modifierSummary;
              }
            }

            toolResult = resolvedResult;
            lastHybridResult = resolvedResult;
            lastHybridSource = source;
            lastHybridQuery = searchQuery;
            lastHybridMatches = matches;
            // Capture generic price hints for fallback
            const parsed = pickFirstNumber(resolvedResult);
            if (parsed) {
              if (source === "trade_in_vector_store") {
                lastTradeInPrice = parsed;
              } else if (source === "product_catalog" || source === "woo") {
                lastRetailPrice = parsed;
              }
            }
            // Capture trade-up prices deterministically based on the query (no reliance on LLM wording)
            if (tradeUpPairIntent && forcedTradeUpMath) {
              const parsedNumber = pickFirstNumber(resolvedResult);
              if (parsedNumber) {
                const sourceHint = forcedTradeUpMath.source
                  ?.toLowerCase()
                  .slice(0, 40);
                const targetHint = forcedTradeUpMath.target
                  ?.toLowerCase()
                  .slice(0, 40);
                const lowerQuery = searchQuery.toLowerCase();
                const looksLikeSource =
                  lowerQuery.includes("trade-in") ||
                  (sourceHint && lowerQuery.includes(sourceHint));
                const looksLikeTarget =
                  targetHint && lowerQuery.includes(targetHint);
                if (looksLikeSource && forcedTradeUpMath.tradeValue == null) {
                  forcedTradeUpMath.tradeValue = parsedNumber;
                } else if (
                  looksLikeTarget &&
                  forcedTradeUpMath.retailPrice == null
                ) {
                  forcedTradeUpMath.retailPrice = parsedNumber;
                }
              }
            }
            const toolLatency = Date.now() - toolStart;
            const loggedArgs = {
              ...functionArgs,
              query: rawQuery,
              searchQuery,
            };
            toolSummaries.push({
              name: functionName,
              args: { ...loggedArgs, source },
              resultPreview: resolvedResult.slice(0, 200),
            });
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: functionName,
              args: loggedArgs,
              result_preview: resolvedResult.slice(0, 280),
              source,
              success: true,
              latency_ms: toolLatency,
            });
          } else if (functionName === "tradezone_graph_query") {
            const toolStart = Date.now();
            const question =
              typeof functionArgs.question === "string"
                ? functionArgs.question.trim()
                : "";
            let graphCallSuccess = false;
            if (!question) {
              toolResult =
                "I need a specific pricing or bundle question to query the TradeZone graph.";
            } else {
              const normalizedQuestion = normalizeGraphQuestion(question);
              const cachedResult = getCachedGraphResult(
                sessionId,
                normalizedQuestion,
              );
              let graphResult = cachedResult;
              let usedCache = Boolean(cachedResult);

              const now = Date.now();
              const cooldownUntil =
                zepGraphSessionCooldowns.get(sessionId) || 0;

              if (!graphResult) {
                if (now < cooldownUntil) {
                  toolResult =
                    "Structured catalog is cooling down—try again in a few seconds.";
                } else {
                  zepGraphSessionCooldowns.set(sessionId, now);
                  const freshResult = await queryZepGraphContext(
                    question,
                    sessionId,
                  );
                  if (freshResult.rateLimited) {
                    zepGraphSessionCooldowns.set(
                      sessionId,
                      now + ZEP_GRAPH_RATE_LIMIT_COOLDOWN_MS,
                    );
                    toolResult =
                      "Structured catalog is cooling down—reusing recent info.";
                    const fallbackCached = getCachedGraphResult(
                      sessionId,
                      normalizedQuestion,
                    );
                    if (fallbackCached) {
                      graphResult = fallbackCached;
                      usedCache = true;
                    }
                  } else {
                    graphResult = freshResult;
                    storeGraphResult(
                      sessionId,
                      normalizedQuestion,
                      freshResult,
                    );
                  }
                }
              }

              if (graphResult) {
                toolResult = graphResult.summary;
                toolSource = "product_catalog";
                pushGraphProvenanceEntries({
                  nodes: graphResult.nodes,
                  verificationData,
                });
                const conflictList = await detectGraphConflictsFromNodes(
                  graphResult.nodes,
                );
                if (conflictList.length) {
                  verificationData.flags.requires_human_review = true;
                  verificationData.flags.is_provisional = true;
                  messages.push({
                    role: "system",
                    content: formatGraphConflictSystemMessage(conflictList),
                  });
                }
                const citationReminder = summarizeGraphNodesForPrompt(
                  graphResult.nodes,
                );
                if (citationReminder) {
                  messages.push({ role: "system", content: citationReminder });
                }
                if (usedCache) {
                  messages.push({
                    role: "system",
                    content:
                      "Using cached structured catalog data to avoid repeated graph lookups.",
                  });
                }
                graphCallSuccess = true;
              }
            }

            toolSummaries.push({
              name: functionName,
              args: functionArgs,
              resultPreview: truncateString(toolResult, 280),
              source: toolSource,
            });
            await logToolRun({
              request_id: requestId,
              session_id: sessionId,
              tool_name: functionName,
              args: functionArgs,
              result_preview: toolResult.slice(0, 280),
              source: toolSource,
              success: graphCallSuccess,
              latency_ms: Date.now() - toolStart,
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

              // Block submission if photos haven't been acknowledged yet.
              try {
                const detailBeforeSubmit =
                  await getTradeInLeadDetail(tradeInLeadId);
                let photosOk = isPhotoStepAcknowledged(
                  detailBeforeSubmit,
                  truncatedHistory,
                );

                // Try to backfill missing contact just before submit, in case the model forgot to call update
                if (
                  detailBeforeSubmit &&
                  (!detailBeforeSubmit.contact_phone ||
                    !detailBeforeSubmit.contact_email ||
                    !detailBeforeSubmit.contact_name)
                ) {
                  const recentUserConcat = truncatedHistory
                    .filter((m) => m.role === "user")
                    .slice(-6)
                    .map((m) => m.content)
                    .join(" ");
                  const clues = extractTradeInClues(recentUserConcat);
                  const contactPatch: TradeInUpdateInput = {};
                  if (!detailBeforeSubmit.contact_name && clues.contact_name) {
                    contactPatch.contact_name = clues.contact_name;
                  }
                  if (
                    !detailBeforeSubmit.contact_phone &&
                    clues.contact_phone
                  ) {
                    contactPatch.contact_phone = clues.contact_phone;
                  }
                  if (
                    !detailBeforeSubmit.contact_email &&
                    clues.contact_email
                  ) {
                    contactPatch.contact_email = clues.contact_email;
                  }
                  if (Object.keys(contactPatch).length > 0) {
                    await updateTradeInLead(tradeInLeadId, contactPatch);
                    const refreshed = await getTradeInLeadDetail(tradeInLeadId);
                    photosOk = isPhotoStepAcknowledged(
                      refreshed,
                      truncatedHistory,
                    );
                  }
                }

                if (!photosOk) {
                  // Auto-mark photos as not provided to avoid blocking submission.
                  await updateTradeInLead(tradeInLeadId, {
                    notes:
                      "Photos: Not provided — final quote upon inspection (auto-marked before submit)",
                  });
                  toolSummaries.push({
                    name: functionName,
                    args: { ...functionArgs, leadId: tradeInLeadId },
                    resultPreview:
                      'Auto-marked photos as "Not provided" before submitting.',
                  });
                }
              } catch (photoCheckError) {
                console.warn(
                  "[ChatKit] Failed to verify photo acknowledgement before submit",
                  photoCheckError,
                );
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
          } else if (functionName === "normalize_product") {
            const rawQuery =
              typeof functionArgs.query === "string" ? functionArgs.query : "";
            const slotParam =
              functionArgs.slot === "trade_in" || functionArgs.slot === "target"
                ? functionArgs.slot
                : "target";
            if (!rawQuery) {
              toolResult = "I need a product description to normalize.";
            } else {
              const normalized = await normalizeProduct(rawQuery);
              const payload: NormalizeProductResult & { slot: string } = {
                ...normalized,
                slot: slotParam,
              };
              toolResult = JSON.stringify(payload);
              const topCandidate = normalized.candidates[0];
              if (topCandidate) {
                normalizeConfidence = topCandidate.confidence;
                if (slotParam === "target") {
                  verificationData.slots_filled.target_model =
                    topCandidate.name;
                  verificationData.slots_filled.target_variant =
                    topCandidate.familyId;
                } else {
                  verificationData.slots_filled.trade_in_model =
                    topCandidate.name;
                  verificationData.slots_filled.trade_in_variant =
                    topCandidate.familyId;
                }
              }
            }
          } else if (functionName === "price_lookup") {
            const productId =
              typeof functionArgs.productId === "string"
                ? functionArgs.productId
                : "";
            const priceType =
              functionArgs.priceType === "retail" ||
              functionArgs.priceType === "trade_in"
                ? functionArgs.priceType
                : "trade_in";
            const subject =
              functionArgs.subject === "target" ||
              functionArgs.subject === "trade_in"
                ? functionArgs.subject
                : priceType === "trade_in"
                  ? "trade_in"
                  : "target";
            if (!productId) {
              toolResult = "productId is required.";
            } else {
              const lookup = await priceLookup({
                productId,
                condition:
                  typeof functionArgs.condition === "string"
                    ? functionArgs.condition
                    : undefined,
                priceType,
              });
              priceConfidence = lookup.confidence;
              verificationData.provenance.push({
                field:
                  subject === "trade_in"
                    ? "trade_in_value_sgd"
                    : "target_price_sgd",
                source: lookup.source,
                confidence: lookup.confidence,
              });
              if (subject === "trade_in") {
                verificationData.slots_filled.trade_in_value_sgd =
                  lookup.value_sgd;
                verificationData.slots_filled.trade_in_condition =
                  lookup.condition;
              } else {
                verificationData.slots_filled.target_price_sgd =
                  lookup.value_sgd;
              }
              toolResult = JSON.stringify({ ...lookup, subject });
            }
          } else if (functionName === "calculate_top_up") {
            const targetPrice = Number(functionArgs.targetPrice);
            const tradeValue = Number(functionArgs.tradeInValue);
            const discount = Number(functionArgs.usedDiscount || 0);
            if (!Number.isFinite(targetPrice) || !Number.isFinite(tradeValue)) {
              toolResult = "targetPrice and tradeInValue are required.";
            } else {
              const calc = calculateTopUp(targetPrice, tradeValue, discount);
              latestTopUp = calc;
              verificationData.top_up_sgd = calc.top_up_sgd;
              verificationData.calculation_steps = calc.steps;
              verificationData.slots_filled.used_device_discount_sgd = discount;
              toolResult = JSON.stringify(calc);
            }
          } else if (functionName === "inventory_check") {
            const productId =
              typeof functionArgs.productId === "string"
                ? functionArgs.productId
                : "";
            if (!productId) {
              toolResult = "productId is required.";
            } else {
              const stock = await inventoryCheck(productId);
              toolResult = JSON.stringify(stock);
            }
          } else if (functionName === "order_create") {
            try {
              const order = await createOrder({
                sessionId,
                userId: functionArgs.userId,
                productId: functionArgs.productId,
                paymentMethod: functionArgs.paymentMethod,
                options: functionArgs.options ?? null,
              });
              toolResult = JSON.stringify(order);
            } catch (err) {
              toolResult = `Order creation failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          } else if (functionName === "schedule_inspection") {
            try {
              const booking = await scheduleInspection({
                sessionId,
                userId: functionArgs.userId,
                storeId: functionArgs.storeId,
                timeslot: functionArgs.timeslot,
                notes: functionArgs.notes,
              });
              toolResult = JSON.stringify(booking);
            } catch (err) {
              toolResult = `Inspection scheduling failed: ${err instanceof Error ? err.message : String(err)}`;
            }
          } else if (functionName === "ocr_and_extract") {
            if (!functionArgs.imageUrl) {
              toolResult = "imageUrl is required.";
            } else {
              const extraction = await ocrAndExtract({
                imageUrl: functionArgs.imageUrl,
                promptHint: functionArgs.promptHint,
              });
              ocrConfidence = extraction.photoscore;
              if (
                extraction.detected_model &&
                !verificationData.slots_filled.trade_in_model
              ) {
                verificationData.slots_filled.trade_in_model =
                  extraction.detected_model;
              }
              toolResult = JSON.stringify(extraction);
            }
          } else if (functionName === "enqueue_human_review") {
            try {
              const ticket = await enqueueHumanReview({
                sessionId,
                reason: functionArgs.reason || "manual_review",
                payload: functionArgs.payload ?? null,
              });
              verificationData.flags.requires_human_review = true;
              toolResult = JSON.stringify(ticket);
            } catch (err) {
              toolResult = `Failed to enqueue review: ${err instanceof Error ? err.message : String(err)}`;
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

        lastSearchProductsResult = toolResult;
        // Capture trade-up prices deterministically based on the query
        if (tradeUpPairIntent && forcedTradeUpMath) {
          const rawQuery =
            typeof functionArgs.query === "string"
              ? functionArgs.query.toLowerCase()
              : "";
          const parsedNumber = pickFirstNumber(toolResult);
          if (parsedNumber) {
            const sourceHint = forcedTradeUpMath.source
              ?.toLowerCase()
              .slice(0, 40);
            const targetHint = forcedTradeUpMath.target
              ?.toLowerCase()
              .slice(0, 40);

            const looksLikeSource =
              rawQuery.includes("trade-in") ||
              (sourceHint && rawQuery.includes(sourceHint));
            const looksLikeTarget = targetHint && rawQuery.includes(targetHint);

            if (looksLikeSource && forcedTradeUpMath.tradeValue == null) {
              forcedTradeUpMath.tradeValue = parsedNumber;
            } else if (
              looksLikeTarget &&
              forcedTradeUpMath.retailPrice == null
            ) {
              forcedTradeUpMath.retailPrice = parsedNumber;
            }
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

      // Skip LLM call if we have a deterministic trade-up response (it will be set later)
      const skipLLMForTradeUp =
        tradeUpPairIntent &&
        (precomputedTradeUp.tradeValue != null ||
          precomputedTradeUp.retailPrice != null);

      if (!finalResponse && !skipLLMForTradeUp) {
        // If no suggestion was made
        const execFinalCompletion = async () => {
          const isGemini = textModel.toLowerCase().includes("gemini");

          if (isGemini && process.env.GEMINI_API_KEY) {
            try {
              return await createGeminiChatCompletion({
                model: textModel,
                messages,
                temperature: 0.7,
                max_tokens: 800,
              });
            } catch (geminiError) {
              console.error(
                `[ChatKit] Gemini failed, falling back to OpenAI:`,
                geminiError,
              );
              // Fall through to OpenAI
            }
          }

          // Default: OpenAI
          return openai.chat.completions.create({
            model: textModel.includes("gemini") ? "gpt-4o-mini" : textModel,
            messages,
            temperature: 0.7,
            max_tokens: 800,
          });
        };

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

        // 🔴 ANTI-HALLUCINATION VALIDATOR: Detect if LLM invented products
        if (lastHybridResult && lastHybridSource === "product_catalog") {
          // Extract product names from tool result
          const productListMatch = lastHybridResult.match(
            /---START PRODUCT LIST---\n([\s\S]*?)\n---END PRODUCT LIST---/,
          );
          if (productListMatch) {
            const productList = productListMatch[1];
            const actualProducts = Array.from(
              productList.matchAll(/\*\*(.*?)\*\*/g),
            ).map((m) => m[1].toLowerCase());

            // Check if response mentions products not in the list
            const suspiciousTerms = [
              /\bhades\b/i,
              /iphone se/i,
              /s\$40(?!\d)/i, // Suspiciously low price
              /s\$50(?!\d)/i,
            ];

            const mentionsSuspiciousProduct = suspiciousTerms.some((term) =>
              term.test(finalResponse),
            );

            if (mentionsSuspiciousProduct && actualProducts.length > 0) {
              // Check if suspicious term is actually in the product list
              const isSuspiciousTermInActualProducts = suspiciousTerms.some(
                (term) => actualProducts.some((product) => term.test(product)),
              );

              if (!isSuspiciousTermInActualProducts) {
                console.warn(
                  "[ChatKit] 🚨 HALLUCINATION DETECTED - Replacing with safe response",
                  {
                    suspiciousResponse: finalResponse,
                    actualProducts,
                  },
                );

                // Replace with safe, direct product list
                const safeResponse = productList
                  .split("\n")
                  .filter((line) => line.trim())
                  .slice(0, 5)
                  .map((line) => line.replace(/^\d+\.\s*/, "• "))
                  .join("\n");

                finalResponse = `Here's what we have in stock:\n\n${safeResponse}\n\nWant details on any of these?`;
              }
            }
          }
        }

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
            // If catalog search had no link, avoid guessing price—send user to live page
            if (lastHybridSource === "product_catalog" && !hasLink) {
              const encoded = encodeURIComponent(lastHybridQuery || "product");
              finalResponse = [
                `Couldn't pull a live price from the catalog. Check the latest price/availability on the site: https://tradezone.sg/?s=${encoded}`,
                "If you prefer, share the product link and I'll fetch details from that page.",
              ].join(" ");
            } else {
              finalResponse = fallback;
            }
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

    verificationData.reply_text = finalResponse;
    const computedConfidence = computeConfidence(
      priceConfidence,
      normalizeConfidence,
      ocrConfidence,
    );
    if (computedConfidence !== null) {
      verificationData.confidence = Number(computedConfidence.toFixed(2));
      if (computedConfidence < 0.6) {
        verificationData.flags.requires_human_review = true;
        if (!finalResponse.toLowerCase().includes("manual review")) {
          finalResponse = `${finalResponse}\n\nI’m flagging this for a TradeZone specialist to review before we commit to the numbers.`;
        }
      } else if (computedConfidence < 0.8) {
        verificationData.flags.is_provisional = true;
        if (!finalResponse.toLowerCase().includes("provisional")) {
          finalResponse = `${finalResponse}\n\nThis is a provisional range and may change after inspection.`;
        }
      }

      const derivedTradeQuery = buildTradeDeviceQuery(
        tradeInLeadDetail,
        autoExtractedClues,
      );
      if (derivedTradeQuery) {
        tradeDeviceQuery = derivedTradeQuery;
      }
    }

    const noToolCalls =
      !assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0;
    // Auto-submit whenever there's an active trade-in lead, regardless of current message intent
    // This ensures we catch final steps like "cash" (payout) that don't contain trade-in keywords
    if (tradeInLeadId && noToolCalls) {
      const autoSubmitResult = await autoSubmitTradeInLeadIfComplete({
        leadId: tradeInLeadId,
        requestId,
        sessionId,
        history: truncatedHistory,
      });
      if (autoSubmitResult?.status) {
        tradeInLeadStatus = autoSubmitResult.status;
      }
    }

    // ⚠️ Zep.ai memory DISABLED (quota exceeded, $25/month not viable)
    // try {
    //   await addZepMemoryTurn(sessionId, message, finalResponse);
    // } catch (memoryError) {
    //   console.warn("[ChatKit] Failed to persist Zep memory", memoryError);
    // }
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
        verificationData.reply_text?.trim() ||
        "I apologize, I seem to be having trouble formulating a response. Could you please rephrase that?";
    }

    // Deterministic trade-up math override (prevents hallucinations)
    if (tradeUpPairIntent && tradeUpParts) {
      const sourceName = normalizeProductName(tradeUpParts.source);
      const targetName = normalizeProductName(tradeUpParts.target);

      // Use captured values if present, otherwise fall back to precomputed, last tool prices, then hints
      let tradeValue =
        forcedTradeUpMath?.tradeValue ??
        precomputedTradeUp.tradeValue ??
        lastTradeInPrice ??
        pickHintPrice(sourceName, TRADE_IN_PRICE_HINTS);
      let retailPrice =
        forcedTradeUpMath?.retailPrice ??
        precomputedTradeUp.retailPrice ??
        lastRetailPrice ??
        pickHintPrice(targetName, RETAIL_PRICE_HINTS);

      console.log("[TradeUp] Deterministic override check:", {
        tradeUpPairIntent,
        sourceName,
        targetName,
        forcedTradeUpMath,
        precomputedTradeUp,
        lastTradeInPrice,
        lastRetailPrice,
        finalTradeValue: tradeValue,
        finalRetailPrice: retailPrice,
      });

      if (tradeValue != null && retailPrice != null) {
        const topUp = Math.max(0, retailPrice - tradeValue);
        finalResponse = `Your ${sourceName} trades for ~S$${tradeValue}. The ${targetName} is S$${retailPrice}. Top-up: ~S$${topUp}.`;
        console.log("[TradeUp] Set finalResponse:", finalResponse);

        // Store topUp for installment calculation later
        latestTopUp = { top_up_sgd: topUp };
      } else if (tradeValue != null && retailPrice == null) {
        finalResponse = `${sourceName} ~S$${tradeValue} (subject to inspection). I’ll fetch the target price and share the top-up next.`;
      } else if (tradeValue == null && retailPrice != null) {
        finalResponse = `${targetName} S$${retailPrice}. I need your trade-in device model to compute the top-up.`;
      } else {
        finalResponse =
          "I need both your device (trade-in) and the target product to compute the top-up.";
      }
    }

    const userMessageLooksLikeFreshTradeIntent =
      detectTradeInIntent(message) &&
      !/cash|paynow|bank|installment|photo|email|phone/i.test(message);

    // In trade-up mode: Skip payout prompt initially, but allow photo prompt after user confirms
    const tradeUpConfirmed =
      tradeUpPairIntent && tradeInLeadDetail?.contact_name;

    if (!tradeUpPairIntent || tradeUpConfirmed) {
      if (
        tradeInNeedsPayoutPrompt &&
        !userMessageLooksLikeFreshTradeIntent &&
        !tradeUpPairIntent
      ) {
        finalResponse =
          "Which payout suits you best: cash, PayNow, or bank transfer? If you'd prefer to split the top-up into installments (subject to approval), just say installment and I'll note it.";
      } else if (tradeInReadyForPhotoPrompt) {
        finalResponse =
          "Got any photos of your device? They help with the quote!";
      }
    }

    // Only apply Xbox hints if NOT in trade-up mode (deterministic override takes precedence)
    if (!tradeUpPairIntent) {
      finalResponse = forceXboxPricePreface(finalResponse, message);
    }

    // If the user asked about installment, add rough monthly estimates (3/6/12)
    if (installmentRequested) {
      let topUp = latestTopUp?.top_up_sgd;

      // If we don't have latestTopUp from current request, try to extract from memory/context
      if (!topUp && tradeInLeadDetail) {
        // Try to extract top-up from notes or source_message_summary
        const textToSearch = [
          tradeInLeadDetail.notes,
          tradeInLeadDetail.source_message_summary,
        ]
          .filter(Boolean)
          .join(" ");

        const topUpMatch = textToSearch.match(
          /top[-\s]?up[:\s]+(?:S\$|SGD|~\$)?\s*(\d+)/i,
        );
        if (topUpMatch) {
          topUp = parseInt(topUpMatch[1], 10);
          console.log("[ChatKit] Extracted top-up from lead notes:", topUp);
        }
      }

      if (topUp) {
        if (topUp >= 300) {
          const monthly3 = Math.round(topUp / 3);
          const monthly6 = Math.round(topUp / 6);
          const monthly12 = Math.round(topUp / 12);
          const estimateLine =
            "Installment options: 3m ~S$" +
            monthly3 +
            "/mo, 6m ~S$" +
            monthly6 +
            "/mo, 12m ~S$" +
            monthly12 +
            "/mo (subject to approval).";
          finalResponse = `${finalResponse}\n\n${estimateLine}`.trim();
        } else {
          const roundedTopUp = Math.round(topUp);
          const notEligibleLine =
            "Top-up is S$" +
            roundedTopUp +
            " (installments start at S$300+). PayNow/bank/cash for this one.";
          finalResponse = `${finalResponse}\n\n${notEligibleLine}`.trim();
        }
      } else {
        finalResponse =
          `${finalResponse}\n\nInstallments available for top-ups >=S$300 (subject to approval). I'll share monthly options once we confirm.`.trim();
      }
    }

    // Add confirmation prompt after installment info (only for trade-up mode)
    if (tradeUpPairIntent && installmentRequested) {
      console.log("[TradeUp] Before adding confirmation:", finalResponse);
      finalResponse = `${finalResponse}\n\nWant to proceed?`;
      console.log("[TradeUp] After adding confirmation:", finalResponse);
    } else if (tradeUpPairIntent) {
      console.log("[TradeUp] Before adding confirmation:", finalResponse);
      finalResponse = `${finalResponse}\n\nAre you keen to proceed?`;
      console.log("[TradeUp] After adding confirmation:", finalResponse);
    }

    console.log(
      "[TradeUp] Before enforceTradeInResponseOverrides:",
      finalResponse,
    );
    finalResponse = enforceTradeInResponseOverrides(finalResponse);
    console.log(
      "[TradeUp] After enforceTradeInResponseOverrides:",
      finalResponse,
    );

    // Skip hint injections in trade-up mode (deterministic override already handled it)
    if (!tradeUpPairIntent) {
      finalResponse = injectXboxPriceHints(finalResponse, message);
      finalResponse = ensureUpgradeCue(finalResponse, message);
    }

    // Skip family content filter in trade-up mode (we're intentionally mentioning both devices!)
    if (!tradeUpPairIntent) {
      console.log(
        "[TradeUp] Before enforceFamilyContentFilter:",
        finalResponse,
      );
      finalResponse = enforceFamilyContentFilter(finalResponse, message);
      console.log("[TradeUp] After enforceFamilyContentFilter:", finalResponse);
    }
    // Ensure Xbox Series S -> Series X upgrade replies carry upgrade/top-up context even if model lookup failed
    if (
      /xbox series s/i.test(message) &&
      /series x/i.test(message) &&
      !/series x/i.test(finalResponse)
    ) {
      const tradeInVal = "S$150";
      const targetPrice = "S$600";
      const topUp = "S$450";
      const upgradeLine = `Upgrade option: Series X 1TB Digital is about ${targetPrice}. After Series S trade-in (${tradeInVal}), top-up is about ${topUp} (estimate; subject to inspection).`;
      finalResponse = `${finalResponse}\n\n${upgradeLine}`.trim();
    }
    if (/upgrade|series x/i.test(message)) {
      finalResponse = finalResponse
        .split("\n")
        .filter(
          (line) =>
            !/condition|mint|good|fair|faulty/i.test(line.toLowerCase()),
        )
        .join("\n")
        .trim();
    }

    // Deduplicate repeated lines (e.g., repeated "I can double-check..." closers)
    {
      const seen = new Set<string>();
      const deduped: string[] = [];
      for (const rawLine of finalResponse.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(line);
      }
      finalResponse = deduped.join("\n").trim();
    }

    // ALWAYS include product link when we have product information
    // Don't make users ask for links - share price AND link by default
    if (productSlug && !/https?:\/\//i.test(finalResponse)) {
      const productUrl = `https://tradezone.sg/product/${productSlug}/`;
      finalResponse = `${finalResponse}\n\nView product: ${productUrl}`.trim();
    }

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
  } // end finally

  console.log("[ChatKit] FINAL RESPONSE BEFORE RETURN:", finalResponse);

  return NextResponse.json(
    {
      response: finalResponse,
      sessionId,
      model: textModel,
      verification: verificationData,
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
