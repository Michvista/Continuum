-- CreateEnum
CREATE TYPE "FragmentSourceType" AS ENUM ('CLINICAL_NOTE', 'LAB_RESULT', 'PRESCRIPTION', 'VOICE_NOTE', 'SCANNED_DOCUMENT', 'TEXT_MESSAGE');

-- CreateEnum
CREATE TYPE "SensitiveCategory" AS ENUM ('NONE', 'MENTAL_HEALTH', 'REPRODUCTIVE_HEALTH', 'SUBSTANCE_USE', 'HIV_STATUS', 'INTIMATE_PARTNER_VIOLENCE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fragment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "originInstitution" TEXT NOT NULL,
    "originAuthor" TEXT,
    "sourceType" "FragmentSourceType" NOT NULL,
    "content" TEXT NOT NULL,
    "sourceFileUrl" TEXT,
    "sensitiveCategory" "SensitiveCategory" NOT NULL DEFAULT 'NONE',
    "conflictsWithId" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphSyncLog" (
    "id" TEXT NOT NULL,
    "fragmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GraphSyncLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragment" ADD CONSTRAINT "Fragment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fragment" ADD CONSTRAINT "Fragment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
