-- Quote attachments (files attached to a quote)
-- Stored base64 in DB so the feature works on Vercel without separate blob storage.
-- If attachments grow beyond a few MB each, migrate to Vercel Blob / S3 and drop the `data` column.

CREATE TABLE IF NOT EXISTS "QuoteAttachment" (
  "id"            TEXT PRIMARY KEY,
  "quoteId"       TEXT NOT NULL,
  "filename"      TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL,
  "size"          INTEGER NOT NULL,
  "data"          TEXT NOT NULL,
  "uploadedById"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteAttachment_quoteId_fkey" FOREIGN KEY ("quoteId")
    REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "QuoteAttachment_quoteId_idx" ON "QuoteAttachment"("quoteId");
