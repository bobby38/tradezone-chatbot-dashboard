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
    
    // Handle both formats of SC_SITE (https:// and sc-domain:) and accept query override
    const rawSite = searchParams.get('site') || process.env.SC_SITE || 'sc-domain:tradezone.sg'
    // Normalize to sc-domain:example.com (no trailing slash)
    function normalizeSite(value: string) {
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
    
    // Get daily summary data
    const { data: summaryData, error: summaryError } = await supabase
      .from('gsc_daily_summary')
      .select('*')
      .eq('site', site)
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
    let topQueries = [];
    let queriesError = null;
    
    try {
      const { data, error } = await supabase
        .from('gsc_performance')
        .select('query, clicks, impressions, ctr, position')
        .eq('site', site)
        .gte('date', startDate)
        .lte('date', endDate)
        .not('query', 'is', null)
        .not('query', 'eq', '')
        .order('clicks', { ascending: false })
        .limit(10);
      
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
        
        // Limit to 10
        topQueries = topQueries.slice(0, 10);
      }
    } catch (error) {
      console.error('Error processing query data:', error);
      queriesError = error;
    }
    
    // Query for top pages
    let topPages = [];
    let pagesError = null;
    
    try {
      const { data, error } = await supabase
        .from('gsc_performance')
        .select('page, clicks, impressions, ctr, position')
        .eq('site', site)
        .gte('date', startDate)
        .lte('date', endDate)
        .not('page', 'is', null)
        .not('page', 'eq', '')
        .order('clicks', { ascending: false })
        .limit(10);
      
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
        
        // Limit to 10
        topPages = topPages.slice(0, 10);
      }
    } catch (error) {
      console.error('Error processing page data:', error);
      pagesError = error;
    }
    
    if (pagesError) {
      console.error('Error fetching SC pages data from Supabase:', pagesError)
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
      dataSource: 'supabase',
    })
    
  } catch (error) {
    console.error('Error in SC Supabase API route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
