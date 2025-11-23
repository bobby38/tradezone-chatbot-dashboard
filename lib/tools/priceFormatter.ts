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
    return "";
  }
  return "S$" + value.toFixed(0);
}

export function formatSGDPriceShortOrNull(
  value: number | null | undefined,
): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return "S$" + value.toFixed(0);
}
