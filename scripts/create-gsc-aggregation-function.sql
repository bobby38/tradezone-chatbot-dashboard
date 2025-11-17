CREATE OR REPLACE FUNCTION get_gsc_aggregated_data(
  p_sites text[],
  p_start_date date,
  p_end_date date,
  p_filter_device text,
  p_search_q text,
  p_page_size integer,
  p_page integer,
  p_type text
)
RETURNS TABLE(
  "group_key" text,
  "clicks" numeric,
  "impressions" numeric,
  "ctr" numeric,
  "position" numeric
)
AS $$
BEGIN
  RETURN QUERY
  WITH performance_data AS (
    SELECT
      CASE
        WHEN p_type = 'query' THEN query
        ELSE page
      END AS group_key,
      clicks,
      impressions,
      ctr,
      position
    FROM gsc_performance
    WHERE
      site = ANY(p_sites)
      AND date >= p_start_date
      AND date <= p_end_date
      AND (p_filter_device IS NULL OR p_filter_device = 'all' OR device = p_filter_device)
      AND (p_search_q IS NULL OR query ILIKE '%' || p_search_q || '%' OR page ILIKE '%' || p_search_q || '%')
      AND (
        (p_type = 'query' AND query IS NOT NULL AND query <> '') OR
        (p_type = 'page' AND page IS NOT NULL AND page <> '')
      )
  )
  SELECT
    pd.group_key,
    SUM(pd.clicks)::numeric AS clicks,
    SUM(pd.impressions)::numeric AS impressions,
    AVG(pd.ctr)::numeric AS ctr,
    AVG(pd.position)::numeric AS position
  FROM performance_data pd
  GROUP BY pd.group_key
  ORDER BY clicks DESC
  LIMIT p_page_size
  OFFSET (p_page - 1) * p_page_size;
END;
$$ LANGUAGE plpgsql;
