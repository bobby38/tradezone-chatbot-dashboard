# TradeZone ChatKit - Complete Search Flow Documentation

**Date**: October 23, 2025  
**Status**: ✅ VERIFIED WORKING  
**Purpose**: Clarify the complete search priority chain and why each layer exists

---

## 🎯 THE COMPLETE SEARCH CHAIN

```
User Query
    ↓
1. Vector Store Search (OpenAI Docling)
    ├─ Catalog Vector Store (product knowledge)
    └─ Trade-In Vector Store (pricing, synonyms)
    ↓
2. WooCommerce JSON Enrichment (live pricing/stock)
    ↓
3. Perplexity Web Search (dynamic content) ⭐ ESSENTIAL
    ↓
4. Final Fallback (helpful error message)
```

---

## 📚 WHY EACH LAYER EXISTS

### **Layer 1: Vector Store Search** (PRIMARY)
**Files**: 
- Product catalog: `OPENAI_VECTOR_STORE_ID` (vs_68e89cf979e88191bb8b4882caadbc0d)
- Trade-in: `OPENAI_VECTOR_STORE_ID_TRADEIN` (vs_68f3ab92f57c8191846cb6d643e4cb85)

**What It Covers**:
- ✅ Product specifications and features
- ✅ Trade-in pricing ranges and conditions
- ✅ Semantic understanding ("gaming keyboard" → all gaming keyboards)
- ✅ Synonym resolution (via trained embeddings)

**When It's Used**:
- ALL product queries: "Do you have PS5?", "Gaming laptops under $1000"
- ALL trade-in queries: "Trade in ROG Ally", "How much for my Switch?"

**Latency**: ~800-1500ms  
**Cache**: Managed by OpenAI

---

### **Layer 2: WooCommerce JSON Enrichment** (LIVE DATA)
**File**: `lib/chatkit/productCatalog.ts`  
**Source**: `WOOCOMMERCE_PRODUCT_JSON_PATH` (CDN or local JSON)

**What It Adds**:
- ✅ **Real-time pricing** (S$ amounts)
- ✅ **Stock status** ("In stock", "Out of stock")
- ✅ **Product links** (tradezone.sg URLs)
- ✅ **Product images** (for visual confirmation)

**Why It Exists**:
Vector store has product knowledge, but **NOT live pricing/stock**. This layer enriches vector results with current data from WooCommerce.

**Example**:
```
Vector Store: "PS5 is a gaming console with 1TB storage..."
WooCommerce JSON: "PS5 1TB - S$899 - In Stock - [Link]"
Combined: "PS5 1TB is S$899 and in stock. [View Product](https://...)"
```

**Latency**: ~50ms (cached, refreshed weekly)  
**Cache**: 1 hour TTL, weekly cron job refresh

---

### **Layer 3: Perplexity Web Search** ⭐ **CRITICAL FALLBACK**
**File**: `lib/tools/perplexitySearch.ts`  
**API**: Perplexity Sonar Pro with `tradezone.sg` domain filter

**What It Covers** (things NOT in vector store or JSON):
- ✅ **Current Promotions** - "Black Friday deals", "Christmas sale"
- ✅ **Dynamic Policy Changes** - Updated warranty terms, new return policies
- ✅ **Blog Articles** - "How to choose a gaming laptop"
- ✅ **Store Announcements** - "New branch opening", "Holiday hours"
- ✅ **Event Information** - "Gaming tournament", "Product launches"
- ✅ **FAQs and Guides** - Recently published help articles

**Why It's Essential**:
Vector stores are **static snapshots** (updated manually). Perplexity searches the **live website** for:
1. Content published after last vector store update
2. Time-sensitive information (sales, events)
3. Dynamic pages that change frequently
4. Policy updates not yet in the knowledge base

**Example Queries That NEED Perplexity**:
```
❌ Vector Store: "What's your Black Friday sale?" → No results (not in training data)
✅ Perplexity: Searches tradezone.sg → Finds current promotion page → Returns details

❌ Vector Store: "New trade-in policy 2025" → Returns old 2024 policy
✅ Perplexity: Searches tradezone.sg/trade-in-policy → Returns current 2025 update

❌ Vector Store: "Gaming event this month" → Generic info
✅ Perplexity: Finds blog post "PS5 Tournament - December 2025" → Returns event details
```

**Latency**: ~1500-3000ms  
**Cache**: None (always fresh data)

---

## 🔄 HOW THE FLOW WORKS (Code Implementation)

### **Decision Logic** (`runHybridSearch` function)

```typescript
async function runHybridSearch(query, context) {
  // STEP 1: Vector Store Search
  vectorResult = await handleVectorSearch(query, context);
  
  // STEP 2: WooCommerce JSON Enrichment (if catalog search)
  if (vectorSource === 'catalog') {
    catalogMatches = await findCatalogMatches(query, 3);
    // Merge vector result + catalog data
  }
  
  // STEP 3: Check if vector result is useful
  const vectorUseful = 
    vectorResult.length >= 160 &&
    !hasErrorPatterns(vectorResult);
  
  if (vectorUseful) {
    return { result: combined, source: 'vector_store' }; // ✅ Success
  }
  
  // STEP 3.5: Use catalog-only if available
  if (catalogSection) {
    return { result: catalogSection, source: 'product_catalog' }; // ✅ Success
  }
  
  // STEP 4: Perplexity Fallback (vector result insufficient)
  try {
    fallback = await handlePerplexitySearch(query);
    if (fallback && fallback.length > 0) {
      return { result: fallback, source: 'perplexity' }; // ✅ Success via web search
    }
  } catch (error) {
    console.error("Perplexity failed:", error);
  }
  
  // STEP 5: Final Fallback (all sources failed)
  return { 
    result: "I could not find relevant information. Please rephrase...",
    source: vectorSource 
  };
}
```

---

## 🎯 WHEN EACH SOURCE IS USED

### **Scenario 1: Product Query** (Most Common)
```
Query: "Do you have ROG Ally?"

Flow:
1. Vector Store → "ROG Ally is a handheld gaming PC by Asus..."
2. WooCommerce JSON → Finds "ROG Ally X 1TB - S$1,299 - In Stock"
3. Combined Result → "We have the ROG Ally X 1TB for S$1,299 in stock. [Link]"
4. Perplexity → NOT CALLED (vector result sufficient)

Source: vector_store + product_catalog
```

### **Scenario 2: Trade-In Query**
```
Query: "Trade in PS5 1TB good condition"

Flow:
1. Trade-In Vector Store → "PS5 1TB good: S$400-600 range"
2. WooCommerce JSON → NOT CALLED (trade-in query)
3. Vector result → Sufficient pricing info
4. Perplexity → NOT CALLED (vector result sufficient)

Source: trade_in_vector_store
```

### **Scenario 3: Promotion Query** ⭐ (Needs Perplexity)
```
Query: "What's your Black Friday sale?"

Flow:
1. Vector Store → "No product information" (not in training data)
2. WooCommerce JSON → No matches (sale info not in static JSON)
3. Vector result → INSUFFICIENT (generic or no results)
4. Perplexity → Searches tradezone.sg → Finds "/black-friday-2025" page
5. Returns: "Our Black Friday sale runs Nov 24-26 with up to 40% off gaming consoles..."

Source: perplexity ⭐
```

### **Scenario 4: Policy Query** ⭐ (Needs Perplexity)
```
Query: "What's your warranty policy?"

Flow:
1. Vector Store → Generic warranty info (may be outdated)
2. WooCommerce JSON → No matches (not a product)
3. Vector result → INSUFFICIENT (not detailed enough or old)
4. Perplexity → Searches tradezone.sg/warranty → Finds current policy page
5. Returns: "We offer 1-year warranty on all new products, 90 days on pre-owned..."

Source: perplexity ⭐
```

### **Scenario 5: Complete Failure** (Rare)
```
Query: "Do you sell unicorns?"

Flow:
1. Vector Store → No results
2. WooCommerce JSON → No matches
3. Vector result → INSUFFICIENT
4. Perplexity → No results on tradezone.sg
5. Final Fallback → "I could not find relevant information. Please try rephrasing..."

Source: fallback message
```

---

## 🔧 CONFIGURATION

### **Vector Stores**
```env
# Product catalog and general knowledge
OPENAI_VECTOR_STORE_ID=vs_68e89cf979e88191bb8b4882caadbc0d

# Trade-in specific (pricing, synonyms, conditions)
OPENAI_VECTOR_STORE_ID_TRADEIN=vs_68f3ab92f57c8191846cb6d643e4cb85
```

### **WooCommerce JSON**
```env
# CDN or local path to product catalog JSON
WOOCOMMERCE_PRODUCT_JSON_PATH=https://studio.getrezult.com/v1/storage/.../tradezone-WooCommerce-Products.json

# Refresh via cron:
# scripts/refresh-product-catalog.mjs (weekly)
```

### **Perplexity API**
```env
# Required for web search fallback
PERPLEXITY_API_KEY=pplx-...

# Model: sonar-pro
# Domain filter: tradezone.sg
```

---

## 📊 SOURCE PRIORITY SUMMARY

| Source | Priority | When Used | Latency | Dynamic |
|--------|----------|-----------|---------|---------|
| Vector Store | 1 | Product/trade-in queries | ~1000ms | ❌ Static |
| WooCommerce JSON | 2 | Enrich with live pricing | ~50ms | ⚠️ Weekly refresh |
| Perplexity | 3 | Promotions, policies, news | ~2000ms | ✅ Live website |
| Fallback | 4 | All sources failed | ~0ms | N/A |

---

## ✅ VERIFICATION CHECKLIST

### **Test Vector Store First**
```
✅ "Do you have PS5?" → Should use vector + catalog (NO Perplexity)
✅ "Trade in ROG Ally" → Should use trade-in vector (NO Perplexity)
✅ "Gaming keyboards" → Should use vector + catalog (NO Perplexity)
```

### **Test Perplexity Fallback**
```
✅ "Black Friday sale" → Should fall back to Perplexity (dynamic content)
✅ "Warranty policy" → May use Perplexity if vector outdated
✅ "Store hours Christmas" → Should use Perplexity (time-sensitive)
```

### **Check Console Logs**
```bash
# Successful vector path:
[ChatKit] Hybrid search completed: vector=1200ms, catalog=80ms, perplexity=0ms, total=1280ms

# Perplexity fallback path:
[ChatKit] Hybrid search completed: vector=1100ms, catalog=0ms, perplexity=2300ms, total=3400ms
```

---

## 🎯 KEY TAKEAWAYS

1. **Vector Store = Static Knowledge** - Product specs, trade-in ranges, general info
2. **WooCommerce JSON = Live Pricing** - Real-time stock and prices (weekly refresh)
3. **Perplexity = Dynamic Content** ⭐ - Promotions, policy updates, events, news
4. **Perplexity is NOT optional** - Essential for time-sensitive and recently published content
5. **Each layer has a purpose** - No redundancy, no waste

**The flow is optimized**: 
- Fast path: Vector + Catalog (~1-2s)
- Slow path: Vector + Catalog + Perplexity (~3-4s)
- Always tries fastest first, falls back to web search when needed

---

## 📝 MAINTENANCE

### **When to Update Vector Store**
- New product categories added
- Major product line changes
- Trade-in policy changes
- Significant FAQ updates

### **When to Update WooCommerce JSON**
- Automatic: Weekly cron job
- Manual: When major pricing changes occur

### **When Perplexity Handles It**
- Daily promotions and sales
- Blog posts and articles
- Store announcements
- Event information
- Policy micro-updates

**Result**: Vector store stays clean and focused, Perplexity handles the dynamic web content. Perfect separation of concerns! ✅

---

**Status**: ✅ Flow verified and documented  
**Next**: Deploy and monitor source usage in production logs
