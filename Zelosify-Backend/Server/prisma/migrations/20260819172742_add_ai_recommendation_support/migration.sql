-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Opening" ADD COLUMN     "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "hiringProfile" ADD COLUMN     "recommendationStatus" "RecommendationStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "profileId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "toolInvocations" JSONB NOT NULL,
    "structuredOutput" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_profileId_idx" ON "AgentRun"("profileId");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE INDEX "hiringProfile_recommendationStatus_idx" ON "hiringProfile"("recommendationStatus");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hiringProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
