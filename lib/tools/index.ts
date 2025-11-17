/**
 * Agent Tools Index
 * Exports all available tools for the TradeZone chatbot agent
 */

import { handleVectorSearch, type VectorSearchContext } from "./vectorSearch";
import { handlePerplexitySearch } from "./perplexitySearch";
import { handleEmailSend } from "./emailSend";
import {
  normalizeProduct,
  priceLookup,
  calculateTopUp,
  inventoryCheck,
  createOrder,
  scheduleInspection,
  ocrAndExtract,
  enqueueHumanReview,
} from "@/lib/agent-tools";

// Export tool definitions
export { vectorSearchTool } from "./vectorSearch";
export { perplexitySearchTool } from "./perplexitySearch";
export { emailSendTool } from "./emailSend";

export const normalizeProductTool = {
  type: "function" as const,
  function: {
    name: "normalize_product",
    description:
      "Normalize a free-text query into canonical TradeZone product IDs and ranked candidates.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product description" },
        slot: {
          type: "string",
          enum: ["target", "trade_in"],
          description: "Which slot to apply the normalized product to",
        },
      },
      required: ["query"],
    },
  },
};

export const priceLookupTool = {
  type: "function" as const,
  function: {
    name: "price_lookup",
    description:
      "Fetch authoritative retail or trade-in pricing for a canonical product ID.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Canonical product ID" },
        condition: {
          type: "string",
          description: "Condition key (brand_new, pre_owned, mint, etc.)",
        },
        priceType: {
          type: "string",
          enum: ["retail", "trade_in"],
          description: "Price type",
        },
        subject: {
          type: "string",
          enum: ["target", "trade_in"],
          description: "Which slot this price applies to",
        },
      },
      required: ["productId"],
    },
  },
};

export const calculateTopUpTool = {
  type: "function" as const,
  function: {
    name: "calculate_top_up",
    description:
      "Deterministically calculate the top-up amount between a target price and trade-in value.",
    parameters: {
      type: "object",
      properties: {
        targetPrice: { type: "number" },
        tradeInValue: { type: "number" },
        usedDiscount: { type: "number", description: "Discount applied" },
      },
      required: ["targetPrice", "tradeInValue"],
    },
  },
};

export const inventoryCheckTool = {
  type: "function" as const,
  function: {
    name: "inventory_check",
    description: "Check TradeZone stock status for a canonical product ID.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
      },
      required: ["productId"],
    },
  },
};

export const orderCreateTool = {
  type: "function" as const,
  function: {
    name: "order_create",
    description:
      "Create a draft order / reservation for the specified product and payment method.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        userId: { type: "string" },
        productId: { type: "string" },
        paymentMethod: { type: "string" },
        options: { type: "object", additionalProperties: true },
      },
      required: ["productId", "paymentMethod"],
    },
  },
};

export const scheduleInspectionTool = {
  type: "function" as const,
  function: {
    name: "schedule_inspection",
    description:
      "Schedule an in-store inspection timeslot for a trade-in or service request.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        userId: { type: "string" },
        storeId: { type: "string" },
        timeslot: { type: "string" },
        notes: { type: "string" },
      },
      required: ["timeslot"],
    },
  },
};

export const ocrExtractTool = {
  type: "function" as const,
  function: {
    name: "ocr_and_extract",
    description:
      "Run OCR + device recognition on an uploaded image to detect model hints.",
    parameters: {
      type: "object",
      properties: {
        imageUrl: { type: "string" },
        promptHint: { type: "string" },
      },
      required: ["imageUrl"],
    },
  },
};

export const enqueueHumanReviewTool = {
  type: "function" as const,
  function: {
    name: "enqueue_human_review",
    description:
      "Send the current session to a TradeZone human reviewer when confidence is low or data conflicts.",
    parameters: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        reason: { type: "string" },
        payload: { type: "object", additionalProperties: true },
      },
      required: ["sessionId", "reason"],
    },
  },
};

// Export handler functions
export {
  handleVectorSearch,
  handlePerplexitySearch,
  handleEmailSend,
  type VectorSearchContext,
  type VectorSearchResult,
};

/**
 * Get all available tools as an array
 */
export function getAllTools() {
  const { vectorSearchTool } = require("./vectorSearch");
  const { perplexitySearchTool } = require("./perplexitySearch");
  const { emailSendTool } = require("./emailSend");

  return [
    vectorSearchTool,
    perplexitySearchTool,
    emailSendTool,
    normalizeProductTool,
    priceLookupTool,
    calculateTopUpTool,
    inventoryCheckTool,
    orderCreateTool,
    scheduleInspectionTool,
    ocrExtractTool,
    enqueueHumanReviewTool,
  ];
}

/**
 * Tool handler map
 * Maps tool names to their handler functions
 */
export const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  searchProducts: async (args) => {
    const response = await handleVectorSearch(args.query);
    return response.text;
  },
  searchtool: handlePerplexitySearch,
  sendemail: handleEmailSend,
  normalize_product: async (args) => {
    const result = await normalizeProduct(args.query);
    const payload = args.slot
      ? { ...result, slot: args.slot }
      : result;
    return JSON.stringify(payload);
  },
  price_lookup: async (args) => {
    const result = await priceLookup({
      productId: args.productId,
      condition: args.condition,
      priceType: args.priceType,
    });
    const payload = args.subject
      ? { ...result, subject: args.subject }
      : result;
    return JSON.stringify(payload);
  },
  calculate_top_up: async (args) => {
    const result = calculateTopUp(args.targetPrice, args.tradeInValue, args.usedDiscount);
    return JSON.stringify(result);
  },
  inventory_check: async (args) => {
    const result = await inventoryCheck(args.productId);
    return JSON.stringify(result);
  },
  order_create: async (args) => {
    const result = await createOrder({
      sessionId: args.sessionId,
      userId: args.userId,
      productId: args.productId,
      paymentMethod: args.paymentMethod,
      options: args.options ?? null,
    });
    return JSON.stringify(result);
  },
  schedule_inspection: async (args) => {
    const result = await scheduleInspection({
      sessionId: args.sessionId,
      userId: args.userId,
      storeId: args.storeId,
      timeslot: args.timeslot,
      notes: args.notes,
    });
    return JSON.stringify(result);
  },
  ocr_and_extract: async (args) => {
    const result = await ocrAndExtract({
      imageUrl: args.imageUrl,
      promptHint: args.promptHint,
    });
    return JSON.stringify(result);
  },
  enqueue_human_review: async (args) => {
    const result = await enqueueHumanReview({
      sessionId: args.sessionId,
      reason: args.reason,
      payload: args.payload,
    });
    return JSON.stringify(result);
  },
};
