-- Quotas are per owner, shared by all authorized contacts.
-- Deploy in Supabase SQL Editor after security review, not automatically.
CREATE TABLE IF NOT EXISTS public.legacy_usage_months (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 month_start date NOT NULL,
 included_used integer NOT NULL DEFAULT 0 CHECK (included_used >= 0),
 purchased_used integer NOT NULL DEFAULT 0 CHECK (purchased_used >= 0),
 PRIMARY KEY(owner_id, month_start)
);
CREATE TABLE IF NOT EXISTS public.legacy_credit_balances (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 remaining integer NOT NULL DEFAULT 0 CHECK (remaining >= 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.legacy_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 message_id text NOT NULL,
 month_start date NOT NULL,
 source text NOT NULL CHECK (source IN ('owner','shared')),
 bucket text NOT NULL CHECK (bucket IN ('included','extra')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (owner_id,message_id)
);
CREATE TABLE IF NOT EXISTS public.legacy_credit_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 provider_payment_id text UNIQUE,
 credits integer NOT NULL CHECK (credits > 0),
 state text NOT NULL CHECK (state IN ('credited','reversed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_usage_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_credit_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_usage_months,public.legacy_credit_balances,public.legacy_usage_events,public.legacy_credit_transactions FROM anon,authenticated;
GRANT SELECT ON public.legacy_usage_months,public.legacy_credit_balances,public.legacy_usage_events,public.legacy_credit_transactions TO authenticated;
GRANT ALL ON public.legacy_usage_months,public.legacy_credit_balances,public.legacy_usage_events,public.legacy_credit_transactions TO service_role;
CREATE POLICY usage_owner_read ON public.legacy_usage_months FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY credit_owner_read ON public.legacy_credit_balances FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY event_owner_read ON public.legacy_usage_events FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY transaction_owner_read ON public.legacy_credit_transactions FOR SELECT TO authenticated USING(owner_id=auth.uid());

-- Charge one completed assistant turn exactly once; caller sends unique Meta message id.
-- Advisory lock keeps all users of one Legado on the same synchronized counter.
CREATE OR REPLACE FUNCTION public.legacy_reserve_interaction(
 p_owner uuid, p_message_id text, p_source text DEFAULT 'owner')
RETURNS TABLE (allowed boolean, used_count integer, allowance integer, credits_left integer, percent_used integer, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_plan text := 'essential'; v_limit integer := 100; v_used integer; v_extra integer;
 v_period date := date_trunc('month', now() AT TIME ZONE 'UTC')::date; v_active_until timestamptz;
 v_old_bucket text;
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_message_id IS NULL OR length(p_message_id) < 3 OR p_source NOT IN ('owner','shared') THEN RAISE EXCEPTION 'Invalid interaction'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_owner::text));
 SELECT plan,active_until INTO v_plan,v_active_until FROM public.legacy_user_entitlements WHERE owner_id=p_owner;
 IF NOT FOUND OR v_active_until IS NULL OR v_active_until <= now() THEN v_plan:='essential'; END IF;
 v_limit:= CASE v_plan WHEN 'shared' THEN 2000 WHEN 'complete' THEN 500 ELSE 100 END;
 IF p_source='shared' AND v_plan <> 'shared' THEN
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
 ELSIF v_extra > 0 THEN
   UPDATE public.legacy_credit_balances SET remaining=remaining-1,updated_at=now() WHERE owner_id=p_owner;
   UPDATE public.legacy_usage_months SET purchased_used=purchased_used+1 WHERE owner_id=p_owner AND month_start=v_period;
   v_extra:=v_extra-1;
   INSERT INTO public.legacy_usage_events(owner_id,message_id,month_start,source,bucket) VALUES(p_owner,p_message_id,v_period,p_source,'extra');
 ELSE
   RETURN QUERY SELECT false,v_used,v_limit,v_extra,100,'monthly_limit'::text; RETURN;
 END IF;
 RETURN QUERY SELECT true,v_used,v_limit,v_extra,least(100,(100*v_used/greatest(v_limit,1))),'ok'::text;
END $$;
REVOKE ALL ON FUNCTION public.legacy_reserve_interaction(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_reserve_interaction(uuid,text,text) TO service_role;
