-- AlterTable
-- Adds a durable, persisted attempt counter to hiringProfile so that
-- recommendation attempts survive process restarts and are bounded globally.
ALTER TABLE "hiringProfile" ADD COLUMN "recommendationAttemptCount" INTEGER NOT NULL DEFAULT 0;
