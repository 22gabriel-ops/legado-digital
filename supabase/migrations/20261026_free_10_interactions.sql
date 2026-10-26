-- Free-only launch: reduce monthly shared quota from 100 to 10.
-- Keep paid plans inactive until verified subscriptions and channel entitlements are ready.
-- FREE LAUNCH (October 2026): apply in Supabase SQL Editor after reviewing.
-- Does not delete prior entitlements, usage, memories or credit balances.
-- Temporarily enforces 10 included interactions per owner per UTC month for all channels.
-- Ignores paid entitlements and extra credit balances until a future StoreKit rollout.
-- Existing paid purchasers require separate treatment/refund where applicable.
CREATE OR REPLACE FUNCTION public.legacy_reserve_interaction(
 p_owner uuid, p_message_id text, p_source text DEFAULT 'owner')
RETURNS TABLE (allowed boolean, used_count integer, allowance integer, credits_left integer, percent_used integer, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_plan text := 'essential'; v_limit integer := 10; v_used integer; v_extra integer;
 v_period date := date_trunc('month', now() AT TIME ZONE 'UTC')::date; v_active_until timestamptz;
 v_old_bucket text;
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_message_id IS NULL OR length(p_message_id) < 3 OR p_source NOT IN ('owner','shared') THEN RAISE EXCEPTION 'Invalid interaction'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_owner::text));
 SELECT plan,active_until INTO v_plan,v_active_until FROM public.legacy_user_entitlements WHERE owner_id=p_owner;
 IF NOT FOUND OR v_active_until IS NULL OR v_active_until <= now() THEN v_plan:='essential'; END IF;
 v_plan:='essential'; v_limit:=10; -- Free-only launch: paid entitlements remain disabled until billing is ready.
 IF p_source='shared' THEN
   RETURN QUERY SELECT false,0,v_limit,0,0,'shared_plan_inactive'::text; RETURN;
 END IF;
 SELECT bucket INTO v_old_bucket FROM public.legacy_usage_events WHERE owner_id=p_owner AND message_id=p_message_id;
 INSERT INTO public.legacy_usage_months(owner_id,month_start) VALUES(p_owner,v_period) ON CONFLICT DO NOTHING;
 SELECT included_used INTO v_used FROM public.legacy_usage_months WHERE owner_id=p_owner AND month_start=v_period;
 INSERT INTO public.legacy_credit_balances(owner_id) VALUES(p_owner) ON CONFLICT DO NOTHING;
 SELECT remaining INTO v_extra FROM public.legacy_credit_balances WHERE owner_id=p_owner;
 IF v_old_bucket IS NOT NULL THEN
   RETURN QUERY SELECT true,v_used,v_limit,v_extra,least(100,(100*v_used/greatest(v_limit,1))),'duplicate'::text; RETURN;
 END IF;
 IF v_used < v_limit THEN
   UPDATE public.legacy_usage_months SET included_used=included_used+1 WHERE owner_id=p_owner AND month_start=v_period;
   v_used:=v_used+1;
   INSERT INTO public.legacy_usage_events(owner_id,message_id,month_start,source,bucket) VALUES(p_owner,p_message_id,v_period,p_source,'included');
 ELSE
   RETURN QUERY SELECT false,v_used,v_limit,v_extra,100,'monthly_limit'::text; RETURN;
 END IF;
 RETURN QUERY SELECT true,v_used,v_limit,v_extra,least(100,(100*v_used/greatest(v_limit,1))),'ok'::text;
END $$;

REVOKE ALL ON FUNCTION public.legacy_reserve_interaction(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_reserve_interaction(uuid,text,text) TO service_role;
