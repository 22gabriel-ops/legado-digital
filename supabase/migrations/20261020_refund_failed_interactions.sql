-- Refund a reservation only when the server cannot deliver an AI response.
-- SECURITY DEFINER and service_role-only; serialize with the quota reservation lock.
CREATE OR REPLACE FUNCTION public.legacy_refund_interaction(p_owner uuid,p_message_id text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bucket text; v_month date;
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_owner IS NULL OR p_message_id IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_owner::text));
 SELECT bucket,month_start INTO v_bucket,v_month
 FROM public.legacy_usage_events
 WHERE owner_id=p_owner AND message_id=p_message_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 DELETE FROM public.legacy_usage_events WHERE owner_id=p_owner AND message_id=p_message_id;
 IF v_bucket='included' THEN
  UPDATE public.legacy_usage_months SET included_used=included_used-1
  WHERE owner_id=p_owner AND month_start=v_month AND included_used>0;
 ELSIF v_bucket='extra' THEN
  UPDATE public.legacy_usage_months SET purchased_used=purchased_used-1
  WHERE owner_id=p_owner AND month_start=v_month AND purchased_used>0;
  UPDATE public.legacy_credit_balances SET remaining=remaining+1,updated_at=now()
  WHERE owner_id=p_owner;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.legacy_refund_interaction(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_refund_interaction(uuid,text) TO service_role;
