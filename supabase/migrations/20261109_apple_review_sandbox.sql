-- Local candidate only. Applying this migration requires separate authorization.
-- Sandbox demonstration data and counters never write Production usage/entitlements.
BEGIN;
CREATE TABLE public.legacy_apple_review_months (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 month_start date NOT NULL,
 included_used integer NOT NULL DEFAULT 0 CHECK (included_used BETWEEN 0 AND 100),
 PRIMARY KEY(owner_id,month_start)
);
CREATE TABLE public.legacy_apple_review_events (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 message_id text NOT NULL CHECK (length(message_id) BETWEEN 3 AND 200),
 month_start date NOT NULL,
 response_saved boolean NOT NULL DEFAULT false,
 refunded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,message_id),
 FOREIGN KEY(owner_id,month_start) REFERENCES public.legacy_apple_review_months(owner_id,month_start),
 CHECK (NOT(response_saved AND refunded_at IS NOT NULL))
);
CREATE TABLE public.legacy_apple_review_turns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 message_id text NOT NULL,
 role text NOT NULL CHECK(role IN ('user','assistant')),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 3500),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,message_id,role),
 FOREIGN KEY(owner_id,message_id) REFERENCES public.legacy_apple_review_events(owner_id,message_id) ON DELETE CASCADE
);
CREATE INDEX legacy_apple_review_turns_owner_order ON public.legacy_apple_review_turns(owner_id,ordinal DESC);
ALTER TABLE public.legacy_apple_review_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_apple_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_apple_review_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_apple_review_months,public.legacy_apple_review_events,public.legacy_apple_review_turns FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.legacy_apple_review_months,public.legacy_apple_review_events,public.legacy_apple_review_turns TO authenticated;
GRANT ALL ON public.legacy_apple_review_months,public.legacy_apple_review_events,public.legacy_apple_review_turns TO service_role;
REVOKE ALL ON SEQUENCE public.legacy_apple_review_turns_ordinal_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.legacy_apple_review_turns_ordinal_seq TO service_role;
CREATE POLICY apple_review_month_owner ON public.legacy_apple_review_months FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY apple_review_event_owner ON public.legacy_apple_review_events FOR SELECT TO authenticated USING(owner_id=auth.uid());
CREATE POLICY apple_review_turn_owner ON public.legacy_apple_review_turns FOR SELECT TO authenticated USING(owner_id=auth.uid());

CREATE FUNCTION public.legacy_apple_review_status(p_owner uuid)
RETURNS TABLE(active boolean,used_count integer,allowance integer,remaining integer,active_until timestamptz,environment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_until timestamptz;v_used integer:=0;v_limit integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_owner IS NULL THEN RAISE EXCEPTION 'Invalid owner'; END IF;
 SELECT max(s.active_until) INTO v_until FROM public.legacy_apple_subscriptions s
 WHERE s.owner_id=p_owner AND s.environment='Sandbox' AND s.product_id='br.com.meulegado.plus.mensal'
 AND s.active AND s.active_until>now();
 IF v_until IS NOT NULL THEN v_limit:=100; END IF;
 SELECT coalesce(m.included_used,0) INTO v_used FROM public.legacy_apple_review_months m
 WHERE m.owner_id=p_owner AND m.month_start=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 v_used:=coalesce(v_used,0);
 RETURN QUERY SELECT v_until IS NOT NULL,v_used,v_limit,greatest(0,v_limit-v_used),v_until,'Sandbox'::text;
END $$;

CREATE FUNCTION public.legacy_apple_review_reserve(p_owner uuid,p_message_id text)
RETURNS TABLE(allowed boolean,used_count integer,allowance integer,remaining integer,reason text,response_saved boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status record;v_event public.legacy_apple_review_events;v_used integer;
 v_month date:=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_owner IS NULL OR p_message_id IS NULL OR length(p_message_id) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Invalid reservation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('apple-review:'||p_owner::text,0));
 SELECT s.* INTO v_status FROM public.legacy_apple_review_status(p_owner) s;
 IF NOT v_status.active THEN
  RETURN QUERY SELECT false,v_status.used_count,0,0,'inactive'::text,false;RETURN;
 END IF;
 SELECT e.* INTO v_event FROM public.legacy_apple_review_events e WHERE e.owner_id=p_owner AND e.message_id=p_message_id;
 IF FOUND THEN
  RETURN QUERY SELECT v_event.response_saved,v_status.used_count,v_status.allowance,v_status.remaining,
   CASE WHEN v_event.refunded_at IS NOT NULL THEN 'refunded' WHEN v_event.response_saved THEN 'duplicate' ELSE 'in_progress' END,
   v_event.response_saved;RETURN;
 END IF;
 IF v_status.used_count>=v_status.allowance THEN
  RETURN QUERY SELECT false,v_status.used_count,v_status.allowance,0,'monthly_limit'::text,false;RETURN;
 END IF;
 INSERT INTO public.legacy_apple_review_months(owner_id,month_start) VALUES(p_owner,v_month) ON CONFLICT DO NOTHING;
 UPDATE public.legacy_apple_review_months m SET included_used=m.included_used+1
 WHERE m.owner_id=p_owner AND m.month_start=v_month RETURNING m.included_used INTO v_used;
 INSERT INTO public.legacy_apple_review_events(owner_id,message_id,month_start) VALUES(p_owner,p_message_id,v_month);
 RETURN QUERY SELECT true,v_used,100,greatest(0,100-v_used),'reserved'::text,false;
END $$;

CREATE FUNCTION public.legacy_apple_review_complete(p_owner uuid,p_message_id text,p_user_content text,p_assistant_content text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_event public.legacy_apple_review_events;v_active boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_owner IS NULL OR p_message_id IS NULL OR p_user_content IS NULL OR p_assistant_content IS NULL
 OR length(btrim(p_user_content)) NOT BETWEEN 1 AND 1600 OR length(btrim(p_assistant_content)) NOT BETWEEN 1 AND 3500 THEN RAISE EXCEPTION 'Invalid response'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('apple-review:'||p_owner::text,0));
 SELECT e.* INTO v_event FROM public.legacy_apple_review_events e WHERE e.owner_id=p_owner AND e.message_id=p_message_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
 IF v_event.response_saved THEN RETURN false; END IF;
 IF v_event.refunded_at IS NOT NULL THEN RAISE EXCEPTION 'Reservation refunded'; END IF;
 SELECT s.active INTO v_active FROM public.legacy_apple_review_status(p_owner) s;
 IF NOT v_active THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
 INSERT INTO public.legacy_apple_review_turns(owner_id,message_id,role,content) VALUES(p_owner,p_message_id,'user',p_user_content);
 INSERT INTO public.legacy_apple_review_turns(owner_id,message_id,role,content) VALUES(p_owner,p_message_id,'assistant',p_assistant_content);
 UPDATE public.legacy_apple_review_events e SET response_saved=true WHERE e.owner_id=p_owner AND e.message_id=p_message_id;
 RETURN true;
END $$;

CREATE FUNCTION public.legacy_apple_review_refund(p_owner uuid,p_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_event public.legacy_apple_review_events;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_owner IS NULL OR p_message_id IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('apple-review:'||p_owner::text,0));
 SELECT e.* INTO v_event FROM public.legacy_apple_review_events e WHERE e.owner_id=p_owner AND e.message_id=p_message_id FOR UPDATE;
 IF NOT FOUND OR v_event.response_saved OR v_event.refunded_at IS NOT NULL THEN RETURN false; END IF;
 UPDATE public.legacy_apple_review_months m SET included_used=m.included_used-1
 WHERE m.owner_id=p_owner AND m.month_start=v_event.month_start AND m.included_used>0;
 UPDATE public.legacy_apple_review_events e SET refunded_at=now() WHERE e.owner_id=p_owner AND e.message_id=p_message_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.legacy_apple_review_status(uuid),public.legacy_apple_review_reserve(uuid,text),public.legacy_apple_review_complete(uuid,text,text,text),public.legacy_apple_review_refund(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_apple_review_status(uuid),public.legacy_apple_review_reserve(uuid,text),public.legacy_apple_review_complete(uuid,text,text,text),public.legacy_apple_review_refund(uuid,text) TO service_role;
COMMIT;
