-- ============================================================
-- tuckzed mods — Supabase Database & Storage Setup
-- Copy and run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- ============================================================

-- 1. Create the `mods` table
CREATE TABLE IF NOT EXISTS public.mods (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT DEFAULT '1.0.0',
  game TEXT NOT NULL,         -- 'ac' or 'beamng'
  category TEXT NOT NULL,     -- 'Cars', 'Tracks', 'Maps', 'Physics'
  download_url TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  images JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'admin'
);

-- If the table already exists, ensure the `images` column is added:
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.mods ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read mods on the website
CREATE POLICY "Public Read Mods" 
  ON public.mods 
  FOR SELECT 
  USING (true);

-- Allow inserting, updating, and deleting mods
CREATE POLICY "Allow Manage Mods" 
  ON public.mods 
  FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- 3. Create a public storage bucket for mod cover images
INSERT INTO storage.buckets (id, name, public)
VALUES ('mod-covers', 'mod-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage policies: anyone can view cover images
CREATE POLICY "Public Read Cover Images" 
  ON storage.objects 
  FOR SELECT 
  USING (bucket_id = 'mod-covers');

-- Allow uploading, updating, and deleting cover images
CREATE POLICY "Allow Upload Cover Images" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (bucket_id = 'mod-covers');

CREATE POLICY "Allow Update Cover Images" 
  ON storage.objects 
  FOR UPDATE 
  USING (bucket_id = 'mod-covers');

CREATE POLICY "Allow Delete Cover Images" 
  ON storage.objects 
  FOR DELETE 
  USING (bucket_id = 'mod-covers');
