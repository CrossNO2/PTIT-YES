-- Migration 12: Security Remediation (Fix Privilege Escalation in handle_new_user)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Security Hardening: Public signup ALWAYS creates account_type = 'customer'
  -- Ignoring any raw_user_meta_data->>'account_type' passed by client to prevent privilege escalation
  INSERT INTO public.profiles (id, email, name, phone, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'customer'::public.user_account_type
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = CASE WHEN public.profiles.name = '' THEN EXCLUDED.name ELSE public.profiles.name END,
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to lock account_type against self-escalation by authenticated users
CREATE OR REPLACE FUNCTION public.prevent_profile_account_type_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id THEN
    IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
      RAISE EXCEPTION 'FORBIDDEN: Cannot self-escalate account_type';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'FORBIDDEN: Profile email must follow Supabase Auth email';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'FORBIDDEN: Cannot change your own account activation state';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_account_type_lock ON public.profiles;
CREATE TRIGGER enforce_profile_account_type_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_account_type_escalation();

-- One-time bootstrap helper for a fresh project. It is intentionally NOT granted
-- to anon/authenticated; run it manually from Supabase SQL Editor after the chosen
-- admin account has registered.
CREATE OR REPLACE FUNCTION public.bootstrap_greenbridge_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_shop_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND: Register this email first'; END IF;
  SELECT id INTO v_shop_id FROM public.shops WHERE slug = 'greenbridge-main' LIMIT 1;
  IF v_shop_id IS NULL THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: Run migration/query 11 first'; END IF;

  UPDATE public.profiles SET account_type = 'platform_admin', updated_at = now() WHERE id = v_user_id;
  INSERT INTO public.shop_members(shop_id,user_id,member_role,status)
  VALUES(v_shop_id,v_user_id,'owner','active')
  ON CONFLICT (shop_id,user_id) DO UPDATE SET member_role='owner',status='active',updated_at=now();

  RETURN jsonb_build_object('success',true,'user_id',v_user_id,'shop_id',v_shop_id);
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_greenbridge_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_greenbridge_admin(text) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_greenbridge_admin(text) FROM authenticated;
