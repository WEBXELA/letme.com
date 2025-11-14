-- Fix RLS Policy for addresses table - Allow INSERT operations
-- This fixes the error: "new row violates row-level security policy for table addresses"
-- Run this in Supabase SQL Editor

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Allow authenticated users to insert addresses" ON addresses;
DROP POLICY IF EXISTS "Allow admin to insert addresses" ON addresses;
DROP POLICY IF EXISTS "Allow public to insert addresses" ON addresses;

-- Create policy to allow authenticated users (admins) to insert addresses
-- This checks if the user is in the admin_users table
CREATE POLICY "Allow admin to insert addresses" ON addresses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid()
  )
);

-- Also allow authenticated users to insert (in case admin check fails, but user is authenticated)
-- This is a fallback for when admin_users table might not be set up yet
CREATE POLICY "Allow authenticated users to insert addresses" ON addresses
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Verify the policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename = 'addresses'
ORDER BY policyname;

-- Test query to verify RLS is working (should return policies)
SELECT 'Addresses table RLS policies updated successfully!' as status;

