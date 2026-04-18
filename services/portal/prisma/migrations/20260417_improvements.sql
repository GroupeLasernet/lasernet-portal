-- Improvements table for problem-solving & feature tracking
CREATE TABLE "Improvement" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "priority"    TEXT NOT NULL DEFAULT 'medium',
    "status"      TEXT NOT NULL DEFAULT 'new',
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Improvement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Improvement_status_idx" ON "Improvement"("status");
CREATE INDEX "Improvement_priority_idx" ON "Improvement"("priority");
ALTER TABLE "Improvement" ADD CONSTRAINT "Improvement_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
