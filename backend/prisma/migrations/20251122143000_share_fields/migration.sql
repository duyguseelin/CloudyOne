-- PostgreSQL compatible migration
-- Add shareToken and shareExpiresAt if they do not exist, and create a filtered unique index for shareToken
-- Add textual share token and expiry (if not already present)
ALTER TABLE "File"
  ADD COLUMN IF NOT EXISTS "shareToken" TEXT,
  ADD COLUMN IF NOT EXISTS "shareExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sharePermission" TEXT,
  ADD COLUMN IF NOT EXISTS "shareOpenCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shareLastOpenedAt" TIMESTAMP(3);

-- Create a filtered unique index for shareToken (only for non-null values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'File'
      AND indexname = 'File_shareToken_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX "File_shareToken_key" ON "File" ("shareToken") WHERE "shareToken" IS NOT NULL';
  END IF;
END
$$;

-- Note: The actual enum type for sharePermission (if using a DB enum) may be created in a later migration
-- This migration uses TEXT for sharePermission to remain compatible; later migrations may convert it to a typed enum.

-- 20251122143000_share_fields
-- PostgreSQL uyumlu migration: File tablosuna paylaşım alanları ekleme

ALTER TABLE "File"
  ADD COLUMN IF NOT EXISTS "shareToken" TEXT,
  ADD COLUMN IF NOT EXISTS "shareExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sharePermission" TEXT,
  ADD COLUMN IF NOT EXISTS "shareOpenCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "shareLastOpenedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "File_shareToken_key"
  ON "File"("shareToken")
  WHERE "shareToken" IS NOT NULL;

