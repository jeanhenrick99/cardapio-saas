-- CreateTable
CREATE TABLE "TabPayment" (
    "id" TEXT NOT NULL,
    "tabId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "TabPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TabPayment_tabId_idx" ON "TabPayment"("tabId");

-- AddForeignKey
ALTER TABLE "TabPayment" ADD CONSTRAINT "TabPayment_tabId_fkey" FOREIGN KEY ("tabId") REFERENCES "Tab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Contas já fechadas: um pagamento com a forma e o total registrados.
INSERT INTO "TabPayment" ("id", "tabId", "method", "amountCents", "createdAt", "createdBy")
SELECT gen_random_uuid()::text, "id", COALESCE(NULLIF("paymentMethod", ''), 'Não informado'), COALESCE("totalCents", 0),
       COALESCE("closedAt", CURRENT_TIMESTAMP), COALESCE("closedBy", '')
FROM "Tab"
WHERE "status" = 'CLOSED' AND COALESCE("totalCents", 0) > 0;
