/**
 * Agent Tools Index
 * Exports all available tools for the TradeZone chatbot agent
 */

export { vectorSearchTool, handleVectorSearch } from './vectorSearch'
export { perplexitySearchTool, handlePerplexitySearch } from './perplexitySearch'
export { emailSendTool, handleEmailSend } from './emailSend'

/**
 * Get all available tools as an array
 */
export function getAllTools() {
  return [
    vectorSearchTool,
    perplexitySearchTool,
    emailSendTool
  ]
}

/**
 * Tool handler map
 * Maps tool names to their handler functions
 */
export const toolHandlers = {
  searchProducts: handleVectorSearch,
  searchtool: handlePerplexitySearch,
  sendemail: handleEmailSend
}
