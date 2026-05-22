-- AlterEnum
ALTER TYPE "BookingPlan" ADD VALUE 'HOUR';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "hourlyRate" DOUBLE PRECISION,
ADD COLUMN     "name" TEXT,
ALTER COLUMN "dailyRate" DROP NOT NULL,
ALTER COLUMN "weeklyRate" DROP NOT NULL,
ALTER COLUMN "monthlyRate" DROP NOT NULL;
