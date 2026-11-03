-- Apply only after backing up live function definitions and validating in staging.
BEGIN;
CREATE TABLE public.legacy_apple_subscriptions (
 original_transaction_id text NOT NULL, environment text NOT NULL CHECK(environment IN ('Production','Sandbox')),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 transaction_id text NOT NULL, product_id text NOT NULL CHECK(product_id='br.com.meulegado.plus.mensal'),
 active_until timestamptz NOT NULL, active boolean NOT NULL, signed_at timestamptz NOT NULL,
 PRIMARY KEY(original_transaction_id,environment)
);
ALTER TABLE public.legacy_apple_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_apple_subscriptions FROM anon,authenticated;
GRANT SELECT ON public.legacy_apple_subscriptions TO authenticated;
GRANT ALL ON public.legacy_apple_subscriptions TO service_role;
CREATE POLICY apple_subscription_owner ON public.legacy_apple_subscriptions FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE OR REPLACE FUNCTION public.legacy_apply_apple_subscription(p_subscription jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.legacy_apple_subscriptions;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 s:=jsonb_populate_record(NULL::public.legacy_apple_subscriptions,p_subscription);
 PERFORM pg_advisory_xact_lock(hashtext(s.original_transaction_id));
 IF EXISTS(SELECT 1 FROM public.legacy_apple_subscriptions WHERE original_transaction_id=s.original_transaction_id AND environment=s.environment AND owner_id<>s.owner_id) THEN RAISE EXCEPTION 'Already owned'; END IF;
 INSERT INTO public.legacy_apple_subscriptions SELECT s.*
 ON CONFLICT(original_transaction_id,environment) DO UPDATE SET
 transaction_id=excluded.transaction_id,active_until=excluded.active_until,active=excluded.active,signed_at=excluded.signed_at
 WHERE excluded.signed_at>=legacy_apple_subscriptions.signed_at;
 IF s.environment='Production' THEN
 INSERT INTO public.legacy_user_entitlements(owner_id,plan,active_until,updated_at)
 SELECT s.owner_id,CASE WHEN max(active_until)>now() THEN 'complete' ELSE 'essential' END,max(active_until),now()
 FROM public.legacy_apple_subscriptions WHERE owner_id=s.owner_id AND environment='Production' AND active
 ON CONFLICT(owner_id) DO UPDATE SET plan=excluded.plan,active_until=excluded.active_until,updated_at=excluded.updated_at;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.legacy_apply_apple_subscription(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_apply_apple_subscription(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.legacy_reserve_interaction(
 p_owner uuid, p_message_id text, p_source text DEFAULT 'owner')
RETURNS TABLE (allowed boolean, used_count integer, allowance integer, credits_left integer, percent_used integer, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_plan text := 'essential'; v_limit integer := 10; v_used integer; v_extra integer;
 v_period date := date_trunc('month', now() AT TIME ZONE 'UTC')::date; v_active_until timestamptz;
 v_old_bucket text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_message_id IS NULL OR length(p_message_id) < 3 OR p_source NOT IN ('owner','shared') THEN RAISE EXCEPTION 'Invalid interaction'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_owner::text));
 SELECT plan,active_until INTO v_plan,v_active_until FROM public.legacy_user_entitlements WHERE owner_id=p_owner;
 IF NOT FOUND OR v_active_until IS NULL OR v_active_until <= now() THEN v_plan:='essential'; END IF;
 v_limit:=CASE WHEN EXISTS (SELECT 1 FROM public.legacy_apple_subscriptions WHERE owner_id=p_owner AND environment='Production' AND active AND active_until>now()) THEN 100 ELSE 10 END;
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

COMMIT;
