-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "deliveryMinutes" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "minOrderCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pickupMinutes" INTEGER NOT NULL DEFAULT 30;
