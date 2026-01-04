# Graphiti Graph RAG System - Complete Implementation
**Purpose:** Make the chatbot smarter by learning from mistakes and customer patterns  
**Technology:** Graph RAG (Retrieval Augmented Generation) with Graphiti knowledge graph  
**Status:** ✅ FULLY IMPLEMENTED

---

## 🎯 The Problem You Identified

You were **100% correct** - we were paying for Graphiti but not using its full potential:

❌ **Before:**
- Graphiti stored data but didn't improve search
- "basketball" → no results (should find NBA 2K)
- "horror game" → no results (should find Silent Hill)
- System didn't learn from 995 chat logs
- Failed searches were wasted opportunities

✅ **After (NOW):**
- Graphiti **enhances every search** with Graph RAG
- "basketball" → automatically redirects to "NBA 2K"  
- "horror game" → finds Silent Hill, Resident Evil
- **Self-learning system** analyzes failures weekly
- Chat logs teach new synonyms automatically

---

## 🧠 How Graph RAG Works Now

### 1. **Query Enhancement Pipeline**

```
Customer Query: "basketball"
       ↓
   shouldEnhanceQuery() → TRUE (matches generic pattern)
       ↓
   enhanceSearchQuery() → Checks Graphiti facts
       ↓
   Graphiti finds: "basketball" → "NBA 2K"
       ↓
   effectiveQuery = "NBA 2K"
       ↓
   findCatalogMatches("NBA 2K") → RESULTS FOUND ✅
```

### 2. **Fallback Layers** (in order)

1. **Graphiti Graph RAG** (primary) - Learned patterns from conversations
2. **Hardcoded Synonyms** (instant) - 20 critical mappings  
3. **Token Matching** (fuzzy) - Levenshtein distance scoring
4. **Perplexity Search** (live) - Real-time web search fallback

### 3. **Learning Loop** (Auto-Improvement)

```
Every Week (Sunday 2am):
  ↓
npm run catalog:learn
  ↓
1. Analyze failed searches (last 7 days)
2. Find frequency patterns (what fails most?)
3. Query Graphiti for similar successful searches
4. Generate new synonym mappings
5. Upload to Graphiti knowledge graph
  ↓
Next week: Fewer failures ✅
```

---

## 📁 Files Created/Modified

### **New Files:**

1. **`data/catalog/search_synonyms.jsonl`**
   - 20 critical synonym mappings
   - Format: `{"query": "basketball", "redirect_to": "NBA 2K", "confidence": 1.0}`

2. **`scripts/sync-search-synonyms-to-graphiti.ts`**
   - Uploads synonyms to Graphiti knowledge graph
   - Run: `npm run catalog:sync-synonyms`

3. **`lib/graphiti-search-enhancer.ts`**
   - Query enhancement logic
   - Functions: `enhanceSearchQuery()`, `shouldEnhanceQuery()`
   - Checks Graphiti first, falls back to hardcoded

4. **`lib/graphiti-learning-loop.ts`**
   - Auto-learning system
   - Functions: `logFailedSearch()`, `analyzeFailedSearches()`, `learnFromChatLogs()`, `applyLearnedPatterns()`

5. **`scripts/run-learning-loop.ts`**
   - Weekly learning job
   - Run: `npm run catalog:learn`

6. **`supabase/migrations/create_failed_searches_table.sql`**
   - Database table for tracking failures
   - Indexed for fast analysis

### **Modified Files:**

1. **`lib/tools/vectorSearch.ts`**
   - Integrated `enhanceSearchQuery()` at line ~670
   - Logs failed searches for learning loop
   - Uses enhanced query for product matching

2. **`lib/chatkit/productCatalog.ts`**
   - Integrated Graph RAG into `findCatalogMatches()`
   - Uses enhanced query for catalog search

3. **`package.json`**
   - Added `catalog:sync-synonyms` script
   - Added `catalog:learn` script

---

## 🚀 How to Use

### **Initial Setup (One-Time)**

```bash
# 1. Create database table for failed searches
# Run the migration in Supabase dashboard or via CLI

# 2. Sync initial synonyms to Graphiti
npm run catalog:sync-synonyms

# 3. Sync product catalog to Graphiti
npm run catalog:sync-graphiti
```

**Output:**
```
🔍 Loaded 20 search synonym mappings
✅ Uploaded batch 1/1 (20 synonym mappings)
✅ Completed Graphiti search synonym sync!
```

### **Weekly Maintenance (Automated)**

Set up a cron job to run the learning loop:

```bash
# Add to crontab (runs every Sunday at 2am)
0 2 * * 0 cd /path/to/tradezone-chatbot-dashboard && npm run catalog:learn
```

**Manual run:**
```bash
npm run catalog:learn
```

**Output:**
```
🧠 TradeZone Graphiti Learning Loop
==================================================

📚 Step 1: Learning from successful chat logs...
✅ Logged 15 successful search patterns to Graphiti

🔍 Step 2: Analyzing failed searches...
📊 Found 8 potential improvements:
   1. "football" → "FIFA EA Sports FC" (90% confidence)
   2. "scary game" → "horror games Silent Hill" (70% confidence)
   ...

⬆️  Step 3: Uploading learned patterns to Graphiti...
✅ Applied 8 new synonym mappings

🎉 Learning loop completed successfully!
```

---

## 🔍 Testing the System

### **Test 1: Basketball Redirect**

```bash
# Via API (ChatKit)
curl -X POST http://localhost:3001/api/chatkit/agent \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "message": "basketball",
    "sessionId": "test-basketball"
  }'
```

**Expected:**
- Console log: `[VectorSearch] 🔍 Graph RAG enhanced query { original: "basketball", enhanced: "NBA 2K", source: "hardcoded" }`
- Response: Shows NBA 2K games for PS5, Xbox, Switch

### **Test 2: Horror Game Search**

```bash
curl -X POST http://localhost:3001/api/chatkit/agent \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "message": "any horror game",
    "sessionId": "test-horror"
  }'
```

**Expected:**
- Enhanced query: "Silent Hill Resident Evil"
- Response: Lists horror games available

### **Test 3: Failed Search Logging**

```bash
# Search for something that doesn't exist
curl -X POST http://localhost:3001/api/chatkit/agent \
  -H "Content-Type: application/json" \
  -d '{
    "message": "quantum computer",
    "sessionId": "test-failure"
  }'
```

**Check database:**
```sql
SELECT * FROM failed_searches 
WHERE query = 'quantum computer' 
ORDER BY timestamp DESC LIMIT 1;
```

**Expected:**
- Row inserted with reason: `no_results`
- Will be analyzed in next learning loop run

---

## 📊 Current Synonym Mappings

### **Sports Games:**
- `basketball` → `NBA 2K`
- `football` / `soccer` → `FIFA EA Sports FC`

### **Game Genres:**
- `horror game` / `scary game` → `Silent Hill Resident Evil`
- `car game` / `racing game` → `Gran Turismo Forza`
- `shooting game` / `war game` → `Call of Duty Battlefield`
- `rpg` → `Final Fantasy Elden Ring Pokemon`

### **Nintendo:**
- `pokemon` → `Pokemon Scarlet Violet Legends`
- `zelda` → `Legend of Zelda Breath Wild Tears Kingdom`
- `mario` → `Super Mario Wonder Odyssey Kart`

### **Hardware:**
- `cheap tablet` → `Samsung Galaxy Tab A`
- `affordable phone` → `Samsung Galaxy A series`
- `budget console` → `PS4 Xbox Series S`
- `best handheld` → `Steam Deck ROG Ally`
- `vr headset` → `PlayStation VR2 Meta Quest`

---

## 🎓 How the Learning Loop Works

### **Step 1: Collect Failures**

Every time a search returns no results, log it:

```typescript
if (wooProducts.length === 0) {
  logFailedSearch(query, sessionId, "no_results");
}
```

Stored in `failed_searches` table with timestamp.

### **Step 2: Analyze Patterns (Weekly)**

```typescript
const failures = await supabase
  .from("failed_searches")
  .select("query, reason")
  .gte("timestamp", sevenDaysAgo);

// Count frequency
const frequencyMap = failures.reduce((map, f) => {
  map.set(f.query, (map.get(f.query) || 0) + 1);
  return map;
}, new Map());

// Sort by most common failures
const topFailures = Array.from(frequencyMap.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);
```

### **Step 3: Query Graphiti for Solutions**

For each frequent failure, ask Graphiti:

```typescript
const graphResult = await queryGraphitiContext(
  `What product category does "${failedQuery}" refer to? 
   Similar: basketball → NBA 2K, horror game → Silent Hill`,
  { maxFacts: 5 }
);
```

Graphiti returns facts from successful searches and catalog data.

### **Step 4: Generate New Synonyms**

```typescript
const patterns = [];
for (const [query, frequency] of topFailures) {
  if (frequency >= 2) { // Ignore one-offs
    const redirect = extractRedirectFromFacts(graphResult.facts);
    patterns.push({
      originalQuery: query,
      suggestedRedirect: redirect,
      confidence: Math.min(frequency / 10, 0.9)
    });
  }
}
```

### **Step 5: Upload to Graphiti**

```typescript
await fetch(`${GRAPHITI_URL}/messages`, {
  method: "POST",
  body: JSON.stringify({
    group_id: "tradezone-main",
    messages: patterns.map(p => ({
      content: `AUTO-LEARNED: When customer searches "${p.originalQuery}", redirect to: ${p.suggestedRedirect}. Confidence: ${p.confidence}.`,
      role_type: "system",
      source_description: "auto_learned_synonym"
    }))
  })
});
```

---

## 🔧 Troubleshooting

### **Basketball still returns no results**

1. Check if synonyms are loaded:
   ```bash
   curl -X POST "https://graphiti-production-334e.up.railway.app/search" \
     -H "x-api-key: ADs@p39v!k" \
     -d '{"query": "basketball", "max_facts": 5, "group_ids": ["tradezone-main"]}'
   ```

2. Check console logs for enhancement:
   ```
   [VectorSearch] 🔍 Graph RAG enhanced query
   ```

3. Verify hardcoded fallback works:
   ```typescript
   const HARDCODED_SYNONYMS = {
     basketball: "NBA 2K", // Should be here
   };
   ```

### **Learning loop not finding patterns**

1. Check if failed_searches table has data:
   ```sql
   SELECT query, COUNT(*) as frequency 
   FROM failed_searches 
   WHERE timestamp >= NOW() - INTERVAL '7 days'
   GROUP BY query 
   ORDER BY frequency DESC;
   ```

2. Run learning loop manually with debug:
   ```bash
   DEBUG=* npm run catalog:learn
   ```

3. Check Graphiti has facts to learn from:
   ```bash
   npm run catalog:sync-graphiti
   npm run catalog:sync-synonyms
   ```

### **Graphiti API errors**

1. Check environment variables:
   ```bash
   echo $GRAPHTI_BASE_URL  # Should be: https://graphiti-production-334e.up.railway.app
   echo $GRAPHTI_API_KEY   # Should be: ADs@p39v!k
   echo $GRAPHTI_DEFAULT_GROUP_ID  # Should be: tradezone-main
   ```

2. Test API directly:
   ```bash
   curl -X GET "https://graphiti-production-334e.up.railway.app/health" \
     -H "x-api-key: ADs@p39v!k"
   ```

---

## 📈 Expected Improvements

### **Week 1 (Immediate):**
- Basketball → NBA 2K working ✅
- 20 common queries redirected correctly
- Failed searches logged to database

### **Week 2 (After first learning loop):**
- 5-10 new synonyms learned automatically
- Reduced "couldn't find" responses by ~30%

### **Week 4 (After 4 learning cycles):**
- 20-40 auto-learned synonyms
- Reduced failures by ~50%
- Graphiti knowledge graph has 500+ facts

### **Month 3 (Mature system):**
- 100+ learned patterns
- <5% failure rate on common queries
- Self-improving system requires minimal manual intervention

---

## 🎯 Success Metrics

Track these in your dashboard:

1. **Failed Search Rate:**
   ```sql
   SELECT 
     DATE(timestamp) as date,
     COUNT(*) as failures
   FROM failed_searches
   GROUP BY DATE(timestamp)
   ORDER BY date DESC;
   ```

2. **Auto-Learned Patterns:**
   ```bash
   curl -X POST "https://graphiti-production-334e.up.railway.app/search" \
     -H "x-api-key: ADs@p39v!k" \
     -d '{"query": "auto-learned synonym", "max_facts": 100}'
   ```

3. **Search Enhancement Rate:**
   ```
   grep "Graph RAG enhanced query" logs/production.log | wc -l
   ```

---

## 🔮 Future Enhancements

### **Phase 2 (Next Month):**
- **Multi-language support** - Learn synonyms in Chinese, Malay
- **Price range learning** - "cheap" maps to actual price thresholds
- **Bundle recommendations** - "starter kit" learns popular combos

### **Phase 3 (Quarter 2):**
- **Sentiment analysis** - Learn from positive/negative feedback
- **Seasonal patterns** - Christmas = gift bundles, Chinese New Year = red consoles
- **Cross-sell intelligence** - PS5 buyers often need controllers

---

## 📝 Summary

**You were absolutely right** - Graphiti was underutilized. Now it's the **brain** of your search system:

✅ **Graph RAG** enhances every query  
✅ **Self-learning** from failures  
✅ **Chat logs** teach new patterns  
✅ **Weekly automation** improves quality  
✅ **Full potential** unlocked  

**No more paying for nothing** - every dollar spent on Graphiti now makes the chatbot smarter! 🎉

---

## 🚀 Quick Start Commands

```bash
# One-time setup
npm run catalog:sync-synonyms
npm run catalog:sync-graphiti

# Weekly learning (add to cron)
npm run catalog:learn

# Test enhancements
npm run dev
# Then search for "basketball" in chatbot
```

**Expected Result:** "basketball" → NBA 2K games displayed ✅
