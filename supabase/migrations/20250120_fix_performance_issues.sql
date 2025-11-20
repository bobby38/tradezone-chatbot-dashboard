-- Fix Supabase Performance Advisor warnings
-- 1. Optimize RLS policies by wrapping auth functions in SELECT
-- 2. Remove duplicate indexes
-- 3. Consolidate multiple permissive policies

-- ============================================
-- PART 1: Drop duplicate indexes
-- ============================================

-- chat_logs table
DROP INDEX IF EXISTS public.idx_chat_logs_created_at;  -- Keep chat_logs_created_idx
DROP INDEX IF EXISTS public.idx_chat_logs_session_id; -- Keep chat_logs_session_idx
DROP INDEX IF EXISTS public.idx_chat_logs_user_id;    -- Keep chat_logs_user_idx

-- form_submissions table
DROP INDEX IF EXISTS public.idx_form_submissions_form_type; -- Keep form_submissions_form_type_idx
DROP INDEX IF EXISTS public.idx_form_submissions_status;    -- Keep form_submissions_status_idx

-- settings table
DROP INDEX IF EXISTS public.idx_settings_unique; -- Keep the constraint-based index

-- ============================================
-- PART 2: Optimize RLS policies
-- Replace auth.<function>() with (SELECT auth.<function>())
-- ============================================

-- users table
DROP POLICY IF EXISTS "Users can see their own row" ON public.users;
CREATE POLICY "Users can see their own row" ON public.users
  FOR SELECT
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Insert own user row" ON public.users;
CREATE POLICY "Insert own user row" ON public.users
  FOR INSERT
  WITH CHECK (id = (SELECT auth.uid()));

-- chat_logs table - consolidate multiple policies
DROP POLICY IF EXISTS "Clients see their own logs" ON public.chat_logs;
DROP POLICY IF EXISTS "admins see all" ON public.chat_logs;
CREATE POLICY "chat_logs_select_policy" ON public.chat_logs
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR (SELECT auth.jwt()->>'role') = 'admin'
  );

-- prompts table - consolidate multiple policies
DROP POLICY IF EXISTS "Admins manage prompts" ON public.prompts;
DROP POLICY IF EXISTS "Read prompts" ON public.prompts;
CREATE POLICY "prompts_select_policy" ON public.prompts
  FOR SELECT
  USING ((SELECT auth.jwt()->>'role') = 'admin' OR true);

CREATE POLICY "prompts_manage_policy" ON public.prompts
  FOR ALL
  USING ((SELECT auth.jwt()->>'role') = 'admin')
  WITH CHECK ((SELECT auth.jwt()->>'role') = 'admin');

-- form_submissions table - consolidate multiple policies
DROP POLICY IF EXISTS "Allow authenticated users to view form submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Allow authenticated users to read form submissions" ON public.form_submissions;
CREATE POLICY "form_submissions_select_policy" ON public.form_submissions
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- settings table - consolidate multiple policies
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow authenticated users to update settings" ON public.settings;

CREATE POLICY "settings_select_policy" ON public.settings
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "settings_update_policy" ON public.settings
  FOR UPDATE
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- trade_in_leads table
DROP POLICY IF EXISTS "trade_in_leads_service_access" ON public.trade_in_leads;
CREATE POLICY "trade_in_leads_service_access" ON public.trade_in_leads
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- trade_in_media table
DROP POLICY IF EXISTS "trade_in_media_service_access" ON public.trade_in_media;
CREATE POLICY "trade_in_media_service_access" ON public.trade_in_media
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- trade_in_actions table
DROP POLICY IF EXISTS "trade_in_actions_service_access" ON public.trade_in_actions;
CREATE POLICY "trade_in_actions_service_access" ON public.trade_in_actions
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- trade_in_tags table
DROP POLICY IF EXISTS "trade_in_tags_service_access" ON public.trade_in_tags;
CREATE POLICY "trade_in_tags_service_access" ON public.trade_in_tags
  FOR ALL
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
