-- Fix orphaned visits from today that have no VisitGroup.
-- Groups them by company name and creates VisitGroups.

DO $$
DECLARE
  rec RECORD;
  new_group_id TEXT;
BEGIN
  -- For each distinct company among today's orphaned visits
  FOR rec IN
    SELECT DISTINCT COALESCE("visitorCompany", 'individual-' || "id") AS company_key
    FROM "Visit"
    WHERE "visitGroupId" IS NULL
      AND "visitedAt" >= CURRENT_DATE
  LOOP
    -- Create a new VisitGroup
    new_group_id := 'vg-fix-' || substr(md5(rec.company_key || random()::text), 1, 20);

    INSERT INTO "VisitGroup" ("id", "status", "createdAt", "updatedAt")
    VALUES (new_group_id, 'active', NOW(), NOW());

    -- Link all orphaned visits with this company to the new group
    UPDATE "Visit"
    SET "visitGroupId" = new_group_id
    WHERE "visitGroupId" IS NULL
      AND "visitedAt" >= CURRENT_DATE
      AND COALESCE("visitorCompany", 'individual-' || "id") = rec.company_key;
  END LOOP;
END $$;
