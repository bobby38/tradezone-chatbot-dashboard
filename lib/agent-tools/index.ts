import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  findCatalogMatches,
  getCatalogModelById,
  type CatalogMatch,
  type CatalogConditionSummary,
  type PriceRange,
} from "@/lib/chatkit/productCatalog";

const WOO_PRODUCTS_PATH = path.join(
  process.cwd(),
  "public",
  "tradezone-WooCommerce-Products.json",
);

const PRICE_GRID_SOURCE = "products_master.json";
const REVIEW_TABLE = "agent_review_queue";
const ORDER_TABLE = "agent_orders";
const INSPECTION_TABLE = "agent_inspections";

let wooProductsCache: {
  loadedAt: number;
  map: Map<number, WooProduct>;
} | null = null;

interface WooProduct {
  id: number;
  name: string;
  permalink: string;
  price: string;
  regular_price?: string;
  stock_status?: string;
  stock_quantity?: number | null;
}

export interface NormalizeProductResult {
  query: string;
  candidates: Array<{
    productId: string;
    familyId: string;
    name: string;
    permalink?: string;
    priceRange?: PriceRange | null;
    flagshipCondition?: string;
    confidence: number;
  }>;
}

export interface PriceLookupInput {
  productId: string;
  condition?: string;
  priceType?: "retail" | "trade_in";
}

export interface PriceLookupResult {
  productId: string;
  condition: string;
  priceType: "retail" | "trade_in";
  currency: "SGD";
  value_sgd: number | null;
  min_sgd: number | null;
  max_sgd: number | null;
  source: string;
  confidence: number;
}

export interface TopUpResult {
  top_up_sgd: number;
  steps: string[];
}

export interface InventoryCheckResult {
  productId: string;
  name: string;
  in_stock: boolean;
  stock_count: number | null;
  location: string;
  price_sgd: number | null;
  permalink?: string;
}

export interface OrderPayload {
  sessionId?: string;
  userId?: string;
  productId: string;
  paymentMethod: string;
  options?: Record<string, unknown> | null;
}

export interface InspectionPayload {
  sessionId?: string;
  userId?: string;
  storeId?: string;
  timeslot: string;
  notes?: string;
}

export interface HumanReviewPayload {
  sessionId: string;
  reason: string;
  payload?: Record<string, unknown>;
}

export interface OcrExtractInput {
  imageUrl: string;
  promptHint?: string;
}

export interface OcrExtractResult {
  detected_model: string | null;
  serial_hint: string | null;
  photoscore: number;
  raw_response?: string;
}

function getSupabaseServerClient(): SupabaseClient | null {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

async function loadWooProducts(): Promise<Map<number, WooProduct>> {
  if (wooProductsCache && Date.now() - wooProductsCache.loadedAt < 5 * 60 * 1000) {
    return wooProductsCache.map;
  }
  try {
    const raw = await fs.readFile(WOO_PRODUCTS_PATH, "utf8");
    const parsed = JSON.parse(raw) as WooProduct[];
    const map = new Map<number, WooProduct>();
    parsed.forEach((product) => map.set(product.id, product));
    wooProductsCache = { map, loadedAt: Date.now() };
    return map;
  } catch (error) {
    console.warn("[agent-tools] Failed to load WooCommerce snapshot", error);
    wooProductsCache = { map: new Map(), loadedAt: Date.now() };
    return wooProductsCache.map;
  }
}

function scoreCandidate(match: CatalogMatch, index: number): number {
  const base = 1 - index * 0.15;
  return Math.max(0, Math.min(1, base));
}

export async function normalizeProduct(
  query: string,
  limit = 5,
): Promise<NormalizeProductResult> {
  const matches = await findCatalogMatches(query, limit);
  const candidates = matches.map((match, idx) => ({
    productId: match.modelId,
    familyId: match.familyId,
    name: match.name,
    permalink: match.permalink,
    priceRange: match.priceRange,
    flagshipCondition: match.flagshipCondition?.label,
    confidence: scoreCandidate(match, idx),
  }));
  return { query, candidates };
}

function selectCondition(
  model: CatalogMatch | null,
  condition?: string,
): CatalogConditionSummary | null {
  if (!model) return null;
  if (condition) {
    const normalized = condition.toLowerCase();
    const match = model.conditions.find(
      (summary) => summary.condition.toLowerCase() === normalized,
    );
    if (match) return match;
  }
  return model.flagshipCondition || model.conditions[0] || null;
}

export async function priceLookup(
  input: PriceLookupInput,
): Promise<PriceLookupResult> {
  const { productId, condition, priceType = "trade_in" } = input;
  const model = await getCatalogModelById(productId);
  if (!model) {
    return {
      productId,
      condition: condition || "brand_new",
      priceType,
      currency: "SGD",
      value_sgd: null,
      min_sgd: null,
      max_sgd: null,
      source: PRICE_GRID_SOURCE,
      confidence: 0.2,
    };
  }

  const catalogMatch: CatalogMatch = {
    modelId: model.modelId,
    familyId: model.familyId,
    familyTitle: model.familyTitle,
    name: model.title,
    permalink: model.permalink,
    price: undefined,
    priceRange: model.priceRange,
    familyRange: model.familyRange,
    conditions: model.conditions,
    flagshipCondition: model.conditions[0] || null,
    warnings: model.warnings,
  };

  const summary = selectCondition(catalogMatch, condition);
  const resolvedCondition = summary?.condition || condition || "brand_new";

  let value: number | null = null;
  let min: number | null = null;
  let max: number | null = null;
  if (priceType === "retail") {
    value = summary?.basePrice ?? null;
  } else if (summary?.tradeIn) {
    min = summary.tradeIn.min ?? summary.tradeIn.max ?? null;
    max = summary.tradeIn.max ?? summary.tradeIn.min ?? null;
    if (min !== null && max !== null) {
      value = (min + max) / 2;
    } else {
      value = min ?? max;
    }
  }

  const confidence = value === null ? 0.4 : 0.9;

  return {
    productId,
    condition: resolvedCondition,
    priceType,
    currency: "SGD",
    value_sgd: value,
    min_sgd: min,
    max_sgd: max,
    source: PRICE_GRID_SOURCE,
    confidence,
  };
}

export function calculateTopUp(
  targetPrice: number,
  tradeInValue: number,
  usedDiscount = 0,
): TopUpResult {
  const normalizedTarget = Math.round(targetPrice);
  const normalizedTrade = Math.round(tradeInValue);
  const normalizedDiscount = Math.round(usedDiscount || 0);
  const raw = normalizedTarget - normalizedTrade - normalizedDiscount;
  const topUp = Math.max(0, raw);
  const steps = [
    `target_price_sgd (${normalizedTarget}) minus trade_in_value_sgd (${normalizedTrade}) minus used_device_discount_sgd (${normalizedDiscount}) equals ${topUp}`,
  ];
  return { top_up_sgd: topUp, steps };
}

export async function inventoryCheck(
  productId: string,
): Promise<InventoryCheckResult> {
  const numericId = Number(productId);
  const [model, products] = await Promise.all([
    getCatalogModelById(productId),
    loadWooProducts(),
  ]);
  const woo = products.get(Number.isNaN(numericId) ? -1 : numericId);
  const price = woo?.price ? Number(woo.price) : model?.priceRange?.max || null;
  const stockStatus =
    woo?.stock_status ||
    (model?.conditions.some((c) => c.soldOut) ? "outofstock" : "instock");
  return {
    productId,
    name: model?.title || woo?.name || "Unknown product",
    in_stock: stockStatus === "instock",
    stock_count: woo?.stock_quantity ?? null,
    location: "TradeZone Warehouse",
    price_sgd: price || null,
    permalink: model?.permalink || woo?.permalink,
  };
}

export async function createOrder(
  payload: OrderPayload,
): Promise<{ order_id: string; status: string }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase not configured for createOrder");
  }
  const insertPayload = {
    session_id: payload.sessionId ?? null,
    user_id: payload.userId ?? null,
    product_id: payload.productId,
    payment_method: payload.paymentMethod,
    options: payload.options ?? null,
    status: "queued",
  };
  const { data, error } = await supabase
    .from(ORDER_TABLE)
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return { order_id: data.id, status: data.status };
}

export async function scheduleInspection(
  payload: InspectionPayload,
): Promise<{ booking_id: string; confirmation: string }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase not configured for scheduleInspection");
  }
  const insertPayload = {
    session_id: payload.sessionId ?? null,
    user_id: payload.userId ?? null,
    store_id: payload.storeId ?? "hougang",
    timeslot: payload.timeslot,
    notes: payload.notes ?? null,
  };
  const { data, error } = await supabase
    .from(INSPECTION_TABLE)
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    throw error;
  }
  const confirmation = `Inspection booked for ${data.timeslot} at store ${data.store_id}`;
  return { booking_id: data.id, confirmation };
}

export async function enqueueHumanReview(
  payload: HumanReviewPayload,
): Promise<{ ticket_id: string }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase not configured for enqueueHumanReview");
  }
  const insertPayload = {
    session_id: payload.sessionId,
    reason: payload.reason,
    payload: payload.payload ?? null,
    status: "open",
  };
  const { data, error } = await supabase
    .from(REVIEW_TABLE)
    .insert(insertPayload)
    .select()
    .single();
  if (error) {
    throw error;
  }
  return { ticket_id: data.id };
}

export async function ocrAndExtract(
  input: OcrExtractInput,
): Promise<OcrExtractResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      detected_model: null,
      serial_hint: null,
      photoscore: 0.4,
      raw_response: "OpenAI API key missing",
    };
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt =
    input.promptHint ||
    "Identify the consumer electronics model and any serial hints from this photo. Respond as JSON with keys detected_model, serial_hint, clarity_score (0-1).";
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: input.imageUrl },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "photo_extract",
        schema: {
          type: "object",
          properties: {
            detected_model: { type: ["string", "null"] },
            serial_hint: { type: ["string", "null"] },
            clarity_score: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["detected_model", "serial_hint", "clarity_score"],
          additionalProperties: false,
        },
      },
    },
  });
  const text = response.output?.[0]?.content?.[0]?.text;
  if (!text) {
    return {
      detected_model: null,
      serial_hint: null,
      photoscore: 0.4,
      raw_response: JSON.stringify(response),
    };
  }
  try {
    const parsed = JSON.parse(text);
    return {
      detected_model: parsed.detected_model ?? null,
      serial_hint: parsed.serial_hint ?? null,
      photoscore:
        typeof parsed.clarity_score === "number" ? parsed.clarity_score : 0.5,
      raw_response: text,
    };
  } catch (error) {
    console.warn("[agent-tools] Failed to parse OCR response", error);
    return {
      detected_model: null,
      serial_hint: null,
      photoscore: 0.4,
      raw_response: text,
    };
  }
}
