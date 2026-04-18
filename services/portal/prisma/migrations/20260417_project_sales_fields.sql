-- Add project-level sales fields to LeadProject
ALTER TABLE "LeadProject" ADD COLUMN "callbackReason" TEXT;
ALTER TABLE "LeadProject" ADD COLUMN "suggestedProducts" TEXT;
ALTER TABLE "LeadProject" ADD COLUMN "objective" TEXT;
ALTER TABLE "LeadProject" ADD COLUMN "budget" DOUBLE PRECISION;
