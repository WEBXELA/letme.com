-- COMPLETE RLS FIX - Fixes all Row Level Security issues
-- This fixes:
-- 1. Addresses table INSERT permission (403 error when adding property)
-- 2. Storage bucket upload permissions
-- 3. All admin access policies
-- Run this ENTIRE script in Supabase SQL Editor

-- ============================================
-- PART 1: Fix addresses table RLS policies
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to insert addresses" ON addresses;
DROP POLICY IF EXISTS "Allow admin to insert addresses" ON addresses;
DROP POLICY IF EXISTS "Allow public to insert addresses" ON addresses;
DROP POLICY IF EXISTS "Allow admin to update addresses" ON addresses;
DROP POLICY IF EXISTS "Allow admin to delete addresses" ON addresses;

-- Allow authenticated users (admins) to insert addresses
CREATE POLICY "Allow authenticated users to insert addresses" ON addresses
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow admins to update addresses
CREATE POLICY "Allow admin to update addresses" ON addresses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid()
  )
);

-- Allow admins to delete addresses
CREATE POLICY "Allow admin to delete addresses" ON addresses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid()
  )
);

-- ============================================
-- PART 2: Fix storage bucket policies
-- ============================================

-- Drop all existing storage policies
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Allow public read access to property images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to upload property images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to update property images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to delete property images" ON storage.objects;
    DROP POLICY IF EXISTS "Public read access for property images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload property images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can update property images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can delete property images" ON storage.objects;
    
    DROP POLICY IF EXISTS "Allow public read access to unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to upload unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to update unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Allow authenticated users to delete unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Public read access for unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can upload unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can update unit images" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can delete unit images" ON storage.objects;
END $$;

-- Ensure buckets exist
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

-- Create storage policies for property-images
CREATE POLICY "Public read access for property images"
ON storage.objects FOR SELECT
USING (bucket_id = 'property-images');

CREATE POLICY "Authenticated users can upload property images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images' 
  AND auth.role() = 'authenticated'
);

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

CREATE POLICY "Authenticated users can delete property images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images' 
  AND auth.role() = 'authenticated'
);

-- Create storage policies for unit-images
CREATE POLICY "Public read access for unit images"
ON storage.objects FOR SELECT
USING (bucket_id = 'unit-images');

CREATE POLICY "Authenticated users can upload unit images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'unit-images' 
  AND auth.role() = 'authenticated'
);

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

CREATE POLICY "Authenticated users can delete unit images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'unit-images' 
  AND auth.role() = 'authenticated'
);

-- ============================================
-- PART 3: Verify all policies
-- ============================================

-- Verify addresses policies
SELECT 
  'Addresses policies:' as info,
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'addresses'
ORDER BY policyname;

-- Verify storage policies
SELECT 
  'Storage policies:' as info,
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND (policyname LIKE '%property%' OR policyname LIKE '%unit%')
ORDER BY policyname;

-- Final status
SELECT '✅ ALL RLS POLICIES FIXED SUCCESSFULLY!' as status;

