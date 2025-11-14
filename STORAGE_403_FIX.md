# Fix 403 Error for Image Uploads

## Problem
When trying to add a property or unit with 5 images, you get a 403 (Forbidden) error. This is a storage permissions issue in Supabase.

## Solution

### Step 1: Run the SQL Fix Script

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Open the file `fix-storage-403-error.sql` from this project
4. Copy and paste the entire SQL script into the SQL Editor
5. Click **Run** to execute the script

This script will:
- ✅ Drop existing restrictive storage policies
- ✅ Create new permissive policies for authenticated users
- ✅ Ensure buckets are configured correctly
- ✅ Set up proper file size limits and MIME type restrictions

### Step 2: Verify the Fix

After running the script:

1. Go to **Storage** in your Supabase Dashboard
2. You should see two buckets:
   - `property-images` (public)
   - `unit-images` (public)

3. Check the policies:
   - Go to **Storage** > **Policies**
   - You should see policies allowing authenticated users to upload/update/delete

### Step 3: Test the Upload

1. Go to your admin page (`/admin`)
2. Try adding a property with 5 images
3. The upload should now work without 403 errors

## What Changed in the Code

The code has been updated to:
- ✅ Verify user authentication before uploading
- ✅ Provide better error messages for 403 errors
- ✅ Handle image upload failures gracefully
- ✅ Ensure Images field is always valid JSON or null

## Troubleshooting

If you still get 403 errors after running the SQL script:

1. **Check Authentication**: Make sure you're logged in to the admin panel
2. **Check Bucket Existence**: Verify both buckets exist in Storage
3. **Check Policies**: Go to Storage > Policies and verify the policies were created
4. **Check Browser Console**: Look for detailed error messages in the browser console

## Additional Notes

- The storage buckets are set to **public** for read access
- Only **authenticated users** can upload/update/delete images
- Maximum file size is **5MB** per image
- Allowed formats: **JPEG, JPG, PNG, WEBP**

