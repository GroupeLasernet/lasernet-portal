-- Add access schedule fields to User
ALTER TABLE "User" ADD COLUMN "accessAlways" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "accessTimeFrom" TEXT;
ALTER TABLE "User" ADD COLUMN "accessTimeTo" TEXT;
ALTER TABLE "User" ADD COLUMN "accessDays" TEXT;
ALTER TABLE "User" ADD COLUMN "accessDateFrom" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "accessDateTo" TIMESTAMP(3);
