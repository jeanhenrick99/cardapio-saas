-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementKind" AS ENUM ('SANGRIA', 'SUPRIMENTO');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cashRegisterId" TEXT,
ADD COLUMN     "paymentMethod" TEXT;

-- AlterTable
ALTER TABLE "Tab" ADD COLUMN     "cashRegisterId" TEXT;

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" TEXT NOT NULL,
    "openingCents" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "countedCents" INTEGER,
    "expectedCashCents" INTEGER,
    "summary" JSONB,
    "notes" TEXT,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "kind" "CashMovementKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRegister_restaurantId_openedAt_idx" ON "CashRegister"("restaurantId", "openedAt");

-- CreateIndex
CREATE INDEX "CashMovement_registerId_idx" ON "CashMovement"("registerId");

-- CreateIndex
CREATE INDEX "Order_restaurantId_createdAt_idx" ON "Order"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_cashRegisterId_idx" ON "Order"("cashRegisterId");

-- CreateIndex
CREATE INDEX "Tab_restaurantId_closedAt_idx" ON "Tab"("restaurantId", "closedAt");

-- CreateIndex
CREATE INDEX "Tab_cashRegisterId_idx" ON "Tab"("cashRegisterId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tab" ADD CONSTRAINT "Tab_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Só um caixa aberto por restaurante (índice parcial; o Prisma não representa).
CREATE UNIQUE INDEX "CashRegister_one_open" ON "CashRegister"("restaurantId") WHERE "status" = 'OPEN';

-- Pedidos antigos: copia a forma de pagamento do JSON para a nova coluna.
UPDATE "Order" SET "paymentMethod" = NULLIF("data"->>'paymentMethod', '') WHERE "paymentMethod" IS NULL;
