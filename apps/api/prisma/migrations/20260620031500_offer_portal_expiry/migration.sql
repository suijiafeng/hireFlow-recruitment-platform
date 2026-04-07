-- AlterEnum
ALTER TYPE "OfferApprovalStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "extendedOnce" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portalToken" TEXT;

-- AlterTable
ALTER TABLE "Onboarding" ADD COLUMN     "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Offer_portalToken_key" ON "Offer"("portalToken");

-- CreateIndex
CREATE UNIQUE INDEX "Onboarding_portalToken_key" ON "Onboarding"("portalToken");

