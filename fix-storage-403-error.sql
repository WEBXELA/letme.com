-- Fix 403 Error for Storage Uploads
-- Run this in Supabase SQL Editor to fix the storage upload permission issues
-- This script will ensure authenticated users can upload images to both buckets

-- Step 1: Drop all existing policies for these buckets to start fresh
DO $$ 
BEGIN
    -- Drop property-images policies
    DROP POLICY IF EXISTS "Allow public read access to property images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to upload property images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to update property images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to delete property images" ON storage.objects;
    
    -- Drop unit-images policies
    DROP POLICY IF EXISTS "Allow public read access to unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to upload unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to update unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to delete unit images" ON storage.objects;
END $$;

-- Step 2: Ensure buckets exist and are public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES 
  ('property-images', 'property-images', true, 5242880, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES 
  ('unit-images', 'unit-images', true, 5242880, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- Step 3: Create permissive policies for property-images bucket
-- Public read access
CREATE POLICY "Public read access for property images"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

-- Authenticated users can upload to property-images bucket (any path)
CREATE POLICY "Authenticated users can upload property images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images' 
  AND auth.role() = 'authenticated'
);

-- Authenticated users can update property images
CREATE POLICY "Authenticated users can update property images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'property-images' 
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'property-images' 
  AND auth.role() = 'authenticated'
);

-- Authenticated users can delete property images
CREATE POLICY "Authenticated users can delete property images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images' 
  AND auth.role() = 'authenticated'
);

-- Step 4: Create permissive policies for unit-images bucket
-- Public read access
CREATE POLICY "Public read access for unit images"
ON storage.objects FOR SELECT
USING (bucket_id = 'unit-images');

-- Authenticated users can upload to unit-images bucket (any path)
CREATE POLICY "Authenticated users can upload unit images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'unit-images' 
  AND auth.role() = 'authenticated'
);

-- Authenticated users can update unit images
CREATE POLICY "Authenticated users can update unit images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'unit-images' 
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'unit-images' 
  AND auth.role() = 'authenticated'
);

-- Authenticated users can delete unit images
CREATE POLICY "Authenticated users can delete unit images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'unit-images' 
  AND auth.role() = 'authenticated'
);

-- Step 5: Verify the setup
SELECT 
  'Storage buckets and policies configured successfully!' as status,
  (SELECT COUNT(*) FROM storage.buckets WHERE id IN ('property-images', 'unit-images')) as buckets_created,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%property%' OR policyname LIKE '%unit%') as policies_created;

-- List all policies for verification
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND (policyname LIKE '%property%' OR policyname LIKE '%unit%')
ORDER BY policyname;

