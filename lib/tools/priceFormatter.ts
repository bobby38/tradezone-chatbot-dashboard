/**
 * Price formatting utilities
 * Separated to avoid Next.js template string compilation issues
 */

export function formatSGDPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Price not available";
  }
  return "S$" + value.toFixed(2);
}

export function formatSGDPriceShort(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return "S$" + value.toFixed(0);
}
