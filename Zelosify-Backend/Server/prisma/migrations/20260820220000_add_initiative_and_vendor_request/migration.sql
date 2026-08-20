-- CreateTable
-- Digital initiative requests submitted by BUSINESS_USER persona (multi-tenant).
CREATE TABLE "DigitalInitiative" (
    "id" TEXT NOT NULL,
    "requestIdentifier" TEXT NOT NULL,
    "initiativeTitle" TEXT NOT NULL,
    "businessRationale" TEXT NOT NULL,
    "enterpriseResourceCount" INTEGER NOT NULL,
    "resourceDuration" INTEGER NOT NULL,
    "successCriteria" JSONB NOT NULL,
    "timeline" JSONB NOT NULL,
    "additionalComments" TEXT,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalInitiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Vendor resource requests managed by the VENDOR_MANAGER persona (multi-tenant).
CREATE TABLE "VendorRequest" (
    "id" TEXT NOT NULL,
    "requestIdentifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requestedSkills" TEXT[],
    "contractType" TEXT,
    "location" TEXT,
    "experienceMin" INTEGER NOT NULL DEFAULT 0,
    "experienceMax" INTEGER,
    "resourceCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "vendorManagerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalInitiative_requestIdentifier_key" ON "DigitalInitiative"("requestIdentifier");

-- CreateIndex
CREATE INDEX "DigitalInitiative_tenantId_idx" ON "DigitalInitiative"("tenantId");

-- CreateIndex
CREATE INDEX "DigitalInitiative_userId_idx" ON "DigitalInitiative"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRequest_requestIdentifier_key" ON "VendorRequest"("requestIdentifier");

-- CreateIndex
CREATE INDEX "VendorRequest_tenantId_idx" ON "VendorRequest"("tenantId");

-- CreateIndex
CREATE INDEX "VendorRequest_vendorManagerId_idx" ON "VendorRequest"("vendorManagerId");

-- AddForeignKey
ALTER TABLE "DigitalInitiative" ADD CONSTRAINT "DigitalInitiative_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequest" ADD CONSTRAINT "VendorRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenants"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
