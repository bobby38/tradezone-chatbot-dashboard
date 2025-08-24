import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Helper to get date range (similar to the original SC API)
function getDateRange(daysParam?: string) {
  // Support longer time ranges (up to 1 year/365 days)
  // Default to 7 days if not specified
  let days = parseInt(daysParam || '7', 10)
  
  // Special case for 'year' parameter
  if (daysParam === 'year') {
    days = 365
  } else if (daysParam === '6m') {
    days = 180
  }
  
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  
  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0]
  }
  
  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  }
}

// Initialize Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = searchParams.get('days') || '7'
    const { startDate, endDate } = getDateRange(days)
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const pageSizeParam = parseInt(searchParams.get('pageSize') || '100', 10)
    const searchQ = (searchParams.get('q') || '').trim()
    const filterDevice = (searchParams.get('device') || '').trim()
    
    // Handle both formats of SC_SITE (https:// and sc-domain:) and accept query override
    const rawSite = searchParams.get('site') || process.env.SC_SITE || 'sc-domain:tradezone.sg'
    // Normalize to sc-domain:example.com (no trailing slash)
    const normalizeSite = (value: string) => {
      let v = value.trim()
      // Strip protocol if present
      if (v.startsWith('https://')) v = v.slice('https://'.length)
      if (v.startsWith('http://')) v = v.slice('http://'.length)
      // Remove leading www.
      if (v.startsWith('www.')) v = v.slice('www.'.length)
      // Remove leading slash for accidental inputs
      v = v.replace(/^\//, '')
      // Ensure no trailing slash
      v = v.replace(/\/$/, '')
      // If already sc-domain:, ensure no trailing slash after
      if (v.startsWith('sc-domain:')) {
        const rest = v.substring('sc-domain:'.length).replace(/\/$/, '')
        return `sc-domain:${rest}`
      }
      // Otherwise treat v as hostname
      return `sc-domain:${v}`
    }
    const site = normalizeSite(rawSite)
    
    const supabase = getSupabaseClient()
    const debug = (searchParams.get('debug') || '') === '1'
    // Build candidate site variants to be tolerant of how data was stored
    const candidates = (() => {
      const host = site.replace('sc-domain:', '')
      const withSlash = (s: string) => (s.endsWith('/') ? s : s + '/')
      const withoutSlash = (s: string) => s.replace(/\/$/, '')
      const variants = new Set<string>([
        site,
        withoutSlash(site),
        withSlash(site),
        `https://${host}`,
        withSlash(`https://${host}`),
        `http://${host}`,
        withSlash(`http://${host}`),
        `https://www.${host}`,
        withSlash(`https://www.${host}`),
        `http://www.${host}`,
        withSlash(`http://www.${host}`),
      ])
      return Array.from(variants)
    })()
    
    // Get daily summary data
    const { data: summaryData, error: summaryError } = await supabase
      .from('gsc_daily_summary')
      .select('*')
      .in('site', candidates)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
    
    if (summaryError) {
      console.error('Error fetching SC summary data from Supabase:', summaryError)
      return NextResponse.json({ error: 'Failed to fetch Search Console data' }, { status: 500 })
    }
    
    // Calculate totals and averages
    let totalClicks = 0
    let totalImpressions = 0
    let totalCtr = 0
    let totalPosition = 0
    
    summaryData.forEach(day => {
      totalClicks += day.clicks
      totalImpressions += day.impressions
      totalCtr += day.ctr
      totalPosition += day.position
    })
    
    const count = summaryData.length || 1
    const avgCtr = totalCtr / count
    const avgPosition = totalPosition / count
    
    // Use direct queries instead of RPC functions
    // Query for top queries
    let topQueries: any[] = [];
    let queriesError: any = null;
    
    try {
      let queryBuilder = supabase
        .from('gsc_performance')
        .select('query, page, clicks, impressions, ctr, position, device, country')
        .in('site', candidates)
        .gte('date', startDate)
        .lte('date', endDate)
        .not('query', 'is', null)
        .not('query', 'eq', '')

      if (filterDevice && filterDevice !== 'all') {
        queryBuilder = queryBuilder.eq('device', filterDevice)
      }
      if (searchQ) {
        // Match either query or page text
        queryBuilder = queryBuilder.or(`query.ilike.%${searchQ}%,page.ilike.%${searchQ}%`)
      }

      // Fetch a reasonably large window, then aggregate client-side and paginate
      const { data, error } = await queryBuilder
        .order('clicks', { ascending: false })
        .limit(Math.max(pageSizeParam * 5, 500))
      
      if (error) {
        queriesError = error;
        console.error('Error fetching SC queries data from Supabase:', error);
      } else {
        // Process the data to aggregate by query
        const queryMap = new Map();
        
        data.forEach(row => {
          if (!queryMap.has(row.query)) {
            queryMap.set(row.query, {
              query: row.query,
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: 0,
              count: 0
            });
          }
          
          const item = queryMap.get(row.query);
          item.clicks += row.clicks;
          item.impressions += row.impressions;
          item.ctr += row.ctr;
          item.position += row.position;
          item.count += 1;
        });
        
        // Calculate averages and create final array
        topQueries = Array.from(queryMap.values()).map(item => ({
          query: item.query,
          clicks: item.clicks,
          impressions: item.impressions,
          ctr: item.ctr / item.count,
          position: item.position / item.count
        }));
        
        // Sort by clicks
        topQueries.sort((a, b) => b.clicks - a.clicks);
        // Paginate
        const start = Math.max(0, (pageParam - 1) * pageSizeParam)
        const end = start + pageSizeParam
        const totalTopQueries = topQueries.length
        topQueries = topQueries.slice(start, end)
        // Attach total to diagnostics for possible client use later (not breaking schema)
        if (debug) {
          ;(diagnostics ||= {}).topQueriesTotal = totalTopQueries
        }
      }
    } catch (error) {
      console.error('Error processing query data:', error);
      queriesError = error;
    }
    
    // Query for top pages
    let topPages: any[] = [];
    let pagesError: any = null;
    
    try {
      let pageBuilder = supabase
        .from('gsc_performance')
        .select('page, clicks, impressions, ctr, position, device, country')
        .in('site', candidates)
        .gte('date', startDate)
        .lte('date', endDate)
        .not('page', 'is', null)
        .not('page', 'eq', '')
      if (filterDevice && filterDevice !== 'all') {
        pageBuilder = pageBuilder.eq('device', filterDevice)
      }
      if (searchQ) {
        pageBuilder = pageBuilder.or(`page.ilike.%${searchQ}%,query.ilike.%${searchQ}%`)
      }
      const { data, error } = await pageBuilder
        .order('clicks', { ascending: false })
        .limit(Math.max(pageSizeParam * 5, 500));
      
      if (error) {
        pagesError = error;
        console.error('Error fetching SC pages data from Supabase:', error);
      } else {
        // Process the data to aggregate by page
        const pageMap = new Map();
        
        data.forEach(row => {
          if (!pageMap.has(row.page)) {
            pageMap.set(row.page, {
              page: row.page,
              clicks: 0,
              impressions: 0,
              ctr: 0,
              position: 0,
              count: 0
            });
          }
          
          const item = pageMap.get(row.page);
          item.clicks += row.clicks;
          item.impressions += row.impressions;
          item.ctr += row.ctr;
          item.position += row.position;
          item.count += 1;
        });
        
        // Calculate averages and create final array
        topPages = Array.from(pageMap.values()).map(item => ({
          page: item.page,
          clicks: item.clicks,
          impressions: item.impressions,
          ctr: item.ctr / item.count,
          position: item.position / item.count
        }));
        
        // Sort by clicks
        topPages.sort((a, b) => b.clicks - a.clicks);
        
        // Paginate
        const start = Math.max(0, (pageParam - 1) * pageSizeParam)
        const end = start + pageSizeParam
        const totalTopPages = topPages.length
        topPages = topPages.slice(start, end)
        if (debug) {
          ;(diagnostics ||= {}).topPagesTotal = totalTopPages
        }
      }
    } catch (error) {
      console.error('Error processing page data:', error);
      pagesError = error;
    }

    // Build combined performance rows (query + page) for table usage
    let performance: Array<{ query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }> = []
    try {
      let perfBuilder = supabase
        .from('gsc_performance')
        .select('query, page, clicks, impressions, ctr, position, device, country')
        .in('site', candidates)
        .gte('date', startDate)
        .lte('date', endDate)
        .not('query', 'is', null)
        .not('query', 'eq', '')
        .not('page', 'is', null)
        .not('page', 'eq', '')
      if (filterDevice && filterDevice !== 'all') {
        perfBuilder = perfBuilder.eq('device', filterDevice)
      }
      if (searchQ) {
        perfBuilder = perfBuilder.or(`query.ilike.%${searchQ}%,page.ilike.%${searchQ}%`)
      }
      const { data: perfData } = await perfBuilder.limit(Math.max(pageSizeParam * 5, 500))
      if (perfData && perfData.length) {
        const map = new Map<string, { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number; count: number }>()
        for (const r of perfData) {
          const key = `${r.query}|||${r.page}`
          if (!map.has(key)) {
            map.set(key, { query: r.query, page: r.page, clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 })
          }
          const it = map.get(key)!
          it.clicks += r.clicks
          it.impressions += r.impressions
          it.ctr += r.ctr
          it.position += r.position
          it.count += 1
        }
        performance = Array.from(map.values()).map(it => ({
          query: it.query,
          page: it.page,
          clicks: it.clicks,
          impressions: it.impressions,
          ctr: it.count ? it.ctr / it.count : 0,
          position: it.count ? it.position / it.count : 0,
        }))
        performance.sort((a, b) => b.clicks - a.clicks)
        const start = Math.max(0, (pageParam - 1) * pageSizeParam)
        const end = start + pageSizeParam
        performance = performance.slice(start, end)
      }
    } catch (e) {
      console.error('Error aggregating performance:', e)
    }

    // Optional debug diagnostics
    let diagnostics: any = undefined
    if (debug) {
      try {
        const { data: anySummary } = await supabase
          .from('gsc_daily_summary')
          .select('site, date')
          .limit(1)
        const { count: anySummaryCount } = await supabase
          .from('gsc_daily_summary')
          .select('*', { count: 'exact', head: true })
        const { count: filteredSummaryCount } = await supabase
          .from('gsc_daily_summary')
          .select('*', { count: 'exact', head: true })
          .in('site', candidates)
        diagnostics = {
          site,
          candidates,
          supabaseUrlHost: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/^https?:\/\//, ''),
          anySummaryCount,
          filteredSummaryCount,
          sampleSummary: anySummary || [],
        }
      } catch (_) {}
    }

    return NextResponse.json({
      summary: {
        clicks: totalClicks,
        impressions: totalImpressions,
        ctr: avgCtr,
        position: avgPosition,
        range: { startDate, endDate },
      },
      dailyData: summaryData,
      topQueries: topQueries || [],
      topPages: topPages || [],
      performance: performance || [],
      dataSource: 'supabase',
      ...(debug ? { debug: diagnostics } : {}),
    })
    
  } catch (error) {
    console.error('Error in SC Supabase API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
