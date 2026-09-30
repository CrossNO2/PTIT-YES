-- Migration 10: Supabase Storage Buckets & Tenant-Aware Policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('delivery-proofs', 'delivery-proofs', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('shop-assets', 'shop-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('esg-reports', 'esg-reports', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Re-running this migration is safe.
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users Upload Own Avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users Update Own Avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users Delete Own Avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Shop Assets" ON storage.objects;
DROP POLICY IF EXISTS "Shop Admin Upload Shop Assets" ON storage.objects;
DROP POLICY IF EXISTS "Shop Admin Update Shop Assets" ON storage.objects;
DROP POLICY IF EXISTS "Shop Admin Delete Shop Assets" ON storage.objects;
DROP POLICY IF EXISTS "Assigned Shipper Upload Delivery Proof" ON storage.objects;
DROP POLICY IF EXISTS "Shop Members Read Delivery Proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authorized Read Delivery Proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authorized Upload Delivery Proofs" ON storage.objects;
DROP POLICY IF EXISTS "Shop Admins Read ESG Reports" ON storage.objects;
DROP POLICY IF EXISTS "Shop Staff Read ESG Reports" ON storage.objects;
DROP POLICY IF EXISTS "Shop Staff Upload ESG Reports" ON storage.objects;

-- avatars/{user_id}/filename
CREATE POLICY "Public Read Avatars" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
CREATE POLICY "Users Upload Own Avatar" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users Update Own Avatar" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users Delete Own Avatar" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- shop-assets/{shop_id}/filename
CREATE POLICY "Public Read Shop Assets" ON storage.objects FOR SELECT
USING (bucket_id = 'shop-assets');
CREATE POLICY "Shop Admin Upload Shop Assets" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shop-assets' AND
  EXISTS (SELECT 1 FROM public.shop_members sm
          WHERE sm.shop_id::text = (storage.foldername(name))[1]
            AND sm.user_id = auth.uid() AND sm.member_role IN ('owner','admin') AND sm.status='active')
);
CREATE POLICY "Shop Admin Update Shop Assets" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'shop-assets' AND
  EXISTS (SELECT 1 FROM public.shop_members sm
          WHERE sm.shop_id::text = (storage.foldername(name))[1]
            AND sm.user_id = auth.uid() AND sm.member_role IN ('owner','admin') AND sm.status='active')
)
WITH CHECK (
  bucket_id = 'shop-assets' AND
  EXISTS (SELECT 1 FROM public.shop_members sm
          WHERE sm.shop_id::text = (storage.foldername(name))[1]
            AND sm.user_id = auth.uid() AND sm.member_role IN ('owner','admin') AND sm.status='active')
);
CREATE POLICY "Shop Admin Delete Shop Assets" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'shop-assets' AND
  EXISTS (SELECT 1 FROM public.shop_members sm
          WHERE sm.shop_id::text = (storage.foldername(name))[1]
            AND sm.user_id = auth.uid() AND sm.member_role IN ('owner','admin') AND sm.status='active')
);

-- delivery-proofs/{shop_id}/{order_id}/filename
CREATE POLICY "Authorized Upload Delivery Proofs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'delivery-proofs' AND array_length(storage.foldername(name),1) >= 2 AND
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[2]
      AND o.shop_id::text = (storage.foldername(name))[1]
      AND (
        o.assigned_shipper_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.shop_members sm
                WHERE sm.shop_id = o.shop_id AND sm.user_id=auth.uid()
                  AND sm.member_role IN ('owner','admin','dispatcher') AND sm.status='active')
      )
  )
);
CREATE POLICY "Authorized Read Delivery Proofs" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-proofs' AND array_length(storage.foldername(name),1) >= 2 AND
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[2]
      AND o.shop_id::text = (storage.foldername(name))[1]
      AND (
        o.assigned_shipper_id = auth.uid() OR o.customer_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.shop_members sm
                WHERE sm.shop_id = o.shop_id AND sm.user_id=auth.uid()
                  AND sm.member_role IN ('owner','admin','dispatcher') AND sm.status='active')
      )
  )
);

-- esg-reports/{shop_id}/filename
CREATE POLICY "Shop Staff Read ESG Reports" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='esg-reports' AND
  EXISTS (SELECT 1 FROM public.shop_members sm
          WHERE sm.shop_id::text=(storage.foldername(name))[1]
            AND sm.user_id=auth.uid() AND sm.member_role IN ('owner','admin','dispatcher') AND sm.status='active')
);
CREATE POLICY "Shop Staff Upload ESG Reports" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='esg-reports' AND
  EXISTS (SELECT 1 FROM public.shop_members sm
          WHERE sm.shop_id::text=(storage.foldername(name))[1]
            AND sm.user_id=auth.uid() AND sm.member_role IN ('owner','admin') AND sm.status='active')
);
