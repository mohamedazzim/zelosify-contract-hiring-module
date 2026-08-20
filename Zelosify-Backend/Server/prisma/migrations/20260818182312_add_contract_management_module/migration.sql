-- CreateEnum
CREATE TYPE "OpeningStatus" AS ENUM ('OPEN', 'CLOSED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('SUBMITTED', 'SHORTLISTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Opening" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "contractType" TEXT,
    "hiringManagerId" TEXT NOT NULL,
    "experienceMin" INTEGER NOT NULL,
    "experienceMax" INTEGER,
    "postedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedCompletionDate" TIMESTAMP(3),
    "actionDate" TIMESTAMP(3),
    "status" "OpeningStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "Opening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hiringProfile" (
    "id" SERIAL NOT NULL,
    "openingId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ProfileStatus" NOT NULL DEFAULT 'SUBMITTED',
    "shortlistedBy" TEXT,
    "shortlistedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "recommended" BOOLEAN,
    "recommendationScore" DOUBLE PRECISION,
    "recommendationReason" TEXT,
    "recommendationLatencyMs" INTEGER,
    "recommendationVersion" TEXT,
    "recommendationConfidence" DOUBLE PRECISION,
    "recommendedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hiringProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opening_tenantId_idx" ON "Opening"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "hiringProfile_s3Key_key" ON "hiringProfile"("s3Key");

-- CreateIndex
CREATE INDEX "hiringProfile_openingId_idx" ON "hiringProfile"("openingId");

-- CreateIndex
CREATE INDEX "hiringProfile_recommended_idx" ON "hiringProfile"("recommended");

-- AddForeignKey
ALTER TABLE "Opening" ADD CONSTRAINT "Opening_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hiringProfile" ADD CONSTRAINT "hiringProfile_openingId_fkey" FOREIGN KEY ("openingId") REFERENCES "Opening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
