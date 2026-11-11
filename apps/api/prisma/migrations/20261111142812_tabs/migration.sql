-- CreateEnum
CREATE TYPE "TabKind" AS ENUM ('MESA', 'COMANDA');

-- CreateEnum
CREATE TYPE "TabStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "tabId" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "serviceFeePercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "tableCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Tab" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kind" "TabKind" NOT NULL,
    "number" TEXT NOT NULL,
    "status" "TabStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "paymentMethod" TEXT,
    "subtotalCents" INTEGER,
    "serviceFeeCents" INTEGER,
    "discountCents" INTEGER,
    "totalCents" INTEGER,

    CONSTRAINT "Tab_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tab_restaurantId_status_idx" ON "Tab"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Order_tabId_idx" ON "Order"("tabId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "Tab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tab" ADD CONSTRAINT "Tab_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No máximo UMA conta aberta por mesa/comanda. O Prisma não declara índice parcial,
-- então ele fica aqui: dois garçons abrindo a mesma mesa ao mesmo tempo → uma conta só.
CREATE UNIQUE INDEX "Tab_one_open_per_number" ON "Tab"("restaurantId", "kind", "number") WHERE "status" = 'OPEN';
