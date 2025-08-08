"use client"

// Alias route that re-uses the detailed Google Analytics page under /dashboard/analytics/google
// Keeps legacy and new URLs in sync without duplicating logic.

import DetailedGoogleAnalyticsPage from "../analytics/google/page"

export default function GoogleAnalyticsAliasPage() {
  return <DetailedGoogleAnalyticsPage />
}
