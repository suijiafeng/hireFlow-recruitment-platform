-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ContractSignStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Onboarding" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "checklist" JSONB,
    "documents" JSONB,
    "ocrResults" JSONB,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "onboardingId" TEXT NOT NULL,
    "templateName" TEXT,
    "variables" JSONB,
    "signStatus" "ContractSignStatus" NOT NULL DEFAULT 'DRAFT',
    "evidenceNo" TEXT,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Onboarding_applicationId_key" ON "Onboarding"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_onboardingId_key" ON "Contract"("onboardingId");

-- AddForeignKey
ALTER TABLE "Onboarding" ADD CONSTRAINT "Onboarding_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "Onboarding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
