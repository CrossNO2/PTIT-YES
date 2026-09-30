INSERT INTO public.warehouses (
    shop_id,
    name,
    address,
    lat,
    lng,
    is_default,
    status
)
SELECT
    s.id,
    'GreenBridge Main Hub',
    'Hà Nội, Việt Nam',
    21.0278,
    105.8342,
    true,
    'active'
FROM public.shops s
WHERE s.slug = 'greenbridge-main'
  AND NOT EXISTS (
      SELECT 1
      FROM public.warehouses w
      WHERE w.shop_id = s.id
        AND w.is_default = true
  );

SELECT
    w.id,
    w.name,
    w.address,
    w.is_default,
    w.status
FROM public.warehouses w
JOIN public.shops s ON s.id = w.shop_id
WHERE s.slug = 'greenbridge-main';