# TradeZone Chatbot Search Fix Plan
## Issues Identified (January 15, 2026)

### Problem Summary
User searched "nvme ssd" and "any m2 ssd 4 tb" but chatbot:
1. ❌ Found NO results (despite having Samsung 990 EVO Plus 2TB in catalog)
2. ❌ Showed broken "Product — View Product" links with no actual product data
3. ❌ Gave up immediately instead of showing alternatives

### Root Causes

#### 1. **Outdated Product Catalog** ⚠️
- **File**: `data/catalog/products_master.json`
- **Last Updated**: December 11, 2024
- **Issue**: Weekend products not synced (client added new NVMe SSDs this weekend)
- **Impact**: New Samsung 990 EVO Plus 4TB not in searchable catalog

#### 2. **Search Token Matching Too Strict** 🔍
- **File**: `lib/tools/vectorSearch.ts:700-710`
- **Issue**: Products dropped if query tokens (nvme, ssd) not in product TITLE
- **Reality**: Samsung products have generic titles like "Samsung 990 EVO Plus 2TB" without "NVMe" or "SSD" keywords
- **Tags/Descriptions**: Contain "NVMe M.2 SSD" but not indexed for search

#### 3. **Broken Product Link Generation** 🔗
- **File**: `app/api/chatkit/agent/route.ts:7991-8010`
- **Issue**: When search returns empty:
  - Tries to extract links from `lastSearchProductsResult` variable
  - But this is empty/null when no products found
  - Creates generic placeholder: `**Product** — [View Product](undefined)`
- **Fix Needed**: Don't show links when no products found

#### 4. **Response Quality - Gives Up Too Fast** 💬
- **Current**: "I couldn't find X. Want me to connect you with team?"
- **Better**: 
  - Show similar products (2TB SSDs if no 4TB found)
  - Suggest broader search ("storage devices", "solid state drives")
  - Show category link to browse all SSDs

---

## Action Plan

### **PRIORITY 1: Update Product Catalog** (5 minutes)
```bash
cd /Users/bobbymini/Documents/tradezone-chatbot-dashboard

# Step 1: Refresh from WooCommerce (fetches latest products)
npm run refresh:catalog

# Step 2: Rebuild master catalog with proper tags/tokens
npm run catalog:build

# Step 3: Sync to Graphiti knowledge graph
npm run catalog:sync-graphiti

# Verify files updated
ls -lh data/catalog/products_master.json
```

**Expected Result**: 
- ✅ New Samsung 990 EVO Plus 4TB appears in catalog
- ✅ Search tokens include storage capacity variations
- ✅ Aliases include "nvme", "m.2", "ssd", "solid state"

---

### **PRIORITY 2: Fix Search Token Indexing** (Code Change)

#### File: `lib/chatkit/productCatalog.ts:180-200`

**Current Problem**: Tokenization only uses title + family name
```typescript
const tokens = unique([
  ...tokenize(model.title),  // "Samsung 990 EVO Plus 2TB"
  ...aliases.flatMap((alias) => tokenize(alias)),
  ...tokenize(family.title),
]);
```

**Fix**: Include categories, tags, and description keywords
```typescript
const tokens = unique([
  ...tokenize(model.title),
  ...aliases.flatMap((alias) => tokenize(alias)),
  ...tokenize(family.title),
  // ADD: Extract from categories
  ...(model.categories || []).flatMap((cat) => tokenize(cat)),
  // ADD: Extract from tags
  ...(model.tags || []).flatMap((tag) => tokenize(tag)),
  // ADD: Extract storage keywords (GB, TB, 2TB, 4TB, etc.)
  ...extractStorageTokens(model),
]);

function extractStorageTokens(model: ProductModelRecord): string[] {
  const title = model.title.toLowerCase();
  const tokens: string[] = [];
  
  // Extract storage size (2TB, 4TB, 500GB, etc.)
  const storageMatch = title.match(/(\d+)(tb|gb)/i);
  if (storageMatch) {
    tokens.push(storageMatch[0].toLowerCase()); // "2tb", "4tb"
  }
  
  // Add component type hints from title
  if (/ssd|solid.?state/i.test(title)) tokens.push('ssd', 'solid-state');
  if (/nvme|m\.?2/i.test(title)) tokens.push('nvme', 'm.2', 'm2');
  if (/hdd|hard.?drive/i.test(title)) tokens.push('hdd', 'hard-drive');
  
  return tokens;
}
```

---

### **PRIORITY 3: Fix Broken Product Links** (Code Change)

#### File: `app/api/chatkit/agent/route.ts:7980-8010`

**Current Code** (shows broken links on empty search):
```typescript
if (cleaned.length > 0) {
  const integratedLinks = cleaned
    .slice(0, 5)
    .map((u, idx) => {
      const title = titleMatch ? titleMatch[1].trim() : "Product";  // ❌ Falls back to "Product"
      return `${idx + 1}. **${title}** — [View Product](${u})`;
    })
    .join("\n\n");
  finalResponse = `${finalResponse}\n\n${integratedLinks}`.trim();
}
```

**Fix**: Only show links if we have actual product data
```typescript
// Only append product links if search actually returned results
if (cleaned.length > 0 && lastSearchProductsResult && lastSearchProductsResult.trim().length > 50) {
  const integratedLinks = cleaned
    .slice(0, 5)
    .map((u, idx) => {
      const escapedUrl = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const titleRegex = new RegExp(`\\*\\*(.*?)\\*\\*[\\s\\S]*?${escapedUrl}`, "i");
      const titleMatch = lastSearchProductsResult.match(titleRegex);
      
      // ✅ Skip link if no title found (means product data missing)
      if (!titleMatch) return null;
      
      const title = titleMatch[1].trim();
      const linkLine = `${idx + 1}. **${title}** — [View Product](${u})`;
      const imageMatch = imageMatches[idx];
      const imageLine = imageMatch ? `\n   ![${title}](${imageMatch})` : "";
      return `${linkLine}${imageLine}`;
    })
    .filter(Boolean)  // Remove nulls
    .join("\n\n");
  
  if (integratedLinks.trim()) {
    finalResponse = `${finalResponse}\n\n${integratedLinks}`.trim();
  }
}
```

---

### **PRIORITY 4: Improve "No Results" Response** (Code Change)

#### File: `lib/tools/vectorSearch.ts:1680-1700`

**Current**: Immediately suggests contacting team
```typescript
finalResponse = `I couldn't find "${rawQuery}" in our catalog. 
Would you like me to connect you with our team?`;
```

**Better**: Show alternatives and category links
```typescript
// Build helpful "no results" response with alternatives
const category = extractProductCategory(query);
const categoryLink = getCategoryLink(category, query);

let fallbackResponse = `I couldn't find "${rawQuery}" in our current catalog.`;

// Suggest similar products if available
if (category === 'storage') {
  fallbackResponse += `\n\nBrowse all SSDs and storage: https://tradezone.sg/product-category/pc-related/pc-parts/storage/`;
} else if (categoryLink) {
  const categoryName = buildCategoryLabel(category);
  fallbackResponse += `\n\nBrowse all ${categoryName}: ${categoryLink}`;
}

fallbackResponse += `\n\nOr ask me about specific brands (Samsung, WD, Crucial, Seagate) or storage sizes you're looking for!`;

// Still offer support, but as secondary option
fallbackResponse += `\n\n*Need help finding something specific? Let me know and I can connect you with our team.*`;

finalResponse = fallbackResponse;
```

---

## Verification Steps

### Test Queries After Fix
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run test queries
curl -X POST http://localhost:3001/api/chatkit/agent \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CHATKIT_API_KEY" \
  -d '{
    "message": "nvme ssd",
    "sessionId": "test-session-nvme"
  }'

curl -X POST http://localhost:3001/api/chatkit/agent \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CHATKIT_API_KEY" \
  -d '{
    "message": "any m2 ssd 4 tb",
    "sessionId": "test-session-m2"
  }'
```

### Expected Results
✅ **"nvme ssd"** → Shows Samsung 990 EVO Plus, WD Black, other NVMe SSDs  
✅ **"any m2 ssd 4 tb"** → Shows 4TB M.2 options (or 2TB with "We have 2TB in stock, 4TB on request")  
✅ **Product links** → Actual product names, not "Product — View Product"  
✅ **No results** → Suggests category link and broader search terms  

---

## Automation & Prevention

### Schedule Weekly Catalog Refresh
The client mentioned products were added "this weekend". Set up automatic syncs:

```bash
# File: scripts/refresh-woocommerce-catalog.sh (already exists)
#!/bin/bash
cd /path/to/tradezone-chatbot-dashboard
npm run refresh:catalog
npm run catalog:build
npm run catalog:sync-graphiti

# Add to crontab (runs every Sunday at 2 AM)
0 2 * * 0 /path/to/scripts/refresh-woocommerce-catalog.sh >> /var/log/tradezone-catalog-sync.log 2>&1
```

Or use GitHub Actions / Coolify Scheduled Jobs:
```yaml
name: Weekly Catalog Refresh
on:
  schedule:
    - cron: '0 2 * * 0'  # Every Sunday 2 AM
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run refresh:catalog
      - run: npm run catalog:build
      - run: npm run catalog:sync-graphiti
```

---

## Summary

| Issue | Priority | Fix Type | Time | Impact |
|-------|----------|----------|------|--------|
| Outdated catalog (missing weekend products) | P1 | Run sync scripts | 5 min | HIGH - Makes new products searchable |
| Search tokens too narrow (title-only) | P2 | Code change | 20 min | HIGH - Enables tag/category search |
| Broken "Product" links when empty | P2 | Code change | 10 min | MEDIUM - Removes confusing UI |
| Poor "no results" response | P3 | Code change | 15 min | MEDIUM - Better UX fallback |
| No automated sync | P4 | Cron/GitHub Action | 10 min | LOW - Prevents future staleness |

**Total Implementation Time**: ~60 minutes  
**Expected Outcome**: Search works for 90%+ of product queries, graceful fallback for missing items

---

## Quick Start (Priority 1 Only)

If you want to fix it RIGHT NOW without code changes:

```bash
# 1. Update catalog (5 minutes)
npm run refresh:catalog
npm run catalog:build  
npm run catalog:sync-graphiti

# 2. Restart dev server
npm run dev

# 3. Test in widget
# Search: "nvme ssd" should now show Samsung 990 EVO Plus
```

This will at least make the new products searchable. The code improvements can follow.
