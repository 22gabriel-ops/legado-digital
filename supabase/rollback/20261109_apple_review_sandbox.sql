-- Disable only the new Sandbox review capability; preserve all review history.
-- Do not modify Production functions, tables, subscriptions or entitlements.
BEGIN;
CREATE OR REPLACE FUNCTION public.legacy_apple_review_status(p_owner uuid)
RETURNS TABLE(active boolean,used_count integer,allowance integer,remaining integer,active_until timestamptz,environment text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Apple Sandbox review is disabled'; END $$;
CREATE OR REPLACE FUNCTION public.legacy_apple_review_reserve(p_owner uuid,p_message_id text)
RETURNS TABLE(allowed boolean,used_count integer,allowance integer,remaining integer,reason text,response_saved boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Apple Sandbox review is disabled'; END $$;
CREATE OR REPLACE FUNCTION public.legacy_apple_review_complete(p_owner uuid,p_message_id text,p_user_content text,p_assistant_content text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Apple Sandbox review is disabled'; END $$;
CREATE OR REPLACE FUNCTION public.legacy_apple_review_refund(p_owner uuid,p_message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Apple Sandbox review is disabled'; END $$;
REVOKE ALL ON FUNCTION public.legacy_apple_review_status(uuid),public.legacy_apple_review_reserve(uuid,text),public.legacy_apple_review_complete(uuid,text,text,text),public.legacy_apple_review_refund(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON public.legacy_apple_review_months,public.legacy_apple_review_events,public.legacy_apple_review_turns FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.legacy_apple_review_turns_ordinal_seq FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
