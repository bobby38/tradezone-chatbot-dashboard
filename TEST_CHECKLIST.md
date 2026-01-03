# 🧪 Test Checklist - Today's Fixes (2026-01-03)

Test these scenarios on your live chatbot to validate all fixes before moving to voice.

---

## ✅ Test Results Summary

### Automated Tests (Playwright)
- ✅ **4/20 tests passed** (those that don't need API calls)
- ⚠️ **16 tests skipped** (empty responses - API key issue in test env)

**Tests that PASSED:**
1. ✅ 'don't want to trade' negation detection
2. ✅ 'just want to buy' negation detection  
3. ✅ Product format consistency (tablets, VR, Steam Deck)
4. ✅ First product image only

---

## 📋 Manual Test Script

### **Test Group 1: Product Pagination & Category Links** 🔗

| # | Query | Expected Result | Status |
|---|-------|----------------|--------|
| 1 | `pokemon games` | Shows "Showing 8 of 11 results" with link to Nintendo games category | ⬜ |
| 2 | `cheap tablets` | Shows tablets with link to `/handphone-tablet/tablet/` | ⬜ |
| 3 | `ps5 games` | No "gamess" plural error | ⬜ |

**How to verify:**
- [ ] Pagination text shows when products > 8
- [ ] Category link is clickable
- [ ] Link doesn't return 404
- [ ] No plural errors ("gamess" → "games")

---

### **Test Group 2: Sports Game Detection** 🏀

| # | Query | Expected Message | Should NOT Show | Status |
|---|-------|-----------------|----------------|--------|
| 1 | `NBA games` | "We don't currently stock basketball games..." | Graphics cards, random products | ⬜ |
| 2 | `basketball` | Basketball no-results message | ZOTAC, RTX cards | ⬜ |
| 3 | `curry` | Basketball detection | Random products | ⬜ |
| 4 | `jordan` | Basketball detection | Random products | ⬜ |
| 5 | `car games` | "We don't currently stock racing/car games..." | ZOTAC, SD cards | ⬜ |
| 6 | `racing games` | Racing game no-results message | Graphics cards | ⬜ |
| 7 | `forza` | Racing detection | Random products | ⬜ |
| 8 | `fifa games` | "We don't currently stock football/soccer games..." | Random products | ⬜ |
| 9 | `tony hawk` | "We don't currently stock skateboarding games..." | Random products | ⬜ |

**How to verify:**
- [ ] Clear message saying we don't stock that sport
- [ ] Suggests checking console games section
- [ ] NO irrelevant products shown (graphics cards, etc.)

---

### **Test Group 3: Trade-In Negation** ❌🔄

| # | Query | Should NOT Trigger | Should Show | Status |
|---|-------|-------------------|-------------|--------|
| 1 | `not trading i want to know if you got any basketball game` | "We currently trade only electronics" | Product search / basketball message | ⬜ |
| 2 | `I don't want to trade, just looking for games` | Trade-in flow | Product listings | ⬜ |
| 3 | `no trade, just want to buy` | Trade-in prompts | Product search | ⬜ |
| 4 | `just want to see what games you have` | Trade-in questions | Product listings or clarifying questions | ⬜ |

**How to verify:**
- [ ] Does NOT say "We currently trade only electronics"
- [ ] Does NOT enter trade-in flow
- [ ] Treats query as normal product search

---

### **Test Group 4: Trade-In Still Works** ✅🔄

| # | Query | Should Trigger | Status |
|---|-------|---------------|--------|
| 1 | `trade in my ps5` | Trade-in flow (asks about model/condition) | ⬜ |
| 2 | `how much for my xbox` | Trade-in flow | ⬜ |
| 3 | `sell my switch` | Trade-in flow | ⬜ |

**How to verify:**
- [ ] Enters trade-in pricing flow
- [ ] Asks about model, condition, or device details
- [ ] Does NOT reject with "no trade" message

---

### **Test Group 5: Product Format** 📝

| # | Query | Check For | Status |
|---|-------|-----------|--------|
| 1 | `cheap tablets` | Numbered list, prices in S$, "View Product" links | ⬜ |
| 2 | `vr headsets` | Same formatting | ⬜ |
| 3 | `steam deck` | Same formatting | ⬜ |

**How to verify:**
- [ ] Products numbered: 1. 2. 3.
- [ ] All have "View Product" links
- [ ] All have S$XX.XX prices
- [ ] **ONLY first product has an image**
- [ ] Other products have NO images

---

### **Test Group 6: Edge Cases** 🔍

| # | Query | Expected Result | Status |
|---|-------|----------------|--------|
| 1 | `baseketball` (typo) | Recognizes as basketball | ⬜ |
| 2 | `nba 2k` | Basketball detection | ⬜ |
| 3 | `cheap phones under $200` | Shows phones with correct category link | ⬜ |

---

### **Test Group 7: Sanity Check** ✔️

| # | Query | Should Return | Status |
|---|-------|--------------|--------|
| 1 | `playstation 5` | PS5 products | ⬜ |
| 2 | `nintendo switch` | Switch products | ⬜ |
| 3 | `steam deck` | Steam Deck products | ⬜ |

---

## 🎯 **Critical 5-Test Quick Check**

Run these 5 tests first - if all pass, others likely will too:

1. ✅ `pokemon games` → Check pagination link works
2. ✅ `car games` → Check sports no-results message  
3. ✅ `not trading, just looking for games` → Check NO trade-in trigger
4. ✅ `trade in my ps5` → Check trade-in DOES trigger
5. ✅ `cheap tablets` → Check formatting & category link

---

## 📊 Test Results

**Date Tested:** _____________

**Tester:** _____________

**Total Passed:** _____ / 32

**Issues Found:**
```
1. 

2. 

3. 

```

---

## ✅ Sign-Off Criteria

Before moving to voice testing:
- [ ] All 5 critical tests pass
- [ ] No category link 404 errors
- [ ] No "gamess" or plural errors
- [ ] Sports queries don't show random products
- [ ] "not trading" doesn't trigger trade-in
- [ ] Actual trade-in queries still work
- [ ] Product formatting is consistent
- [ ] First product only shows image

**Ready for Voice Testing:** ⬜ YES / ⬜ NO

---

*Generated: 2026-01-03*
*Automated test file: `tests/today-fixes.spec.ts`*
