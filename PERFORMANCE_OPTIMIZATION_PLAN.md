# Performance Optimization Plan - TradeZone Chatbot

## Issues Identified (2025-01-18)

### 1. Vector Search Latency: 4.3 seconds ⚠️
**Current:** `gpt-4.1` for vector search  
**Impact:** Slow user experience, high costs

**Root Causes:**
- Using heavy model (gpt-4.1) for simple vector lookup
- Calling findCatalogMatches() for every search (adds latency)
- Sequential operations (vector → catalog → perplexity)

**Solutions:**
- [ ] Switch to `gpt-4o-mini` for vector search (5x faster, 60% cheaper)
- [ ] Implement parallel execution where possible
- [ ] Add response streaming for better UX
- [ ] Cache frequent queries (Redis/memory)

### 2. Token Usage: 12,490 tokens ⚠️
**Current:** $0.0019 per simple product search  
**Expected:** ~$0.0003 for similar query

**Root Causes:**
- Large conversation history (not truncated)
- Verbose system prompts
- Multiple tool calls with full history
- Zep context adding redundant data

**Solutions:**
- [ ] Truncate history to last 10 messages
- [ ] Compress system prompts (remove examples from runtime)
- [ ] Use tool result summaries instead of full responses
- [ ] Optimize Zep context (only essential facts)

### 3. Duplicate Responses
**Current:** Two separate responses (catalog + WooCommerce)  
**Expected:** Single consolidated response

**Root Causes:**
- No deduplication between catalog and Woo results
- Both rendering independently

**Solutions:**
- [ ] Deduplicate by product ID/permalink
- [ ] Single response formatter
- [ ] Prefer catalog over Woo when both exist

## Priority Actions

### Immediate (This Session):
1. ✅ Document the issues
2. Switch vector search model to gpt-4o-mini
3. Implement history truncation
4. Test performance improvement

### Short Term (This Week):
1. Add query result caching
2. Optimize system prompts
3. Implement response streaming
4. Add performance monitoring

### Medium Term (This Month):
1. Implement Redis caching layer
2. Add CDN for static assets
3. Database query optimization
4. Vector store optimization

## Performance Targets

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Vector Search Latency | 4.3s | <1s | 77% faster |
| Total Response Time | 5s+ | <2s | 60% faster |
| Token Usage | 12,490 | <3,000 | 76% reduction |
| Cost Per Query | $0.0019 | $0.0003 | 84% cheaper |

## Monitoring Plan

Add logging for:
- [ ] Vector search latency by query type
- [ ] Token usage per endpoint
- [ ] Cache hit/miss rates
- [ ] User-perceived response time

---
Generated: $(date)
Priority: HIGH
Owner: Development Team
