DO $$
DECLARE
    v_admin_id uuid;
    v_shipper_id uuid;
    v_customer_id uuid;
    v_shop_id uuid;
BEGIN

    -- ========================================================
    -- 1. GET AUTH USER IDS
    -- ========================================================

    SELECT id
    INTO v_admin_id
    FROM auth.users
    WHERE lower(email) = lower('admin@test.com')
    LIMIT 1;

    SELECT id
    INTO v_shipper_id
    FROM auth.users
    WHERE lower(email) = lower('shipper@test.com')
    LIMIT 1;

    SELECT id
    INTO v_customer_id
    FROM auth.users
    WHERE lower(email) = lower('customer@test.com')
    LIMIT 1;

    -- ========================================================
    -- 2. VALIDATE USERS
    -- ========================================================

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy admin@test.com';
    END IF;

    IF v_shipper_id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy shipper@test.com';
    END IF;

    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy customer@test.com';
    END IF;

    -- ========================================================
    -- 3. UPSERT PROFILES
    -- ========================================================

    INSERT INTO public.profiles (
        id,
        email,
        account_type,
        name,
        phone,
        is_active
    )
    VALUES (
        v_admin_id,
        'admin@test.com',
        'platform_admin',
        'GreenBridge Admin',
        '',
        true
    )
    ON CONFLICT (id)
    DO UPDATE SET
        email = EXCLUDED.email,
        account_type = EXCLUDED.account_type,
        name = EXCLUDED.name,
        is_active = true,
        updated_at = now();

    INSERT INTO public.profiles (
        id,
        email,
        account_type,
        name,
        phone,
        is_active
    )
    VALUES (
        v_shipper_id,
        'shipper@test.com',
        'shop_user',
        'GreenBridge Shipper',
        '',
        true
    )
    ON CONFLICT (id)
    DO UPDATE SET
        email = EXCLUDED.email,
        account_type = EXCLUDED.account_type,
        name = EXCLUDED.name,
        is_active = true,
        updated_at = now();

    INSERT INTO public.profiles (
        id,
        email,
        account_type,
        name,
        phone,
        is_active
    )
    VALUES (
        v_customer_id,
        'customer@test.com',
        'customer',
        'GreenBridge Customer',
        '',
        true
    )
    ON CONFLICT (id)
    DO UPDATE SET
        email = EXCLUDED.email,
        account_type = EXCLUDED.account_type,
        name = EXCLUDED.name,
        is_active = true,
        updated_at = now();

    -- ========================================================
    -- 4. GET SHOP
    -- ========================================================

    SELECT id
    INTO v_shop_id
    FROM public.shops
    WHERE slug = 'greenbridge-main'
      AND is_active = true
    LIMIT 1;

    IF v_shop_id IS NULL THEN
        RAISE EXCEPTION 'Không tìm thấy greenbridge-main';
    END IF;

    -- ========================================================
    -- 5. ADMIN -> OWNER
    -- ========================================================

    INSERT INTO public.shop_members (
        shop_id,
        user_id,
        member_role,
        status
    )
    VALUES (
        v_shop_id,
        v_admin_id,
        'owner',
        'active'
    )
    ON CONFLICT (shop_id, user_id)
    DO UPDATE SET
        member_role = 'owner',
        status = 'active',
        updated_at = now();

    -- ========================================================
    -- 6. SHIPPER -> SHIPPER
    -- ========================================================

    INSERT INTO public.shop_members (
        shop_id,
        user_id,
        member_role,
        status
    )
    VALUES (
        v_shop_id,
        v_shipper_id,
        'shipper',
        'active'
    )
    ON CONFLICT (shop_id, user_id)
    DO UPDATE SET
        member_role = 'shipper',
        status = 'active',
        updated_at = now();

END $$;

-- ============================================================
-- VERIFY
-- ============================================================

SELECT
    p.email,
    p.name,
    p.account_type,
    p.is_active,
    sm.member_role,
    sm.status,
    s.name AS shop_name,
    s.slug AS shop_slug
FROM public.profiles p
LEFT JOIN public.shop_members sm
    ON sm.user_id = p.id
LEFT JOIN public.shops s
    ON s.id = sm.shop_id
WHERE p.email IN (
    'admin@test.com',
    'shipper@test.com',
    'customer@test.com'
)
ORDER BY p.email;