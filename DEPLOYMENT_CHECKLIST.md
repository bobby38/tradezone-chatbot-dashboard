# Production Deployment Checklist - January 18, 2025

## 🚀 Pre-Deployment Verification

### Local Dev Status:
- ✅ Latest commit: `1181a9d`
- ✅ Build successful: No errors
- ✅ All tests passing locally
- ✅ Changes documented in AGENT.md

### Changes Ready to Deploy:
1. ✅ **Model Upgrade** - gpt-4o-mini → gpt-4.1-mini (5dbd0e9)
2. ✅ **Bundle Search Fix** - Limited Editions now appear (597a09d)
3. ✅ **Product Links Fix** - Always include clickable links (3699236)
4. ✅ **Debug Logging** - Catalog match tracking (430cd36)
5. ✅ **Test Suite** - 19 automated Playwright tests (280bd6a)

---

## 📋 Deployment Steps

### Step 1: Coolify Dashboard
1. Go to Coolify dashboard
2. Navigate to: **tradezone-chatbot-dashboard** project
3. Current commit showing: ________ (check before deploy)

### Step 2: Deploy
1. Click **"Redeploy"** button
2. Wait for build to complete (~2-3 minutes)
3. Watch build logs for errors

### Step 3: Verify Deployment
1. Check commit shows: **`1181a9d`**
2. Check build status: **Success** ✅
3. Note deployment time: __________

---

## ✅ Post-Deployment Testing

### Test 1: Bundle Search with Links
**Query:** "any ps5 bundle"

**Expected Response:**
```
✅ PS5 Slim Disc 30th Anniversary Limited Edition 1TB — S$1149 
   ([View Product](https://tradezone.sg/product/...))
✅ PS5 Slim Digital 30th Anniversary Limited Edition 1TB — S$949 
   ([View Product](https://tradezone.sg/product/...))
✅ Ghost of Yotei Gold Limited Edition — S$149 
   ([View Product](https://tradezone.sg/product/...))
```

**Check:**
- [ ] Limited Edition bundles appear
- [ ] All products have [View Product] links
- [ ] Links are clickable
- [ ] Response time <5 seconds

---

### Test 2: Product Search with Links
**Query:** "ninja gaiden 4"

**Expected Response:**
```
✅ PS5 Ninja Gaiden 4 — S$89.90 ([View Product](URL))
```

**Check:**
- [ ] Product found (not "not in stock")
- [ ] Price shown: S$89.90
- [ ] Link included
- [ ] Response concise

---

### Test 3: No Premature Greeting
**Query:** "pikachu any game"

**Expected Response:**
```
✅ Pokémon Let's Go, Pikachu! — S$39.90 ([View Product](URL))
✅ Pokémon Sword — S$49.90 ([View Product](URL))
```

**NOT Expected:**
```
❌ "Hi! I'm Amara from TradeZone. Want product info..."
```

**Check:**
- [ ] No greeting when user asks specific question
- [ ] Direct product results
- [ ] Links included

---

### Test 4: Tool Usage for Searches
**Query:** "show me nintendo switch games"

**Check Coolify Logs:**
```
✅ [ChatKit] Tool called: searchProducts
✅ [VectorSearch] Catalog matches found: X
✅ [ChatKit] Using vector result
```

**Check:**
- [ ] searchProducts tool is called
- [ ] Catalog matches found
- [ ] Products returned with links

---

### Test 5: Performance Metrics
**Query:** "ps5 bundle" (check Coolify logs)

**Expected Logs:**
```
[VectorSearch] Catalog matches found: 3-4
[VectorSearch] Top match: PS5 Slim Disc 30th Anniversary...
[ChatKit] Slow vector search: <5000ms  ← Should be under 5s
[ChatKit] High usage detected: <10000 tokens  ← Should be under 10K
```

**Check:**
- [ ] Vector search completes <5s
- [ ] Token usage <10K
- [ ] Catalog matches found (3-4)
- [ ] No errors in logs

---

## 🔴 Rollback Procedure (If Issues Found)

### If Critical Test Fails:

**Option 1: Revert to Previous Commit**
```bash
git log --oneline -5  # Find previous working commit
git revert 1181a9d..HEAD  # Revert all recent changes
git push origin main
# Redeploy in Coolify
```

**Option 2: Quick Fix & Redeploy**
1. Identify specific issue
2. Make minimal fix locally
3. Test thoroughly
4. Commit and push
5. Redeploy in Coolify

**Previous Known-Good Commit:**
- `7ca0a19` - Performance optimizations (before bundle search changes)

---

## 📊 Monitoring (First 24 Hours)

### Check Every 2 Hours:

**Coolify Logs - Look For:**
1. ✅ `[VectorSearch] Catalog matches found: X` (should be >0)
2. ✅ `[ChatKit] Using vector result` (tool is working)
3. ⚠️ `[ChatKit] Slow vector search: Xms` (should be <5000ms)
4. ⚠️ `[ChatKit] High usage detected: X tokens` (should be <10000)
5. ❌ Any ERROR or FATAL messages

**User Reports - Watch For:**
1. "No links in responses" → Links not showing
2. "Can't find X product" → Search not working
3. "Takes too long to respond" → Performance regression
4. "Bot keeps greeting me" → Context issues

### Success Indicators:
- [ ] No errors in logs (first hour)
- [ ] Product links appearing in all searches
- [ ] Bundle searches showing Limited Editions
- [ ] Response time <5s consistently
- [ ] Token usage <10K consistently
- [ ] No user complaints

### Failure Indicators:
- [ ] Errors in logs
- [ ] Links missing from responses
- [ ] "Not in stock" for available products
- [ ] Response time >10s frequently
- [ ] Token usage >15K frequently

If 3+ failure indicators: **Consider rollback**

---

## 📝 Sign-Off

**Deployed By:** _______________  
**Date:** _______________  
**Time:** _______________  
**Commit:** `1181a9d`  

**Post-Deployment Tests:**
- [ ] Test 1: Bundle search (PASS/FAIL)
- [ ] Test 2: Product search (PASS/FAIL)
- [ ] Test 3: No premature greeting (PASS/FAIL)
- [ ] Test 4: Tool usage (PASS/FAIL)
- [ ] Test 5: Performance (PASS/FAIL)

**Overall Status:** [ ] PASS [ ] FAIL [ ] PARTIAL

**Notes:**
_________________________________________________
_________________________________________________
_________________________________________________

**Next Review:** _________ (24 hours from deployment)

---

## 🎯 Expected Improvements

**Before Deployment:**
- ❌ "ps5 bundle" returns generic products (not Limited Editions)
- ❌ No product links in responses
- ⚠️ Using deprecated gpt-4o-mini model
- ⚠️ Response time ~12s
- ⚠️ Token usage ~20K

**After Deployment:**
- ✅ "ps5 bundle" returns Limited Editions (30th Anniversary, Ghost of Yotei)
- ✅ All products include [View Product] clickable links
- ✅ Using current gpt-4.1-mini model
- ✅ Response time ~5-8s (improved)
- ✅ Token usage ~10-13K (improved)

**Target Metrics:**
- Response time: <3s (stretch goal)
- Token usage: <6K (stretch goal)
- Product link coverage: 100%
- Bundle search accuracy: 100%

---

**Last Updated:** January 18, 2025  
**Ready for Production:** ✅ YES
