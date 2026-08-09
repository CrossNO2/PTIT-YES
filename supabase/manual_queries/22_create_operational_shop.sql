-- ============================================================
-- GREENBRIDGE AI — CREATE OPERATIONAL SHOP
-- Safe to run multiple times
-- ============================================================

INSERT INTO public.shops (
    name,
    slug,
    address,
    lat,
    lng,
    logo_url,
    is_active
)
VALUES (
    'GreenBridge AI',
    'greenbridge-main',
    'Hà Nội, Việt Nam',
    21.0278,
    105.8342,
    NULL,
    true
)
ON CONFLICT (slug)
DO UPDATE SET
    name = EXCLUDED.name,
    is_active = true,
    updated_at = now();

-- Verify
SELECT
    id,
    name,
    slug,
    address,
    lat,
    lng,
    is_active
FROM public.shops
WHERE slug = 'greenbridge-main';