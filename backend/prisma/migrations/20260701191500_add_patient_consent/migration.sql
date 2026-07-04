-- CreateEnum
CREATE TYPE "ConsentVisibility" AS ENUM ('VISIBLE', 'CLINICIAN_ONLY', 'EMERGENCY_ONLY');

-- CreateEnum
CREATE TYPE "AccessGrantStatus" AS ENUM ('ACTIVE', 'PENDING', 'REVOKED');

-- CreateEnum
CREATE TYPE "AccessGrantLevel" AS ENUM ('STANDARD', 'FULL', 'EMERGENCY');

-- CreateTable
CREATE TABLE "ConsentProfile" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "shareWithCareTeam" BOOLEAN NOT NULL DEFAULT true,
    "allowEmergencyOverride" BOOLEAN NOT NULL DEFAULT true,
    "patientNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRule" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "category" "SensitiveCategory" NOT NULL,
    "visibility" "ConsentVisibility" NOT NULL DEFAULT 'VISIBLE',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "status" "AccessGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "level" "AccessGrantLevel" NOT NULL DEFAULT 'STANDARD',
    "grantedBy" TEXT,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAudit" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "category" "SensitiveCategory",
    "emergency" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentProfile_patientId_key" ON "ConsentProfile"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRule_patientId_category_key" ON "ConsentRule"("patientId", "category");

-- CreateIndex
CREATE INDEX "AccessGrant_patientId_institutionName_idx" ON "AccessGrant"("patientId", "institutionName");

-- CreateIndex
CREATE INDEX "AccessAudit_patientId_createdAt_idx" ON "AccessAudit"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsentProfile" ADD CONSTRAINT "ConsentProfile_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRule" ADD CONSTRAINT "ConsentRule_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAudit" ADD CONSTRAINT "AccessAudit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
