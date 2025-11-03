/**
 * Agent Tools Index
 * Exports all available tools for the TradeZone chatbot agent
 */

import { handleVectorSearch, type VectorSearchContext } from "./vectorSearch";
import { handlePerplexitySearch } from "./perplexitySearch";
import { handleEmailSend } from "./emailSend";

// Export tool definitions
export { vectorSearchTool } from "./vectorSearch";
export { perplexitySearchTool } from "./perplexitySearch";
export { emailSendTool } from "./emailSend";

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

  return [vectorSearchTool, perplexitySearchTool, emailSendTool];
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
};
