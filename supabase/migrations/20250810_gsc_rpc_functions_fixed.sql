-- RPC functions for Google Search Console data

-- Function to get top queries
CREATE OR REPLACE FUNCTION get_top_queries(
  p_site TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  query TEXT,
  clicks BIGINT,
  impressions BIGINT,
  ctr NUMERIC,
  "position" NUMERIC
)
LANGUAGE SQL
AS $$
  SELECT 
    query,
    SUM(clicks)::BIGINT AS clicks,
    SUM(impressions)::BIGINT AS impressions,
    AVG(ctr) AS ctr,
    AVG(position) AS "position"
  FROM 
    gsc_performance
  WHERE 
    site = p_site
    AND date >= p_start_date
    AND date <= p_end_date
    AND query IS NOT NULL
    AND query != ''
  GROUP BY 
    query
  ORDER BY 
    clicks DESC
  LIMIT p_limit;
$$;

-- Function to get top pages
CREATE OR REPLACE FUNCTION get_top_pages(
  p_site TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  page TEXT,
  clicks BIGINT,
  impressions BIGINT,
  ctr NUMERIC,
  "position" NUMERIC
)
LANGUAGE SQL
AS $$
  SELECT 
    page,
    SUM(clicks)::BIGINT AS clicks,
    SUM(impressions)::BIGINT AS impressions,
    AVG(ctr) AS ctr,
    AVG(position) AS "position"
  FROM 
    gsc_performance
  WHERE 
    site = p_site
    AND date >= p_start_date
    AND date <= p_end_date
    AND page IS NOT NULL
    AND page != ''
  GROUP BY 
    page
  ORDER BY 
    clicks DESC
  LIMIT p_limit;
$$;
