-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "prescreen" JSONB,
ADD COLUMN     "prescreenToken" TEXT;

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "portalToken" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "scorecardTemplate" JSONB;

-- CreateTable
CREATE TABLE "InterviewerSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "bookedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewerSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCache" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewerSlot_userId_startAt_idx" ON "InterviewerSlot"("userId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiCache_capability_hash_key" ON "AiCache"("capability", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "Application_prescreenToken_key" ON "Application"("prescreenToken");

-- CreateIndex
CREATE UNIQUE INDEX "Interview_portalToken_key" ON "Interview"("portalToken");

-- AddForeignKey
ALTER TABLE "InterviewerSlot" ADD CONSTRAINT "InterviewerSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

