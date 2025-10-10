/**
 * Agent Tools Index
 * Exports all available tools for the TradeZone chatbot agent
 */

import { handleVectorSearch } from "./vectorSearch";
import { handlePerplexitySearch } from "./perplexitySearch";
import { handleEmailSend } from "./emailSend";

export { vectorSearchTool } from "./vectorSearch";
export { perplexitySearchTool } from "./perplexitySearch";
export { emailSendTool } from "./emailSend";

/**
 * Get all available tools as an array
 */
export function getAllTools() {
  const { vectorSearchTool } = require("./vectorSearch");
  const { perplexitySearchTool } = require("./perplexitySearch");
  const { emailSendTool } = require("./emailSend");

  return [vectorSearchTool, perplexitySearchTool, emailSendTool];
}

/**
 * Tool handler map
 * Maps tool names to their handler functions
 */
export const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  searchProducts: handleVectorSearch,
  searchtool: handlePerplexitySearch,
  sendemail: handleEmailSend,
};
